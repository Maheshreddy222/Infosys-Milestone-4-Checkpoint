const { getDb } = require('../db/database');
const { computePriority } = require('../utils/agents/incidentAgent');
const { closeExpiredRegistrations, isEventDatePassed, isRegistrationOpen } = require('../utils/eventStatus');

// REAL-TIME MONITORING DASHBOARD + ANALYTICAL REPORTS
// Combines incident stats and sponsor performance into one operations view.
function getOperationsAnalytics(req, res) {
  const db = getDb();
  const { eventId } = req.params;
  closeExpiredRegistrations(db);
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) return res.status(404).json({ error: 'event not found' });

  // --- Incidents ---
  let incidents = db.prepare('SELECT * FROM incidents WHERE event_id = ?').all(eventId);
  incidents.forEach((i) => {
    if (i.status === 'open' || i.status === 'in_progress') {
      const { priority, urgencyScore } = computePriority(i);
      i.priority = priority;
      i.urgency_score = urgencyScore;
    }
  });

  const totalIncidents = incidents.length;
  const openIncidents = incidents.filter((i) => i.status === 'open' || i.status === 'in_progress').length;
  const escalatedIncidents = incidents.filter((i) => i.status === 'escalated').length;
  const resolvedIncidents = incidents.filter((i) => i.status === 'resolved');

  const criticalAlerts = incidents
    .filter((i) => i.is_critical_alert && ['open', 'in_progress', 'escalated'].includes(i.status))
    .map((i) => ({ id: i.id, reason: i.alert_reason, description: i.description, location: i.location }));

  const byType = {};
  incidents.forEach((i) => { byType[i.type] = (byType[i.type] || 0) + 1; });

  const byPriority = { critical: 0, high: 0, medium: 0, low: 0 };
  incidents.forEach((i) => { if (byPriority[i.priority] != null) byPriority[i.priority] += 1; });

  const resolutionTimesMin = resolvedIncidents
    .filter((i) => i.resolved_at)
    .map((i) => (new Date(i.resolved_at) - new Date(i.reported_at)) / 60000);
  const avgResolutionMinutes = resolutionTimesMin.length
    ? Math.round(resolutionTimesMin.reduce((a, b) => a + b, 0) / resolutionTimesMin.length)
    : null;

  // --- Sponsors ---
  const sponsors = db.prepare('SELECT * FROM sponsors WHERE event_id = ?').all(eventId);
  const totalContribution = sponsors.reduce((sum, s) => sum + s.contribution_amount, 0);
  const avgFulfillment = sponsors.length
    ? Math.round(sponsors.reduce((sum, s) => sum + s.deliverables_fulfilled_pct, 0) / sponsors.length)
    : 0;
  const byTier = {};
  sponsors.forEach((s) => { byTier[s.tier] = (byTier[s.tier] || 0) + 1; });

  const attendance = db.prepare(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN checked_in = 1 THEN 1 ELSE 0 END) AS checkedIn
    FROM attendees WHERE event_id = ?
  `).get(eventId);
  const sessions = db.prepare(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) AS scheduled
    FROM sessions WHERE event_id = ?
  `).get(eventId);
  const registrationOpen = isRegistrationOpen(event);

  res.json({
    event: {
      id: event.id,
      name: event.name,
      date: event.date,
      venue: event.venue,
      registration_open: event.registration_open,
      registrationOpen,
      registrationStatus: registrationOpen ? 'open' : 'closed',
      datePassed: isEventDatePassed(event.date),
    },
    attendance: {
      registered: attendance.total || 0,
      checkedIn: attendance.checkedIn || 0,
      checkInRate: attendance.total ? Math.round((attendance.checkedIn / attendance.total) * 100) : 0,
    },
    sessions: {
      total: sessions.total || 0,
      scheduled: sessions.scheduled || 0,
    },
    incidents: {
      total: totalIncidents,
      open: openIncidents,
      escalated: escalatedIncidents,
      resolved: resolvedIncidents.length,
      byType,
      byPriority,
      avgResolutionMinutes,
      criticalAlerts,
    },
    sponsors: {
      total: sponsors.length,
      totalContribution: Math.round(totalContribution * 100) / 100,
      avgFulfillmentPct: avgFulfillment,
      byTier,
    },
  });
}

