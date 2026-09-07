const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'data', 'checkpoint.db');
let db;

function initDb() {
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);

  const eventColumns = db.prepare('PRAGMA table_info(events)').all().map(c => c.name);
  if (!eventColumns.includes('registration_open')) {
    db.exec('ALTER TABLE events ADD COLUMN registration_open INTEGER NOT NULL DEFAULT 1');
  }

  // SQLite's CREATE TABLE IF NOT EXISTS does not add fields to installations
  // created by an older version of the application.
  const attendeeColumns = db.prepare('PRAGMA table_info(attendees)').all().map(c => c.name);
  if (!attendeeColumns.includes('last_checked_out_at')) {
    db.exec('ALTER TABLE attendees ADD COLUMN last_checked_out_at TEXT');
  }
  if (!attendeeColumns.includes('checkin_count')) {
    db.exec('ALTER TABLE attendees ADD COLUMN checkin_count INTEGER NOT NULL DEFAULT 0');
  }
  if (!attendeeColumns.includes('checkout_count')) {
    db.exec('ALTER TABLE attendees ADD COLUMN checkout_count INTEGER NOT NULL DEFAULT 0');
  }

  return db;
}

function getDb() {
  if (!db) initDb();
  return db;
}

module.exports = { initDb, getDb };
