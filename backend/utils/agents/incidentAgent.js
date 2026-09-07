const { getDb } = require('../../db/database');

// ============================================================
// INCIDENT AGENT
// Computes a priority label + urgency score for an incident from its
// severity, type, and (for existing incidents) how long it has sat
// unresolved — and decides whether it should be escalated. Also
// scans all open incidents for patterns worth surfacing as an
// operational alert (clusters, aging incidents, critical backlog).
// ============================================================

// ============================================================
// CRITICAL ALERTS — "require immediate action." A fixed set of
// situations that must always be treated as critical, even when the
// generic severity/type/age formula below wouldn't otherwise reach
// that threshold (e.g. a large-scale registration failure logged at
// severity 4 under "technical" only scores ~64 normally — but this is
// exactly the kind of thing that needs to jump the queue).
// ============================================================
const CRITICAL_ALERT_PATTERNS = [
  { reason: 'Medical emergency', test: (i) => i.type === 'medical' && i.severity >= 4 },
  { reason: 'Security emergency', test: (i) => i.type === 'security' && i.severity >= 4 },
  { reason: 'Major system failure', test: (i) => i.type === 'technical' && i.severity >= 5 },
  { reason: 'Venue evacuation', test: (i) => /evacuat/i.test(`${i.category || ''} ${i.description || ''}`) },
  { reason: 'Large-scale registration failure', test: (i) =>
      /registration|check-?in/i.test(`${i.category || ''} ${i.description || ''}`) && i.severity >= 4 },
];

// Returns the matching pattern's reason string, or null if none match.
function detectCriticalAlert(incident) {
  const normalized = { ...incident, severity: Math.min(5, Math.max(1, Number(incident.severity) || 3)) };
  const match = CRITICAL_ALERT_PATTERNS.find((p) => p.test(normalized));
  return match ? match.reason : null;
}

const TYPE_RISK = {
  medical: 1.4,
  security: 1.3,
  technical: 1.0,
  logistics: 0.8,
  other: 0.9,
};

// Responsible-team auto-assignment ("Assign Responsible Team" step).
const TEAM_MAP = {
  medical: 'Medical Team',
  security: 'Security Team',
  technical: 'IT Team',
  logistics: 'Logistics Team',
  other: 'Event Management',
};

function assignTeam(type, category) {
  const cat = (category || '').toLowerCase();
  if (cat.includes('registration') || cat.includes('check-in') || cat.includes('checkin')) {
    return 'Registration & IT Team';
  }
  return TEAM_MAP[type] || TEAM_MAP.other;
}

// Suggested next step ("recommend switching to backup/manual check-in"-style
// guidance), based on type/category/severity.
function recommendAction(type, category, severity) {
  const cat = (category || '').toLowerCase();
  if ((cat.includes('registration') || cat.includes('check-in') || cat.includes('checkin')) && severity >= 4) {
    return 'Switch to backup/manual check-in until the system is restored, and notify arriving attendees of the delay.';
  }
  if (type === 'medical') return 'Dispatch on-site medical staff immediately and clear the area around the incident.';
  if (type === 'security') return 'Alert security personnel, secure the area, and restrict access until cleared.';
  if (type === 'technical') return 'Engage on-call technical support and prepare a manual fallback process if downtime continues.';
  if (type === 'logistics') return 'Reassign available staff to cover the affected area and notify the logistics lead.';
  return 'Assign a team member to investigate and provide a status update within the escalation window.';
}

// Minutes an unresolved incident can sit at a given severity before
// it's considered overdue for escalation.
const ESCALATION_MINUTES = { 5: 10, 4: 20, 3: 45, 2: 90, 1: 180 };

function minutesSince(isoString) {
  return (Date.now() - new Date(isoString).getTime()) / 60000;
}

function priorityLabel(urgencyScore) {
  if (urgencyScore >= 80) return 'critical';
  if (urgencyScore >= 55) return 'high';
  if (urgencyScore >= 30) return 'medium';
  return 'low';
}

// Computes { priority, urgencyScore, escalate, criticalAlertReason } for a
// fresh or existing incident. A matched Critical Alert pattern always wins,
// forcing priority to 'critical' and immediate escalation regardless of
// what the generic weighted score would otherwise produce.
function computePriority(incident) {
  const criticalAlertReason = detectCriticalAlert(incident);
  if (criticalAlertReason) {
    const isOpen = incident.status === 'open' || incident.status === 'in_progress' || incident.status === 'escalated';
    return { priority: 'critical', urgencyScore: 100, escalate: isOpen, criticalAlertReason };
  }

  const severity = Math.min(5, Math.max(1, Number(incident.severity) || 3));
  const risk = TYPE_RISK[incident.type] || TYPE_RISK.other;
  let score = severity * 16 * risk; // severity 1-5, risk ~0.8-1.4 → up to ~112, clamp below

  const isOpen = incident.status === 'open' || incident.status === 'in_progress' || incident.status === 'escalated';
  let ageMinutes = 0;
  if (isOpen && incident.reported_at) {
    ageMinutes = minutesSince(incident.reported_at);
    const threshold = ESCALATION_MINUTES[severity] || 60;
    // Ageing adds up to +25 points as an unresolved incident approaches/exceeds its threshold.
    score += Math.min(25, (ageMinutes / threshold) * 25);
  }

  const urgencyScore = Math.min(100, Math.round(score));
  const priority = priorityLabel(urgencyScore);
  const threshold = ESCALATION_MINUTES[severity] || 60;
  const escalate = isOpen && (severity >= 5 || ageMinutes > threshold);

  return { priority, urgencyScore, escalate, criticalAlertReason: null };
}