// Internal variant used by getOperationsRecommendations() below — computes
// and returns the same summary object directly, without going through the
// Express res.json() response cycle.
function computeOperationsSummary(eventId) {
  const db = getDb();
  let incidents = db.prepare('SELECT * FROM incidents WHERE event_id = ?').all(eventId);
  incidents.forEach((i) => {
    if (i.status === 'open' || i.status === 'in_progress') {
      const { priority, urgencyScore } = computePriority(i);
      i.priority = priority;
      i.urgency_score = urgencyScore;
    }
  });

  const totalIncidents = incidents.length;
  const openIncidents = incidents.filter((i) => i.status === 'open' || i.status === 'in_progress').length;
  const escalatedIncidents = incidents.filter((i) => i.status === 'escalated').length;
  const resolvedIncidents = incidents.filter((i) => i.status === 'resolved');

  const byType = {};
  incidents.forEach((i) => { byType[i.type] = (byType[i.type] || 0) + 1; });

  const byPriority = { critical: 0, high: 0, medium: 0, low: 0 };
  incidents.forEach((i) => { if (byPriority[i.priority] != null) byPriority[i.priority] += 1; });

  const resolutionTimesMin = resolvedIncidents
    .filter((i) => i.resolved_at)
    .map((i) => (new Date(i.resolved_at) - new Date(i.reported_at)) / 60000);
  const avgResolutionMinutes = resolutionTimesMin.length
    ? Math.round(resolutionTimesMin.reduce((a, b) => a + b, 0) / resolutionTimesMin.length)
    : null;

  const sponsors = db.prepare('SELECT * FROM sponsors WHERE event_id = ?').all(eventId);
  const totalContribution = sponsors.reduce((sum, s) => sum + s.contribution_amount, 0);
  const avgFulfillment = sponsors.length
    ? Math.round(sponsors.reduce((sum, s) => sum + s.deliverables_fulfilled_pct, 0) / sponsors.length)
    : 0;
  const byTier = {};
  sponsors.forEach((s) => { byTier[s.tier] = (byTier[s.tier] || 0) + 1; });

  return {
    incidents: { total: totalIncidents, open: openIncidents, escalated: escalatedIncidents, resolved: resolvedIncidents.length, byType, byPriority, avgResolutionMinutes },
    sponsors: { total: sponsors.length, totalContribution: Math.round(totalContribution * 100) / 100, avgFulfillmentPct: avgFulfillment, byTier },
  };
}

// AI-BASED RECOMMENDATIONS for operations — same fetch-with-fallback
// pattern as the attendee insights endpoint.
function fallbackRecommendations(summary, eventId) {
  const recs = [];
  if (summary.incidents.open > 0) {
    recs.push(`${summary.incidents.open} incidents are still open — prioritize the ${summary.incidents.byPriority.critical} critical and ${summary.incidents.byPriority.high} high-priority ones first.`);
  }
  if (summary.incidents.avgResolutionMinutes != null) {
    recs.push(`Average incident resolution time is ${summary.incidents.avgResolutionMinutes} minutes.`);
  }
  const topType = Object.entries(summary.incidents.byType).sort((a, b) => b[1] - a[1])[0];
  if (topType) recs.push(`"${topType[0]}" is the most common incident type (${topType[1]} reports) — consider adding preventive measures.`);
  if (summary.sponsors.total > 0) {
    recs.push(`Sponsors have an average deliverable fulfillment rate of ${summary.sponsors.avgFulfillmentPct}% across ${summary.sponsors.total} sponsor(s).`);
  }
  if (eventId) {
    const { generateSponsorAlerts } = require('../utils/agents/sponsorshipAgent');
    generateSponsorAlerts(eventId).forEach((a) => recs.push(a.message));
  }
  return recs;
}

async function getOperationsRecommendations(req, res) {
  const { eventId } = req.params;
  const db = getDb();
  closeExpiredRegistrations(db);
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) return res.status(404).json({ error: 'event not found' });

  const summary = computeOperationsSummary(eventId);
  if (summary.incidents.total === 0 && summary.sponsors.total === 0) {
    return res.json({ recommendations: [], message: 'No incidents or sponsors recorded yet — nothing to analyze.' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.json({ recommendations: fallbackRecommendations(summary, eventId), source: 'fallback (no ANTHROPIC_API_KEY set)' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content:
            'You are an event operations manager. Given this incident and sponsor data as JSON, ' +
            'return 4-6 short, concrete, actionable recommendations. Respond ONLY with a raw JSON array of strings.\n\n' +
            `Data: ${JSON.stringify(summary)}`,
        }],
      }),
    });
    const data = await response.json();
    const text = (data.content || []).map((b) => b.text || '').join('\n');
    const clean = text.replace(/```json|```/g, '').trim();
    let recs;
    try { recs = JSON.parse(clean); } catch (e) { recs = clean.split('\n').filter((l) => l.trim().length > 8); }
    if (!Array.isArray(recs) || recs.length === 0) throw new Error('empty AI response');
    res.json({ recommendations: recs, source: 'claude-sonnet-4-6' });
  } catch (e) {
    res.json({ recommendations: fallbackRecommendations(summary, eventId), source: 'fallback (AI request failed)' });
  }
}

// LIVE NOTIFICATIONS — a rolling feed for the real-time dashboard: VIP
// arrivals, sessions starting soon, sessions in progress, and what's next.
function getLiveNotifications(req, res) {
  const { generateLiveNotifications } = require('../utils/liveNotifications');
  const { eventId } = req.params;
  const db = getDb();
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) return res.status(404).json({ error: 'event not found' });

  res.json({ notifications: generateLiveNotifications(eventId) });
}

module.exports = { getOperationsAnalytics, getOperationsRecommendations, getLiveNotifications };
