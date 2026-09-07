const { getDb } = require('../../db/database');

// ============================================================
// SPONSORSHIP AGENT
// Ranks sponsors on file against a sponsorship need — category,
// budget needed, and (optionally) a minimum tier — combining
// category relevance, contribution/budget fit, reliability (past
// performance) and audience engagement into one explainable score.
// ============================================================

const WEIGHTS = {
  category: 30,
  contribution: 25,
  reliability: 25,
  engagement: 20,
};

const TIER_RANK = { Platinum: 4, Gold: 3, Silver: 2, Bronze: 1 };

function scoreCategory(sponsor, category) {
  if (!category) return WEIGHTS.category;
  const a = (sponsor.category || '').toLowerCase();
  const b = category.toLowerCase();
  if (!a) return Math.round(WEIGHTS.category * 0.3);
  if (a === b) return WEIGHTS.category;
  if (a.includes(b) || b.includes(a)) return Math.round(WEIGHTS.category * 0.75);
  return Math.round(WEIGHTS.category * 0.25);
}

function scoreContribution(sponsor, budgetNeeded) {
  if (!budgetNeeded) return WEIGHTS.contribution;
  if (sponsor.contribution_amount <= 0) return 0;
  const ratio = sponsor.contribution_amount / budgetNeeded;
  // Full points once the sponsor covers the need; partial credit below that.
  return Math.round(WEIGHTS.contribution * Math.min(1, ratio));
}

function scoreReliability(sponsor) {
  return Math.round(WEIGHTS.reliability * (Math.min(5, Math.max(1, sponsor.reliability_score)) / 5));
}

function scoreEngagement(sponsor) {
  return Math.round(WEIGHTS.engagement * (Math.min(5, Math.max(1, sponsor.engagement_score)) / 5));
}

function buildReasoning(sponsor, req) {
  const bits = [];
  if (req.category) bits.push(`category match: "${sponsor.category || 'unspecified'}"`);
  bits.push(`$${sponsor.contribution_amount} contribution, ${sponsor.tier} tier`);
  bits.push(`${sponsor.reliability_score}/5 reliability, ${sponsor.engagement_score}/5 engagement`);
  if (sponsor.deliverables_fulfilled_pct != null) bits.push(`${sponsor.deliverables_fulfilled_pct}% of past deliverables fulfilled`);
  return `Recommended: ${bits.join('; ')}.`;
}

// ============================================================
// SPONSOR PERFORMANCE DASHBOARD
// engagement_score (1-5) is expressed as a percentage for display,
// combined with deliverable fulfillment into an overall performance
// label — mirroring: Sponsor A 92%/100% → Excellent, B 76%/90% → Good,
// C 48%/70% → At Risk.
// ============================================================
function engagementPct(sponsor) {
  return Math.round((Math.min(5, Math.max(1, sponsor.engagement_score)) / 5) * 100);
}

function performanceStatus(sponsor) {
  const combined = (engagementPct(sponsor) + sponsor.deliverables_fulfilled_pct) / 2;
  if (combined >= 85) return 'Excellent';
  if (combined >= 65) return 'Good';
  return 'At Risk';
}

function dashboardRow(sponsor) {
  return {
    id: sponsor.id,
    name: sponsor.name,
    tier: sponsor.tier,
    engagementPct: engagementPct(sponsor),
    leadsGenerated: sponsor.leads_generated,
    deliverablesFulfilledPct: sponsor.deliverables_fulfilled_pct,
    boothVisits: sponsor.booth_visits,
    conversionRate: sponsor.conversion_rate,
    roiIndicator: sponsor.roi_indicator,
    satisfactionScore: sponsor.satisfaction_score,
    performance: performanceStatus(sponsor),
  };
}

// AI capability: flag sponsors that "require attention" and suggest a
// concrete action — same pattern as the dashboard example (Sponsor C).
function generateSponsorAlerts(eventId) {
  const db = getDb();
  const sponsors = db.prepare('SELECT * FROM sponsors').all() /* sponsors are shared across all events */;
  const alerts = [];

  sponsors.forEach((sponsor) => {
    const status = performanceStatus(sponsor);
    if (status !== 'At Risk') return;

    const reasons = [];
    if (engagementPct(sponsor) < 65) reasons.push('lower engagement than expected');
    if (sponsor.deliverables_fulfilled_pct < 65) reasons.push('deliverables behind schedule');
    if (sponsor.leads_generated === 0) reasons.push('no leads generated yet');

    const action = engagementPct(sponsor) < sponsor.deliverables_fulfilled_pct
      ? 'increasing attendee interaction activities at the sponsor booth'
      : 'increasing booth visibility or providing additional promotional opportunities';

    alerts.push({
      level: 'medium',
      sponsorId: sponsor.id,
      message: `${sponsor.name} requires attention${reasons.length ? ' (' + reasons.join(', ') + ')' : ''}. Consider ${action}.`,
    });
  });

  return alerts;
}

function getDashboard(eventId) {
  const db = getDb();
  const sponsors = db.prepare('SELECT * FROM sponsors').all() /* sponsors are shared across all events */;
  return {
    rows: sponsors.map(dashboardRow),
    alerts: generateSponsorAlerts(eventId),
  };
}

function recommendSponsors(eventId, requirements) {
  const db = getDb();
  const { category = '', budgetNeeded = 0, minTier = '' } = requirements;

  let sponsors = db.prepare('SELECT * FROM sponsors').all() /* sponsors are shared across all events */;

  if (minTier && TIER_RANK[minTier]) {
    sponsors = sponsors.filter((s) => (TIER_RANK[s.tier] || 0) >= TIER_RANK[minTier]);
  }

  const results = sponsors.map((sponsor) => {
    const breakdown = {
      category: scoreCategory(sponsor, category),
      contribution: scoreContribution(sponsor, budgetNeeded),
      reliability: scoreReliability(sponsor),
      engagement: scoreEngagement(sponsor),
    };
    const total = Math.min(100, Object.values(breakdown).reduce((a, b) => a + b, 0));
    return { sponsor, score: total, breakdown, reasoning: buildReasoning(sponsor, { category }) };
  });

  results.sort((a, b) => b.score - a.score || b.sponsor.contribution_amount - a.sponsor.contribution_amount);
  return results;
}

module.exports = { recommendSponsors, getDashboard, generateSponsorAlerts, performanceStatus, WEIGHTS, TIER_RANK };
