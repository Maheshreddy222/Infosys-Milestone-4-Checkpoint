const { getDb } = require('../db/database');

function generateId() {
  return 'fb_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Admins see everyone's feedback for the event; a regular user sees only their own.
function listFeedback(req, res) {
  const db = getDb();
  const { eventId } = req.params;
  const rows = req.user.role === 'admin'
    ? db.prepare(`SELECT f.*, u.name AS user_name FROM feedback f JOIN users u ON u.id = f.user_id WHERE f.event_id = ? ORDER BY f.created_at DESC`).all(eventId)
    : db.prepare('SELECT * FROM feedback WHERE event_id = ? AND user_id = ? ORDER BY created_at DESC').all(eventId, req.user.id);
  res.json(rows);
}

function createFeedback(req, res) {
  const db = getDb();
  const { eventId } = req.params;
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) return res.status(404).json({ error: 'event not found' });

  const b = req.body || {};
  const rating = Math.min(5, Math.max(1, Number(b.rating) || 3));
  const id = generateId();
  db.prepare('INSERT INTO feedback (id, event_id, user_id, rating, comments, created_at) VALUES (?,?,?,?,?,?)').run(
    id, eventId, req.user.id, rating, (b.comments || '').trim(), new Date().toISOString()
  );
  res.status(201).json(db.prepare('SELECT * FROM feedback WHERE id = ?').get(id));
}

module.exports = { listFeedback, createFeedback };
