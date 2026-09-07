const { getDb } = require('../db/database');
const {
  generateTicketId,
  normalizeEmail,
  normalizePhone,
} = require('../utils/ids');
const { generateQrDataUrl } = require('../utils/qr');
const { sendEmailSafely } = require('../utils/emailNotifications');
const { closeExpiredRegistrations } = require('../utils/eventStatus');

function listAttendees(req, res) {
  const db = getDb();
  const { eventId } = req.params;
  const { q } = req.query;

  let rows = db
    .prepare('SELECT * FROM attendees WHERE event_id = ? ORDER BY registered_at DESC')
    .all(eventId);

  if (q) {
    const s = String(q).toLowerCase();
    rows = rows.filter(
      (a) =>
        a.name.toLowerCase().includes(s) ||
        a.email.includes(s) ||
        a.phone.includes(s) ||
        a.id.toLowerCase().includes(s)
    );
  }
  res.json(rows);
}

// REQUIRED FIELDS + DUPLICATE EMAIL/PHONE VALIDATION + SERVER-SIDE ID GENERATION
// + QR TICKET GENERATION + CONFIRMATION MESSAGE — all handled here.
async function registerAttendee(req, res) {
  const db = getDb();
  const { eventId } = req.params;

  closeExpiredRegistrations(db);
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) return res.status(404).json({ error: 'event not found' });
  if (event.registration_open === 0) {
    return res.status(403).json({ error: 'registrations are closed for this event' });
  }

  const { name, email, phone, company, ticketType } = req.body || {};

  if (!name || !email || !phone) {
    return res.status(400).json({ error: 'name, email and phone are required' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'please enter a valid email address' });
  }

  const nEmail = normalizeEmail(email);
  const nPhone = normalizePhone(phone);

  if (nPhone.length < 7) {
    return res.status(400).json({ error: 'please enter a valid phone number' });
  }

  const dupEmail = db
    .prepare('SELECT * FROM attendees WHERE event_id = ? AND email = ?')
    .get(eventId, nEmail);
  if (dupEmail) {
    return res
      .status(409)
      .json({ error: `this email is already registered (ticket ${dupEmail.id})` });
  }

  const dupPhone = db
    .prepare('SELECT * FROM attendees WHERE event_id = ? AND phone = ?')
    .get(eventId, nPhone);
  if (dupPhone) {
    return res
      .status(409)
      .json({ error: `this phone number is already registered (ticket ${dupPhone.id})` });
  }

  const count = db
    .prepare('SELECT COUNT(*) as c FROM attendees WHERE event_id = ?')
    .get(eventId).c;
  const id = generateTicketId(event.code, count + 1); // ID GENERATED ON OUR SIDE
  const registered_at = new Date().toISOString();

  db.prepare(
    `INSERT INTO attendees
      (id, event_id, name, email, phone, company, ticket_type, registered_by, registered_at, checked_in, checked_in_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)`
  ).run(
    id, eventId, name.trim(), nEmail, nPhone, company || '',
    ticketType || 'General', req.user ? req.user.id : null, registered_at
  );

  const qrPayload = JSON.stringify({ eventId, id });
  const qrDataUrl = await generateQrDataUrl(qrPayload);

  const attendee = db.prepare('SELECT * FROM attendees WHERE id = ?').get(id);
  const emailNotification = await sendEmailSafely({
    to: attendee.email,
    subject: `Your ticket for ${event.name}`,
    text: `Hi ${attendee.name},\n\nYour registration for ${event.name} on ${event.date} is confirmed.\nTicket ID: ${attendee.id}\nTicket type: ${attendee.ticket_type}\nVenue: ${event.venue || 'To be announced'}\n\nPlease keep this ticket ID or its QR code ready for check-in.`,
    context: 'registration confirmation',
  });

  res.status(201).json({
    attendee,
    qrDataUrl,
    email: emailNotification,
    message: `Registration confirmed for ${attendee.name}. Ticket ID ${id} generated.`,
  });
}

// Manual check-in / undo toggle from the Attendees table (no code needed).
function toggleCheckin(req, res) {
  const db = getDb();
  const { eventId, attendeeId } = req.params;

  const attendee = db
    .prepare('SELECT * FROM attendees WHERE id = ? AND event_id = ?')
    .get(attendeeId, eventId);
  if (!attendee) return res.status(404).json({ error: 'attendee not found' });

  const now = new Date().toISOString();
  if (attendee.checked_in) {
    db.prepare(
      'UPDATE attendees SET checked_in = 0, checked_in_at = NULL, last_checked_out_at = ?, checkout_count = checkout_count + 1 WHERE id = ?'
    ).run(now, attendeeId);
    db.prepare("INSERT INTO attendance_history (attendee_id, event_id, action, occurred_at) VALUES (?, ?, 'checkout', ?)")
      .run(attendeeId, eventId, now);
  } else {
    db.prepare(
      'UPDATE attendees SET checked_in = 1, checked_in_at = ?, checkin_count = checkin_count + 1 WHERE id = ?'
    ).run(now, attendeeId);
    db.prepare("INSERT INTO attendance_history (attendee_id, event_id, action, occurred_at) VALUES (?, ?, 'checkin', ?)")
      .run(attendeeId, eventId, now);
  }

  res.json(db.prepare('SELECT * FROM attendees WHERE id = ?').get(attendeeId));
}

// Regenerates a ticket's QR code on demand (e.g. from "My Schedule" —
// the QR isn't stored, only the deterministic payload it was built from).
async function getTicket(req, res) {
  const db = getDb();
  const { eventId, attendeeId } = req.params;
  const attendee = db.prepare('SELECT * FROM attendees WHERE id = ? AND event_id = ?').get(attendeeId, eventId);
  if (!attendee) return res.status(404).json({ error: 'attendee not found' });

  const qrPayload = JSON.stringify({ eventId, id: attendee.id });
  const qrDataUrl = await generateQrDataUrl(qrPayload);
  res.json({ attendee, qrDataUrl });
}

module.exports = { listAttendees, registerAttendee, toggleCheckin, getTicket };