// Scans all non-resolved incidents for an event and produces a list of
// plain-language operational alerts, each tagged with a severity level.
function generateAlerts(eventId) {
  const db = getDb();
  const incidents = db
    .prepare("SELECT * FROM incidents WHERE event_id = ? AND status IN ('open','in_progress','escalated') ORDER BY reported_at DESC")
    .all(eventId);

  const alerts = [];

  // Critical Alerts — named situations that require immediate action
  // (medical/security emergency, major system failure, venue evacuation,
  // large-scale registration failure). Surfaced individually, first,
  // ahead of every other alert type.
  incidents
    .filter((i) => i.is_critical_alert)
    .forEach((i) => {
      alerts.push({
        level: 'critical',
        critical: true,
        incidentId: i.id,
        message: `CRITICAL — ${i.alert_reason}: "${i.description}"${i.location ? ' at ' + i.location : ''}. Requires immediate action.`,
      });
    });

  const critical = incidents.filter((i) => i.priority === 'critical' && !i.is_critical_alert);
  if (critical.length > 0) {
    alerts.push({
      level: 'critical',
      message: `${critical.length} additional critical-priority incident${critical.length > 1 ? 's' : ''} currently open — immediate attention needed.`,
    });
  }

  const overdue = incidents.filter((i) => {
    const threshold = ESCALATION_MINUTES[Math.min(5, Math.max(1, i.severity))] || 60;
    return minutesSince(i.reported_at) > threshold;
  });
  if (overdue.length > 0) {
    alerts.push({
      level: 'high',
      message: `${overdue.length} incident${overdue.length > 1 ? 's have' : ' has'} been open longer than its escalation threshold and should be escalated.`,
    });
  }

  // Cluster detection: 3+ incidents of the same type at the same location.
  const clusters = {};
  incidents.forEach((i) => {
    const key = `${i.type}::${(i.location || 'unspecified').toLowerCase()}`;
    clusters[key] = (clusters[key] || 0) + 1;
  });
  Object.entries(clusters).forEach(([key, count]) => {
    if (count >= 3) {
      const [type, location] = key.split('::');
      alerts.push({
        level: 'medium',
        message: `${count} ${type} incidents reported at ${location} — possible recurring issue worth investigating on-site.`,
      });
    }
  });

  const openCount = incidents.filter((i) => i.status === 'open').length;
  if (openCount >= 5) {
    alerts.push({
      level: 'medium',
      message: `${openCount} incidents are still unassigned/open — consider adding on-site staff capacity.`,
    });
  }

  return alerts;
}

// GENERATE INCIDENT REPORT — a structured summary once an incident is
// resolved/verified/closed: what happened, who handled it, and how long
// it took at each stage. Computed on demand from the stored columns
// rather than persisted separately.
function buildIncidentReport(incident) {
  const reportedAt = incident.reported_at ? new Date(incident.reported_at) : null;
  const resolvedAt = incident.resolved_at ? new Date(incident.resolved_at) : null;
  const closedAt = incident.closed_at ? new Date(incident.closed_at) : null;

  const resolutionMinutes = reportedAt && resolvedAt
    ? Math.round((resolvedAt - reportedAt) / 60000)
    : null;
  const totalMinutes = reportedAt && closedAt
    ? Math.round((closedAt - reportedAt) / 60000)
    : null;

  return {
    id: incident.id,
    type: incident.type,
    category: incident.category || null,
    description: incident.description,
    location: incident.location || null,
    severity: incident.severity,
    priority: incident.priority,
    isCriticalAlert: !!incident.is_critical_alert,
    alertReason: incident.alert_reason || null,
    assignedTeam: incident.assigned_team || null,
    recommendedAction: incident.recommended_action || null,
    status: incident.status,
    reportedAt: incident.reported_at,
    notifiedAt: incident.notified_at,
    resolutionNotes: incident.resolution_notes || null,
    resolvedAt: incident.resolved_at,
    verifiedAt: incident.verified_at,
    closedAt: incident.closed_at,
    resolutionMinutes,
    totalMinutes,
    summary: (incident.is_critical_alert ? `[CRITICAL ALERT — ${incident.alert_reason}] ` : '')
      + `${incident.type}${incident.category ? '/' + incident.category : ''} incident (${incident.priority} priority) `
      + `handled by ${incident.assigned_team || 'an unassigned team'}. `
      + (resolutionMinutes != null ? `Resolved in ${resolutionMinutes} minute(s). ` : 'Not yet resolved. ')
      + (totalMinutes != null ? `Closed after ${totalMinutes} minute(s) total.` : ''),
  };
}

module.exports = {
  computePriority,
  generateAlerts,
  assignTeam,
  recommendAction,
  buildIncidentReport,
  detectCriticalAlert,
  CRITICAL_ALERT_PATTERNS,
  TYPE_RISK,
  ESCALATION_MINUTES,
};
