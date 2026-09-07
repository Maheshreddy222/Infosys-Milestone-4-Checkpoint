const { getDb } = require('../db/database');

// Every attendee THIS account has registered, across ALL events — used by
// the Events page ("Registered" vs "Register") and by My Schedule (which
// shows all future registrations regardless of which event is active).
function getMyRegistrations(req, res) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT a.*, e.name AS event_name, e.date AS event_date, e.venue AS event_venue, e.code AS event_code
       FROM attendees a
       JOIN events e ON e.id = a.event_id
       WHERE a.registered_by = ?
       ORDER BY e.date ASC`
    )
    .all(req.user.id);
  res.json(rows);
}

module.exports = { getMyRegistrations };
