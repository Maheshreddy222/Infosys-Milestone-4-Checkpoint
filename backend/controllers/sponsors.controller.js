const { getDb } = require('../db/database');

function generateSponsorId() {
  return 'spn_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Sponsors are a shared resource, visible across every event — not just
// the one that happened to be active when they were added.
function listSponsors(req, res) {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM sponsors ORDER BY created_at DESC').all();
  res.json(rows);
}

function createSponsor(req, res) {
  const db = getDb();
  const { eventId } = req.params;
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) return res.status(404).json({ error: 'event not found' });

  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'sponsor name is required' });

  const id = generateSponsorId();
  db.prepare(
    `INSERT INTO sponsors (id, event_id, name, tier, category, contribution_amount, deliverables_promised,
      deliverables_fulfilled_pct, engagement_score, reliability_score, booth_visits, leads_generated,
      session_participation, social_media_engagement, satisfaction_score, roi_indicator, conversion_rate,
      contact_name, contact_email, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id, eventId, b.name.trim(), b.tier || 'Bronze', (b.category || '').trim(),
    Number(b.contributionAmount) || 0, (b.deliverablesPromised || '').trim(),
    Number(b.deliverablesFulfilledPct) || 0, Number(b.engagementScore) || 3, Number(b.reliabilityScore) || 3,
    Number(b.boothVisits) || 0, Number(b.leadsGenerated) || 0, Number(b.sessionParticipation) || 0,
    Number(b.socialMediaEngagement) || 0, Number(b.satisfactionScore) || 3,
    Number(b.roiIndicator) || 0, Number(b.conversionRate) || 0,
    b.contactName || '', b.contactEmail || '', new Date().toISOString()
  );

  res.status(201).json(db.prepare('SELECT * FROM sponsors WHERE id = ?').get(id));
}

// SPONSOR PERFORMANCE TRACKING — update every tracked metric as the event
// progresses (e.g. after a booth walkthrough or post-event review).
function updatePerformance(req, res) {
  const db = getDb();
  const { eventId, sponsorId } = req.params;
  const sponsor = db.prepare('SELECT * FROM sponsors WHERE id = ?').get(sponsorId);
  if (!sponsor) return res.status(404).json({ error: 'sponsor not found' });

  const b = req.body || {};
  const clamp = (v, lo, hi, fallback) => (v != null ? Math.min(hi, Math.max(lo, Number(v))) : fallback);

  const fulfilled = clamp(b.deliverablesFulfilledPct, 0, 100, sponsor.deliverables_fulfilled_pct);
  const engagement = clamp(b.engagementScore, 1, 5, sponsor.engagement_score);
  const reliability = clamp(b.reliabilityScore, 1, 5, sponsor.reliability_score);
  const boothVisits = b.boothVisits != null ? Number(b.boothVisits) : sponsor.booth_visits;
  const leadsGenerated = b.leadsGenerated != null ? Number(b.leadsGenerated) : sponsor.leads_generated;
  const sessionParticipation = b.sessionParticipation != null ? Number(b.sessionParticipation) : sponsor.session_participation;
  const socialMediaEngagement = b.socialMediaEngagement != null ? Number(b.socialMediaEngagement) : sponsor.social_media_engagement;
  const satisfactionScore = clamp(b.satisfactionScore, 1, 5, sponsor.satisfaction_score);
  const roiIndicator = b.roiIndicator != null ? Number(b.roiIndicator) : sponsor.roi_indicator;
  const conversionRate = b.conversionRate != null ? Number(b.conversionRate) : sponsor.conversion_rate;

  db.prepare(
    `UPDATE sponsors SET deliverables_fulfilled_pct = ?, engagement_score = ?, reliability_score = ?,
      booth_visits = ?, leads_generated = ?, session_participation = ?, social_media_engagement = ?,
      satisfaction_score = ?, roi_indicator = ?, conversion_rate = ? WHERE id = ?`
  ).run(
    fulfilled, engagement, reliability, boothVisits, leadsGenerated, sessionParticipation,
    socialMediaEngagement, satisfactionScore, roiIndicator, conversionRate, sponsorId
  );

  res.json(db.prepare('SELECT * FROM sponsors WHERE id = ?').get(sponsorId));
}

// SPONSORSHIP AGENT — ranks sponsors against a category/budget need.
function recommend(req, res) {
  const { recommendSponsors } = require('../utils/agents/sponsorshipAgent');
  const { eventId } = req.params;
  const db = getDb();
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) return res.status(404).json({ error: 'event not found' });

  const b = req.body || {};
  const results = recommendSponsors(eventId, {
    category: b.category || '',
    budgetNeeded: Number(b.budgetNeeded) || 0,
    minTier: b.minTier || '',
  });

  res.json({ count: results.length, results });
}

// SPONSOR PERFORMANCE DASHBOARD — Sponsor | Engagement | Leads | Deliverables
// | Performance table, plus "requires attention" alerts with a suggested action.
function dashboard(req, res) {
  const { getDashboard } = require('../utils/agents/sponsorshipAgent');
  const { eventId } = req.params;
  const db = getDb();
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) return res.status(404).json({ error: 'event not found' });

  res.json(getDashboard(eventId));
}

// CONTACT SPONSOR — sends a real email FROM checkpoint.noreply@gmail.com
// (or whichever account is configured) TO the sponsor's contact email,
// via Gmail SMTP (utils/mailer.js). If email isn't configured on this
// server, responds with a distinct code so the frontend can fall back
// to opening a Gmail compose tab instead.
async function contactSponsor(req, res) {
  const { sendMail, isConfigured } = require('../utils/mailer');
  const db = getDb();
  const { eventId, sponsorId } = req.params;
  const sponsor = db.prepare('SELECT * FROM sponsors WHERE id = ?').get(sponsorId);
  if (!sponsor) return res.status(404).json({ error: 'sponsor not found' });
  if (!sponsor.contact_email) return res.status(400).json({ error: 'this sponsor has no contact email on file' });

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  const b = req.body || {};
  const subject = b.subject || `Sponsorship — ${sponsor.name} × ${event ? event.name : 'our event'}`;
  const text = b.message ||
    `Hi ${sponsor.contact_name || sponsor.name} team,\n\n` +
    `Reaching out regarding your sponsorship for ${event ? event.name : 'our event'}.\n\n`;

  if (!isConfigured()) {
    return res.status(503).json({ error: 'email not configured on this server', code: 'EMAIL_NOT_CONFIGURED' });
  }

  try {
    await sendMail({ to: sponsor.contact_email, subject, text });
    res.json({ sent: true, to: sponsor.contact_email, message: `Email sent to ${sponsor.contact_email}.` });
  } catch (e) {
    res.status(502).json({ error: 'could not send the email — please try again' });
  }
}

module.exports = { listSponsors, createSponsor, updatePerformance, recommend, dashboard, contactSponsor };
