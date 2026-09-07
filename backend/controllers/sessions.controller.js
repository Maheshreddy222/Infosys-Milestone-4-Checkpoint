const { getDb } = require('../db/database');
const { findConflicts } = require('../utils/conflicts');
const { notifyEventAttendees } = require('../utils/emailNotifications');

function generateSessionId() {
  return 'ses_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function listSessions(req, res) {
  const db = getDb();
  const { eventId } = req.params;
  const rows = db
    .prepare(
      `SELECT s.*, v.name AS venue_name, v.capacity AS venue_capacity, v.cost_per_day AS venue_cost,
              sp.name AS speaker_name, sp.fee AS speaker_fee, sp.engagement_score AS speaker_engagement
       FROM sessions s
       LEFT JOIN venues v ON v.id = s.venue_id
       LEFT JOIN speakers sp ON sp.id = s.speaker_id
       WHERE s.event_id = ?
       ORDER BY s.date, s.start_time`
    )
    .all(eventId);
  res.json(rows);
}

// SCHEDULING — creates a session, assigning a venue and/or speaker to a
// topic/time slot. Re-validates conflicts server-side even if the client
// already ran the agents, so a race between two organizers can't double-book.
// A venue and/or speaker assigned this way starts out "pending" — they
// haven't accepted the booking yet (see updateVenueStatus/updateSpeakerStatus).
async function sendScheduleUpdate(db, eventId, subject, text, context) {
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  return notifyEventAttendees(db, event, subject, text, context);
}

async function createSession(req, res) {
  const db = getDb();
  const { eventId } = req.params;
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) return res.status(404).json({ error: 'event not found' });

  const b = req.body || {};
  if (!b.topic || !b.date || !b.startTime || !b.endTime) {
    return res.status(400).json({ error: 'topic, date, startTime and endTime are required' });
  }
  if (b.endTime <= b.startTime) {
    return res.status(400).json({ error: 'end time must be after start time' });
  }

  if (b.venueId) {
    const conflicts = findConflicts(eventId, 'venue_id', b.venueId, b.date, b.startTime, b.endTime);
    if (conflicts.length) {
      return res.status(409).json({ error: `venue is already booked for "${conflicts[0].topic}" at that time` });
    }
    const venue = db.prepare('SELECT * FROM venues WHERE id = ?').get(b.venueId); // venues are shared across events
    if (!venue) return res.status(404).json({ error: 'venue not found' });
    if (b.expectedAttendees && venue.capacity < Number(b.expectedAttendees)) {
      return res.status(409).json({ error: `venue capacity (${venue.capacity}) is below expected attendees (${b.expectedAttendees})` });
    }
  }
  if (b.speakerId) {
    const conflicts = findConflicts(eventId, 'speaker_id', b.speakerId, b.date, b.startTime, b.endTime);
    if (conflicts.length) {
      return res.status(409).json({ error: `speaker is already booked for "${conflicts[0].topic}" at that time` });
    }
    const speaker = db.prepare('SELECT * FROM speakers WHERE id = ?').get(b.speakerId); // speakers are shared across events
    if (!speaker) return res.status(404).json({ error: 'speaker not found' });
  }

  const id = generateSessionId();
  db.prepare(
    `INSERT INTO sessions (id, event_id, topic, venue_id, speaker_id, venue_status, speaker_status,
      date, start_time, end_time, expected_attendees, status, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?, 'scheduled', ?)`
  ).run(
    id, eventId, b.topic.trim(), b.venueId || null, b.speakerId || null,
    b.venueId ? 'pending' : null, b.speakerId ? 'pending' : null,
    b.date, b.startTime, b.endTime, Number(b.expectedAttendees) || 0, new Date().toISOString()
  );

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  const notification = await sendScheduleUpdate(
    db, eventId, `Schedule update: ${event.name}`,
    `A new session has been scheduled for ${event.name}.\n\n${session.topic}\n${session.date}, ${session.start_time}–${session.end_time}`,
    'new session notification'
  );
  res.status(201).json({
    session,
    notification,
    message: `"${b.topic}" scheduled for ${b.date} ${b.startTime}-${b.endTime}.`,
  });
}

// Simulated acceptance response — since venues/speakers don't have their
// own login in this system, the admin captures their response here
// (e.g. after a phone call or email confirmation) and it's recorded
// against the booking.
async function updateVenueStatus(req, res) {
  const db = getDb();
  const { eventId, sessionId } = req.params;
  const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND event_id = ?').get(sessionId, eventId);
  if (!session) return res.status(404).json({ error: 'session not found' });
  if (!session.venue_id) return res.status(400).json({ error: 'this session has no venue assigned' });

  const status = req.body && req.body.status;
  if (!['pending', 'accepted', 'declined'].includes(status)) {
    return res.status(400).json({ error: 'invalid status' });
  }
  db.prepare('UPDATE sessions SET venue_status = ? WHERE id = ?').run(status, sessionId);
  const updated = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  const notification = await sendScheduleUpdate(
    db, eventId, 'Session venue update',
    `The venue status for "${updated.topic}" on ${updated.date} is now ${status}.`,
    'session venue update'
  );
  res.json({ ...updated, notification });
}

async function updateSpeakerStatus(req, res) {
  const db = getDb();
  const { eventId, sessionId } = req.params;
  const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND event_id = ?').get(sessionId, eventId);
  if (!session) return res.status(404).json({ error: 'session not found' });
  if (!session.speaker_id) return res.status(400).json({ error: 'this session has no speaker assigned' });

  const status = req.body && req.body.status;
  if (!['pending', 'accepted', 'declined'].includes(status)) {
    return res.status(400).json({ error: 'invalid status' });
  }
  db.prepare('UPDATE sessions SET speaker_status = ? WHERE id = ?').run(status, sessionId);
  const updated = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  const notification = await sendScheduleUpdate(
    db, eventId, 'Session speaker update',
    `The speaker status for "${updated.topic}" on ${updated.date} is now ${status}.`,
    'session speaker update'
  );
  res.json({ ...updated, notification });
}

// A venue/speaker booking can be cancelled any time BEFORE the event
// actually occurs — not after.
async function cancelSession(req, res) {
  const db = getDb();
  const { eventId, sessionId } = req.params;
  const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND event_id = ?').get(sessionId, eventId);
  if (!session) return res.status(404).json({ error: 'session not found' });
  if (session.date < todayIso()) {
    return res.status(409).json({ error: 'cannot cancel a session that has already occurred' });
  }
  db.prepare("UPDATE sessions SET status = 'cancelled' WHERE id = ?").run(sessionId);
  const updated = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  const notification = await sendScheduleUpdate(
    db, eventId, `Session cancelled: ${updated.topic}`,
    `"${updated.topic}" scheduled for ${updated.date} at ${updated.start_time} has been cancelled.`,
    'session cancellation'
  );
  res.json({ ...updated, notification });
}

module.exports = { listSessions, createSession, updateVenueStatus, updateSpeakerStatus, cancelSession };
