const { getDb } = require('../db/database');
const { computePriority, generateAlerts, assignTeam, recommendAction, buildIncidentReport } = require('../utils/agents/incidentAgent');

function generateIncidentId() {
  return 'inc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Recomputes priority/urgency for every still-open incident before
// returning them, so ageing incidents' priority is always current — this
// is what powers "real-time" prioritization rather than a stale snapshot.
function refreshPriorities(db, incidents) {
  incidents.forEach((i) => {
    if (i.status === 'open' || i.status === 'in_progress' || i.status === 'escalated') {
      const { priority, urgencyScore, criticalAlertReason } = computePriority(i);
      const isCritical = criticalAlertReason ? 1 : 0;
      if (priority !== i.priority || urgencyScore !== i.urgency_score || isCritical !== i.is_critical_alert) {
        db.prepare('UPDATE incidents SET priority = ?, urgency_score = ?, is_critical_alert = ?, alert_reason = ? WHERE id = ?')
          .run(priority, urgencyScore, isCritical, criticalAlertReason || i.alert_reason || '', i.id);
        i.priority = priority;
        i.urgency_score = urgencyScore;
        i.is_critical_alert = isCritical;
        if (criticalAlertReason) i.alert_reason = criticalAlertReason;
      }
    }
  });
  return incidents;
}

function listIncidents(req, res) {
  const db = getDb();
  const { eventId } = req.params;
  const { status } = req.query;
  let incidents = db.prepare('SELECT * FROM incidents WHERE event_id = ? ORDER BY reported_at DESC').all(eventId);
  incidents = refreshPriorities(db, incidents);
  if (status) incidents = incidents.filter((i) => i.status === status);
  // Highest urgency first among still-open ones; resolved/verified/closed sink to the bottom.
  const OPEN_STATES = ['open', 'in_progress', 'escalated'];
  incidents.sort((a, b) => {
    const aOpen = OPEN_STATES.includes(a.status);
    const bOpen = OPEN_STATES.includes(b.status);
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    return b.urgency_score - a.urgency_score;
  });
  res.json(incidents);
}

// INCIDENT MANAGEMENT WORKFLOW.
// Following the suggested workflow (Incident Detected → Logged →
// Categorized → Severity Determined → Priority Assigned → Responsible
// Team Assigned → Notify Team), everything up through notification
// happens automatically the moment an incident is logged.
function createIncident(req, res) {
  const db = getDb();
  const { eventId } = req.params;
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) return res.status(404).json({ error: 'event not found' });

  const b = req.body || {};
  if (!b.description || !b.type) {
    return res.status(400).json({ error: 'type and description are required' });
  }

  const severity = Math.min(5, Math.max(1, Number(b.severity) || 3));
  const category = (b.category || '').trim();
  const reported_at = new Date().toISOString();
  const { priority, urgencyScore, escalate, criticalAlertReason } = computePriority({
    type: b.type, category, description: b.description, severity, status: 'open', reported_at,
  });

  const assignedTeam = assignTeam(b.type, category);
  const action = recommendAction(b.type, category, severity);
  const notified_at = new Date().toISOString(); // "Notify Team" — automatic

  const id = generateIncidentId();
  db.prepare(
    `INSERT INTO incidents (id, event_id, type, category, description, location, severity, priority, urgency_score,
      assigned_team, recommended_action, is_critical_alert, alert_reason, status, reported_by, reported_at, notified_at,
      resolution_notes, resolved_at, verified_at, closed_at, created_at)
     VALUES (?,?,?,?,?,?,?,?,?, ?,?, ?,?, ?, ?,?,?, '', NULL, NULL, NULL, ?)`
  ).run(
    id, eventId, b.type, category, b.description.trim(), b.location || '', severity, priority, urgencyScore,
    assignedTeam, action, criticalAlertReason ? 1 : 0, criticalAlertReason || '',
    escalate ? 'escalated' : 'open', b.reportedBy || '', reported_at, notified_at,
    reported_at
  );

  const incident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(id);
  res.status(201).json({
    incident,
    message: criticalAlertReason
      ? `CRITICAL ALERT — ${criticalAlertReason}. Assigned to ${assignedTeam} and escalated immediately. Requires immediate action.`
      : escalate
      ? `Incident logged, assigned to ${assignedTeam}, and immediately escalated (priority: ${priority}).`
      : `Incident logged and assigned to ${assignedTeam} (priority: ${priority}).`,
  });
}

// Workflow transitions: open/escalated → in_progress (investigate) →
// resolved (needs resolutionNotes) → verified → closed. Escalation can
// also be set manually at any open stage.
function updateStatus(req, res) {
  const db = getDb();
  const { eventId, incidentId } = req.params;
  const incident = db.prepare('SELECT * FROM incidents WHERE id = ? AND event_id = ?').get(incidentId, eventId);
  if (!incident) return res.status(404).json({ error: 'incident not found' });

  const { status, resolutionNotes } = req.body || {};
  if (!['open', 'in_progress', 'resolved', 'verified', 'closed', 'escalated'].includes(status)) {
    return res.status(400).json({ error: 'invalid status' });
  }
  if (status === 'resolved' && !resolutionNotes && !incident.resolution_notes) {
    return res.status(400).json({ error: 'resolution notes are required to resolve an incident' });
  }

  const now = new Date().toISOString();
  const updates = { status };
  if (status === 'resolved') { updates.resolved_at = now; if (resolutionNotes) updates.resolution_notes = resolutionNotes; }
  if (status === 'verified') updates.verified_at = now;
  if (status === 'closed') updates.closed_at = now;

  const setClause = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE incidents SET ${setClause} WHERE id = ?`).run(...Object.values(updates), incidentId);

  res.json(db.prepare('SELECT * FROM incidents WHERE id = ?').get(incidentId));
}

// GENERATE INCIDENT REPORT — structured summary for a single incident.
function getReport(req, res) {
  const db = getDb();
  const { eventId, incidentId } = req.params;
  const incident = db.prepare('SELECT * FROM incidents WHERE id = ? AND event_id = ?').get(incidentId, eventId);
  if (!incident) return res.status(404).json({ error: 'incident not found' });
  res.json(buildIncidentReport(incident));
}

// INTELLIGENT OPERATIONAL ALERTS — pattern-scan currently open incidents.
function alerts(req, res) {
  const { eventId } = req.params;
  const db = getDb();
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) return res.status(404).json({ error: 'event not found' });

  const incidents = db.prepare('SELECT * FROM incidents WHERE event_id = ?').all(eventId);
  refreshPriorities(db, incidents);

  res.json({ alerts: generateAlerts(eventId) });
}

module.exports = { listIncidents, createIncident, updateStatus, getReport, alerts };
