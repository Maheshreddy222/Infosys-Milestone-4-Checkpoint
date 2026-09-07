const { getDb } = require('../db/database');
const { hashPassword, verifyPassword, signToken } = require('../utils/auth');

const VALID_ROLES = ['user', 'admin'];

function generateUserId() {
  return 'usr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// NOTE: role is self-selected at signup for this project's scope (there's no
// separate admin-invite flow). For a real deployment, admin accounts should
// be created by an existing admin or a manual promotion step, not chosen by
// the person signing up.
function register(req, res) {
  const db = getDb();
  const { name, email, password, role } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'password must be at least 6 characters' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'please enter a valid email address' });
  }

  const nEmail = email.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(nEmail);
  if (existing) {
    return res.status(409).json({ error: 'an account with this email already exists' });
  }

  const nRole = VALID_ROLES.includes(role) ? role : 'user';

  const id = generateUserId();
  db.prepare('INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?,?,?,?,?,?)').run(
    id, name.trim(), nEmail, hashPassword(password), nRole, new Date().toISOString()
  );

  const token = signToken({ userId: id });
  res.status(201).json({ token, user: { id, name: name.trim(), email: nEmail, role: nRole } });
}

function login(req, res) {
  const db = getDb();
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const nEmail = email.trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(nEmail);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'invalid email or password' });
  }

  const token = signToken({ userId: user.id });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}

function me(req, res) {
  res.json({ user: req.user });
}

module.exports = { register, login, me };
