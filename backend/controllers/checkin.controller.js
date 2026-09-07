const { getDb } = require('../db/database');
const { normalizeEmail, normalizePhone } = require('../utils/ids');
const { sendEmailSafely } = require('../utils/emailNotifications');

function findAttendee(db, eventId, code) {
  let lookup = String(code).trim();
  try {
    const parsed = JSON.parse(lookup);
    if (parsed && parsed.id) lookup = parsed.id;
  } catch (e) {
    // Raw ticket ID, email, or phone number.
  }
  return db.prepare(
    `SELECT * FROM attendees WHERE event_id = ?
     AND (LOWER(id) = ? OR email = ? OR phone = ?)`
  ).get(eventId, lookup.toLowerCase(), normalizeEmail(lookup), normalizePhone(lookup));
}

// VOLUNTEER FLOW: scan/type the QR payload, ticket ID, email, or phone.
// VALIDATES the code, rejects unknown/duplicate scans, and CHECKS IN
// the attendee if valid.
async function validateAndCheckin(req, res) {
  const db = getDb();
  const { eventId } = req.params;
  const { code } = req.body || {};

  if (!code || !String(code).trim()) {
    return res.status(400).json({ status: 'error', message: 'a ticket code is required' });
  }

  const attendee = findAttendee(db, eventId, code);

  if (!attendee) {
    return res.status(404).json({
      status: 'not_found',
      message: `"${code}" does not match any registered attendee`,
    });
  }

  if (attendee.checked_in) {
    return res.status(200).json({
      status: 'already_checked_in',
      attendee,
      message: `${attendee.name} already checked in at ${attendee.checked_in_at}`,
    });
  }

  const checked_in_at = new Date().toISOString();
  db.prepare('UPDATE attendees SET checked_in = 1, checked_in_at = ?, checkin_count = checkin_count + 1 WHERE id = ?').run(
    checked_in_at,
    attendee.id
  );
  db.prepare("INSERT INTO attendance_history (attendee_id, event_id, action, occurred_at) VALUES (?, ?, 'checkin', ?)")
    .run(attendee.id, eventId, checked_in_at);
  const updated = db.prepare('SELECT * FROM attendees WHERE id = ?').get(attendee.id);
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  const email = await sendEmailSafely({
    to: updated.email,
    subject: `Checked in: ${event ? event.name : 'your event'}`,
    text: `Hi ${updated.name},\n\nYou checked in successfully${event ? ` for ${event.name}` : ''} at ${checked_in_at}.`,
    context: 'check-in confirmation',
  });

  res.status(200).json({
    status: 'checked_in',
    attendee: updated,
    email,
    message: `${updated.name} checked in successfully`,
  });
}

function checkout(req, res) {
  const db = getDb();
  const { eventId } = req.params;
  const { code } = req.body || {};
  if (!code || !String(code).trim()) {
    return res.status(400).json({ status: 'error', message: 'a ticket code is required' });
  }
  const attendee = findAttendee(db, eventId, code);
  if (!attendee) return res.status(404).json({ status: 'not_found', message: `"${code}" does not match any registered attendee` });
  if (!attendee.checked_in) {
    return res.status(409).json({ status: 'not_checked_in', attendee, message: `${attendee.name} is not currently checked in` });
  }

  const checked_out_at = new Date().toISOString();
  db.prepare(
    'UPDATE attendees SET checked_in = 0, checked_in_at = NULL, last_checked_out_at = ?, checkout_count = checkout_count + 1 WHERE id = ?'
  ).run(checked_out_at, attendee.id);
  db.prepare("INSERT INTO attendance_history (attendee_id, event_id, action, occurred_at) VALUES (?, ?, 'checkout', ?)")
    .run(attendee.id, eventId, checked_out_at);
  const updated = db.prepare('SELECT * FROM attendees WHERE id = ?').get(attendee.id);
  res.json({ status: 'checked_out', attendee: updated, message: `${updated.name} checked out successfully` });
}

module.exports = { validateAndCheckin, checkout };
