const { getDb } = require('../db/database');

function generateVenueId() {
  return 'ven_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Venues are a shared resource, visible across every event — not just the
// one that happened to be active when they were added.
function listVenues(req, res) {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM venues ORDER BY created_at DESC').all();
  res.json(rows);
}

function createVenue(req, res) {
  const db = getDb();
  const { eventId } = req.params;
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) return res.status(404).json({ error: 'event not found' });

  const b = req.body || {};
  if (!b.name || !b.capacity) {
    return res.status(400).json({ error: 'name and capacity are required' });
  }
  if (!b.contactNumber || !b.contactNumber.trim()) {
    return res.status(400).json({ error: 'contact number is required' });
  }

  const id = generateVenueId();
  db.prepare(
    `INSERT INTO venues (id, event_id, name, location, contact_number, capacity, cost_per_day, event_types,
      wifi, projector, air_conditioning, seating_comfort, stage, power_outlets,
      accessibility, cleanliness, safety_security, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id, eventId, b.name.trim(), b.location || '', b.contactNumber.trim(), Number(b.capacity) || 0, Number(b.costPerDay) || 0,
    (b.eventTypes || '').trim(),
    b.wifi ? 1 : 0, b.projector ? 1 : 0, b.airConditioning ? 1 : 0,
    Number(b.seatingComfort) || 3, b.stage ? 1 : 0, b.powerOutlets ? 1 : 0,
    Number(b.accessibility) || 3, Number(b.cleanliness) || 3, Number(b.safetySecurity) || 3,
    new Date().toISOString()
  );

  res.status(201).json(db.prepare('SELECT * FROM venues WHERE id = ?').get(id));
}

// VENUE AGENT — ranks venues against a requirement profile.
function recommend(req, res) {
  const { recommendVenues } = require('../utils/agents/venueAgent');
  const { eventId } = req.params;
  const db = getDb();
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) return res.status(404).json({ error: 'event not found' });

  const b = req.body || {};
  const results = recommendVenues(eventId, {
    eventType: b.eventType || '',
    expectedAttendees: Number(b.expectedAttendees) || 0,
    budget: Number(b.budget) || 0,
    date: b.date || '',
    startTime: b.startTime || '',
    endTime: b.endTime || '',
    requiredFacilities: b.requiredFacilities || {},
    accessibilityNeeded: !!b.accessibilityNeeded,
    locationPreference: b.locationPreference || '',
  });

  res.json({ count: results.length, results });
}

module.exports = { listVenues, createVenue, recommend };
