const { verifyToken } = require('../utils/auth');
const { getDb } = require('../db/database');

// Protects a route: requires a valid "Authorization: Bearer <token>" header.
// Attaches req.user = { id, name, email, role, created_at } on success.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'sign in required' });

  const payload = verifyToken(token);
  if (!payload || !payload.userId) return res.status(401).json({ error: 'invalid or expired session' });

  const db = getDb();
  const user = db.prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?').get(payload.userId);
  if (!user) return res.status(401).json({ error: 'account not found' });

  req.user = user;
  next();
}

// Restricts a route to a specific role. Must run AFTER requireAuth (needs
// req.user already set). Used for every Milestone 2 & 3 route — venues,
// speakers, scheduling, session analytics, sponsors, incidents, operations —
// so only admin accounts can reach them, both in the API and (separately)
// in the UI's own page-lock check.
function requireRole(role) {
  return function (req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'sign in required' });
    if (req.user.role !== role) {
      return res.status(403).json({ error: `this action requires a ${role} account` });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
