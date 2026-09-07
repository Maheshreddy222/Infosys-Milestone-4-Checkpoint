const { getDb } = require('../db/database');

function generateSpeakerId() {
  return 'spk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Speakers are a shared resource, visible across every event — not just
// the one that happened to be active when they were added.
function listSpeakers(req, res) {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM speakers ORDER BY created_at DESC').all();
  res.json(rows);
}

function createSpeaker(req, res) {
  const db = getDb();
  const { eventId } = req.params;
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) return res.status(404).json({ error: 'event not found' });

  const b = req.body || {};
  if (!b.name || !b.expertise) {
    return res.status(400).json({ error: 'name and expertise are required' });
  }
  if (!b.contactNumber || !b.contactNumber.trim()) {
    return res.status(400).json({ error: 'contact number is required' });
  }

  const id = generateSpeakerId();
  db.prepare(
    `INSERT INTO speakers (id, event_id, name, contact_number, expertise, language, experience_years, fee,
      engagement_score, available_dates, available_start, available_end, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id, eventId, b.name.trim(), b.contactNumber.trim(), b.expertise.trim(), b.language || 'English',
    Number(b.experienceYears) || 0, Number(b.fee) || 0, Number(b.engagementScore) || 3,
    (b.availableDates || '').trim(), b.availableStart || '', b.availableEnd || '',
    new Date().toISOString()
  );

  res.status(201).json(db.prepare('SELECT * FROM speakers WHERE id = ?').get(id));
}

// SPEAKER AGENT — ranks speakers against a topic/requirement profile.
// Handles the "multiple speakers suitable for the same topic" case by
// scoring topic relevance, language proficiency, experience, prior
// audience feedback, and budget fit — with availability as a hard filter.
function recommend(req, res) {
  const { recommendSpeakers } = require('../utils/agents/speakerAgent');
  const { eventId } = req.params;
  const db = getDb();
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) return res.status(404).json({ error: 'event not found' });

  const b = req.body || {};
  const results = recommendSpeakers(eventId, {
    topic: b.topic || '',
    date: b.date || '',
    startTime: b.startTime || '',
    endTime: b.endTime || '',
    budget: Number(b.budget) || 0,
    languagePreference: b.languagePreference || '',
  });

  res.json({ count: results.length, results });
}

module.exports = { listSpeakers, createSpeaker, recommend };
