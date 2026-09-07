-- ============================================================
-- ACCOUNTS
-- Two roles: 'user' (event organizer — Milestone 1 pages: events,
-- registration, check-in, attendees, analytics, insights) and
-- 'admin' (everything a user has, plus Milestone 2 — venues,
-- speakers, scheduling — and Milestone 3 — sponsors, incidents,
-- operations dashboard).
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,   -- stored normalized (lowercase, trimmed)
  password_hash  TEXT NOT NULL,          -- "salt:hash" — see utils/auth.js
  role           TEXT NOT NULL DEFAULT 'user', -- 'user' | 'admin'
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  date         TEXT NOT NULL,
  venue        TEXT DEFAULT '',
  description  TEXT DEFAULT '',
  code         TEXT NOT NULL,
  owner_id     TEXT REFERENCES users(id),  -- the organizer account that created this event
  registration_open INTEGER NOT NULL DEFAULT 1, -- 1=open, 0=stopped
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attendees (
  id             TEXT PRIMARY KEY,
  event_id       TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL,   -- stored normalized (lowercase, trimmed)
  phone          TEXT NOT NULL,   -- stored normalized (digits only)
  company        TEXT DEFAULT '',
  ticket_type    TEXT NOT NULL DEFAULT 'General',
  registered_by  TEXT REFERENCES users(id), -- which account performed this registration
  registered_at  TEXT NOT NULL,
  checked_in     INTEGER NOT NULL DEFAULT 0,
  checked_in_at  TEXT,
  last_checked_out_at TEXT,
  checkin_count  INTEGER NOT NULL DEFAULT 0,
  checkout_count INTEGER NOT NULL DEFAULT 0
);

