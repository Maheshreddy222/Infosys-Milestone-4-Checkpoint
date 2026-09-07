const { getDb } = require('../db/database');
const { generateEventId, eventCodeFromName } = require('../utils/ids');
const { closeExpiredRegistrations, isEventDatePassed } = require('../utils/eventStatus');

function generateUniqueEventId(db) {
  let id;
  do { id = generateEventId(); } while (db.prepare('SELECT 1 FROM events WHERE id = ?').get(id));
  return id;
}

function generateUniqueEventCode(db, eventName) {
  const base = eventCodeFromName(eventName);
  let code = base;
  let n = 2;
  while (db.prepare('SELECT 1 FROM events WHERE code = ?').get(code)) {
    code = `${base}-${n++}`;
  }
  return code;
}

function listEvents(req, res) {
  const db = getDb();
  closeExpiredRegistrations(db);
  const events = db.prepare('SELECT * FROM events ORDER BY created_at DESC').all();
  res.json(events);
}

function createEvent(req, res) {
  const { name, date, venue, description } = req.body || {};
  if (!name || !date) return res.status(400).json({ error: 'name and date are required' });

  const db = getDb();
  const id = generateUniqueEventId(db);
  const code = generateUniqueEventCode(db, name.trim());
  const created_at = new Date().toISOString();

  db.prepare(`
    INSERT INTO events (id, name, date, venue, description, code, owner_id, registration_open, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name.trim(), date, venue || '', description || '', code, req.user.id, isEventDatePassed(date) ? 0 : 1, created_at);

  res.status(201).json(db.prepare('SELECT * FROM events WHERE id = ?').get(id));
}

function getEvent(req, res) {
  const db = getDb();
  closeExpiredRegistrations(db);
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'event not found' });
  res.json(event);
}

function stopRegistrations(req, res) {
  const db = getDb();
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'event not found' });

  db.prepare('UPDATE events SET registration_open = 0 WHERE id = ?').run(req.params.id);
  res.json({
    message: 'Registrations stopped for this event.',
    event: db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id),
  });
}

function reopenRegistrations(req, res) {
  const db = getDb();
  closeExpiredRegistrations(db);
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'event not found' });
  if (isEventDatePassed(event.date)) {
    return res.status(400).json({ error: 'registrations cannot be reopened after the event date has passed' });
  }

  db.prepare('UPDATE events SET registration_open = 1 WHERE id = ?').run(req.params.id);
  res.json({
    message: 'Registrations reopened for this event.',
    event: db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id),
  });
}

function deleteEvent(req, res) {
  const db = getDb();
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'event not found' });

  // Admin-only route. ON DELETE CASCADE removes event-specific attendees,
  // sessions, incidents, feedback and complaints automatically.
  db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);

  res.json({ message: `Event "${event.name}" deleted successfully.`, id: event.id });
}

module.exports = {
  listEvents,
  createEvent,
  getEvent,
  stopRegistrations,
  reopenRegistrations,
  deleteEvent,
};
