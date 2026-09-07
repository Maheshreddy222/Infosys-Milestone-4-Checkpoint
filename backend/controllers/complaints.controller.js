const { getDb } = require('../db/database');

function generateId() {
  return 'cmp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Admins see everyone's complaints for the event; a regular user sees only their own.
function listComplaints(req, res) {
  const db = getDb();
  const { eventId } = req.params;
  const rows = req.user.role === 'admin'
    ? db.prepare(`SELECT c.*, u.name AS user_name FROM complaints c JOIN users u ON u.id = c.user_id WHERE c.event_id = ? ORDER BY c.created_at DESC`).all(eventId)
    : db.prepare('SELECT * FROM complaints WHERE event_id = ? AND user_id = ? ORDER BY created_at DESC').all(eventId, req.user.id);
  res.json(rows);
}

function createComplaint(req, res) {
  const db = getDb();
  const { eventId } = req.params;
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) return res.status(404).json({ error: 'event not found' });

  const b = req.body || {};
  if (!b.subject) return res.status(400).json({ error: 'subject is required' });

  const id = generateId();
  db.prepare('INSERT INTO complaints (id, event_id, user_id, subject, description, status, created_at) VALUES (?,?,?,?,?, \'open\', ?)').run(
    id, eventId, req.user.id, b.subject.trim(), (b.description || '').trim(), new Date().toISOString()
  );
  res.status(201).json(db.prepare('SELECT * FROM complaints WHERE id = ?').get(id));
}

// Admin-only: mark a complaint resolved.
function updateStatus(req, res) {
  const db = getDb();
  const { eventId, complaintId } = req.params;
  const complaint = db.prepare('SELECT * FROM complaints WHERE id = ? AND event_id = ?').get(complaintId, eventId);
  if (!complaint) return res.status(404).json({ error: 'complaint not found' });

  const status = req.body && req.body.status === 'resolved' ? 'resolved' : 'open';
  const resolved_at = status === 'resolved' ? new Date().toISOString() : null;
  db.prepare('UPDATE complaints SET status = ?, resolved_at = ? WHERE id = ?').run(status, resolved_at, complaintId);
  res.json(db.prepare('SELECT * FROM complaints WHERE id = ?').get(complaintId));
}

module.exports = { listComplaints, createComplaint, updateStatus };