-- A given email or phone number can only register once per event.
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendee_email_per_event ON attendees(event_id, email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendee_phone_per_event ON attendees(event_id, phone);
CREATE INDEX IF NOT EXISTS idx_attendee_event ON attendees(event_id);

-- Immutable attendance audit trail. The attendees fields above represent the
-- current state while this table preserves every arrival and departure.
CREATE TABLE IF NOT EXISTS attendance_history (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  attendee_id  TEXT NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
  event_id     TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  action       TEXT NOT NULL CHECK(action IN ('checkin', 'checkout')),
  occurred_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attendance_history_attendee ON attendance_history(attendee_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_attendance_history_event ON attendance_history(event_id, occurred_at);

-- ============================================================
-- MILESTONE 2 — Venue Agent, Speaker Agent, Scheduling
-- ============================================================

CREATE TABLE IF NOT EXISTS venues (
  id                TEXT PRIMARY KEY,
  event_id          TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  location          TEXT DEFAULT '',
  contact_number    TEXT NOT NULL DEFAULT '', -- mandatory
  capacity          INTEGER NOT NULL DEFAULT 0,
  cost_per_day      REAL NOT NULL DEFAULT 0,
  event_types       TEXT DEFAULT '',          -- comma list, e.g. "conference,workshop"
  wifi              INTEGER NOT NULL DEFAULT 0,  -- 0/1
  projector         INTEGER NOT NULL DEFAULT 0,  -- 0/1
  air_conditioning  INTEGER NOT NULL DEFAULT 0,  -- 0/1
  seating_comfort   INTEGER NOT NULL DEFAULT 3,  -- 1-5
  stage             INTEGER NOT NULL DEFAULT 0,  -- 0/1
  power_outlets     INTEGER NOT NULL DEFAULT 0,  -- 0/1
  accessibility     INTEGER NOT NULL DEFAULT 3,  -- 1-5
  cleanliness       INTEGER NOT NULL DEFAULT 3,  -- 1-5
  safety_security   INTEGER NOT NULL DEFAULT 3,  -- 1-5
  created_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS speakers (
  id                    TEXT PRIMARY KEY,
  event_id              TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  contact_number        TEXT NOT NULL DEFAULT '', -- mandatory
  expertise             TEXT NOT NULL DEFAULT '',  -- comma list of topics/keywords
  language              TEXT NOT NULL DEFAULT 'English',
  experience_years      INTEGER NOT NULL DEFAULT 0,
  fee                   REAL NOT NULL DEFAULT 0,
  engagement_score      INTEGER NOT NULL DEFAULT 3, -- 1-5, prior audience feedback
  available_dates       TEXT DEFAULT '',           -- comma list of YYYY-MM-DD, blank = flexible
  available_start       TEXT DEFAULT '',           -- HH:MM daily window start, blank = flexible
  available_end         TEXT DEFAULT '',           -- HH:MM daily window end, blank = flexible
  created_at            TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id                  TEXT PRIMARY KEY,
  event_id            TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  topic               TEXT NOT NULL,
  venue_id            TEXT REFERENCES venues(id),
  speaker_id          TEXT REFERENCES speakers(id),
  venue_status        TEXT,                            -- pending | accepted | declined (NULL if no venue assigned)
  speaker_status      TEXT,                            -- pending | accepted | declined (NULL if no speaker assigned)
  date                TEXT NOT NULL,
  start_time          TEXT NOT NULL,
  end_time            TEXT NOT NULL,
  expected_attendees  INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'scheduled',
  created_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_venues_event ON venues(event_id);
CREATE INDEX IF NOT EXISTS idx_speakers_event ON speakers(event_id);
CREATE INDEX IF NOT EXISTS idx_sessions_event ON sessions(event_id);
CREATE INDEX IF NOT EXISTS idx_sessions_venue ON sessions(venue_id);
CREATE INDEX IF NOT EXISTS idx_sessions_speaker ON sessions(speaker_id);

-- ============================================================
-- MILESTONE 3 — Sponsorship Agent, Incident Agent, Operations
-- ============================================================

CREATE TABLE IF NOT EXISTS sponsors (
  id                       TEXT PRIMARY KEY,
  event_id                 TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name                     TEXT NOT NULL,
  tier                     TEXT NOT NULL DEFAULT 'Bronze',  -- Platinum | Gold | Silver | Bronze
  category                 TEXT DEFAULT '',                  -- e.g. "Technology", "Food & Beverage"
  contribution_amount      REAL NOT NULL DEFAULT 0,
  deliverables_promised    TEXT DEFAULT '',                  -- comma list, e.g. "logo on banner, booth 10x10"
  deliverables_fulfilled_pct INTEGER NOT NULL DEFAULT 0,      -- 0-100, updated as performance is tracked
  engagement_score         INTEGER NOT NULL DEFAULT 3,        -- 1-5, audience engagement generated
  reliability_score         INTEGER NOT NULL DEFAULT 3,        -- 1-5, track record from past events
  booth_visits              INTEGER NOT NULL DEFAULT 0,        -- performance tracking
  leads_generated           INTEGER NOT NULL DEFAULT 0,
  session_participation      INTEGER NOT NULL DEFAULT 0,        -- number of sessions sponsored/participated in
  social_media_engagement    INTEGER NOT NULL DEFAULT 0,        -- mentions / interactions
  satisfaction_score        INTEGER NOT NULL DEFAULT 3,        -- 1-5, sponsor's own satisfaction
  roi_indicator              REAL NOT NULL DEFAULT 0,           -- reported ROI, %
  conversion_rate            REAL NOT NULL DEFAULT 0,           -- leads -> conversions, %
  contact_name             TEXT DEFAULT '',
  contact_email            TEXT DEFAULT '',
  created_at               TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS incidents (
  id                 TEXT PRIMARY KEY,
  event_id           TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  type               TEXT NOT NULL DEFAULT 'other',   -- medical | security | technical | logistics | other
  category           TEXT DEFAULT '',                 -- finer classification, e.g. "Registration/Technical"
  description        TEXT NOT NULL DEFAULT '',
  location            TEXT DEFAULT '',
  severity            INTEGER NOT NULL DEFAULT 3,      -- 1-5, as reported
  priority             TEXT NOT NULL DEFAULT 'medium',  -- computed by the Incident Agent: critical|high|medium|low
  urgency_score        INTEGER NOT NULL DEFAULT 0,      -- 0-100, computed
  assigned_team        TEXT DEFAULT '',                 -- auto-assigned responsible team
  recommended_action    TEXT DEFAULT '',                 -- auto-generated suggested next step
  is_critical_alert     INTEGER NOT NULL DEFAULT 0,       -- 1 if it matched a Critical Alert pattern (see incidentAgent.js)
  alert_reason          TEXT DEFAULT '',                 -- which Critical Alert pattern matched, e.g. "Medical emergency"
  status               TEXT NOT NULL DEFAULT 'open',    -- open | in_progress | resolved | verified | closed | escalated
  reported_by          TEXT DEFAULT '',
  reported_at          TEXT NOT NULL,
  notified_at          TEXT,                            -- when the responsible team was notified (automatic)
  resolution_notes      TEXT DEFAULT '',
  resolved_at          TEXT,
  verified_at          TEXT,
  closed_at            TEXT,
  created_at           TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sponsors_event ON sponsors(event_id);
CREATE INDEX IF NOT EXISTS idx_incidents_event ON incidents(event_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);

-- ============================================================
-- USER-FACING: Feedback & Complaints
-- Any signed-in account (user or admin) can submit; each account sees
-- only their own submissions, except admins, who see everyone's.
-- ============================================================

CREATE TABLE IF NOT EXISTS feedback (
  id          TEXT PRIMARY KEY,
  event_id    TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id),
  rating      INTEGER NOT NULL DEFAULT 3, -- 1-5
  comments    TEXT DEFAULT '',
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS complaints (
  id           TEXT PRIMARY KEY,
  event_id     TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id),
  subject      TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'open', -- open | resolved
  created_at   TEXT NOT NULL,
  resolved_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_feedback_event ON feedback(event_id);
CREATE INDEX IF NOT EXISTS idx_complaints_event ON complaints(event_id);

-- ============================================================
-- MENTOR-GUIDED REFINEMENTS
-- Incidents: richer workflow (category, assigned team, auto-notify,
-- recommended action, resolution notes, verify/close stages).
-- Sponsors: fuller performance metrics for the sponsor dashboard.
-- ============================================================
