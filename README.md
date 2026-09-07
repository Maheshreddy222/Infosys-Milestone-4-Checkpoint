# Checkpoint — Event Registration, Attendee Management & AI Event Operations

A full-stack event platform, built in three milestones:

1. **Registration & attendee management** — event creation, validated
   registration, QR tickets, real-time check-in, attendee analytics, AI
   insights.
2. **Venue Agent, Speaker Agent & Scheduling** — AI-assisted venue and
   speaker recommendations, conflict-free session scheduling, booking
   acceptance tracking.
3. **Sponsorship Agent, Incident Agent & Operations** — sponsor
   performance tracking, incident prioritization/escalation, operational
   alerts, a real-time monitoring dashboard, and AI-based recommendations.

Two account types keep the right tools in front of the right person —
**User** and **Administrator** — each with its own separate dashboard
(not cumulative; see "Accounts & roles" below). All amounts are shown
in ₹ (INR).

```
checkpoint-app/
├── backend/                        Node.js + Express API, SQLite database
│   ├── server.js                   App entry point
│   ├── db/
│   │   ├── schema.sql               users, events, attendees, venues, speakers,
│   │   │                            sessions, sponsors, incidents, feedback, complaints
│   │   └── database.js              SQLite connection + init
│   ├── controllers/                 Business logic per resource
│   │   ├── auth.controller.js           Sign up / log in / current user
│   │   ├── events.controller.js         create = admin only
│   │   ├── attendees.controller.js      any account
│   │   ├── checkin.controller.js        admin only
│   │   ├── analytics.controller.js      any account
│   │   ├── insights.controller.js       any account
│   │   ├── venues.controller.js         Milestone 2 — Venue Agent       (admin)
│   │   ├── speakers.controller.js       Milestone 2 — Speaker Agent     (admin)
│   │   ├── sessions.controller.js       Milestone 2 — Scheduling; view=any, write=admin
│   │   ├── sessionAnalytics.controller.js                               (admin)
│   │   ├── sponsors.controller.js       Milestone 3 — Sponsorship Agent (admin)
│   │   ├── incidents.controller.js      Milestone 3 — Incident Agent; log=any, manage=admin
│   │   ├── operationsAnalytics.controller.js  Dashboard + AI recs       (admin)
│   │   ├── feedback.controller.js       any account (own vs. all scoped by role)
│   │   └── complaints.controller.js     any account (own vs. all scoped by role)
│   ├── routes/                      One REST router per resource
│   ├── middleware/
│   │   └── requireAuth.js           requireAuth (any account) + requireRole('admin')
│   ├── utils/
│   │   ├── ids.js                   Ticket/event ID generation, email/phone normalization
│   │   ├── qr.js                    QR code generation (server-side)
│   │   ├── auth.js                  Password hashing + signed session tokens (no deps)
│   │   ├── conflicts.js             Shared double-booking check (venue & speaker)
│   │   └── agents/
│   │       ├── venueAgent.js        Venue scoring/ranking logic
│   │       ├── speakerAgent.js      Speaker scoring/ranking logic
│   │       ├── sponsorshipAgent.js  Sponsor scoring/ranking logic
│   │       └── incidentAgent.js     Incident prioritization, escalation, Critical Alerts
│   ├── package.json
│   └── .env.example
└── frontend/                        Real multi-page HTML site (no build step, no SPA framework)
    ├── index.html                   Public marketing landing page (Home / Features / FAQ / Contact)
    ├── login.html / signup.html     Sign in / sign up (User or Administrator)
    │
    │   USER dashboard pages:
    ├── register.html                Registration
    ├── events.html                  Events — shared with admin, view only for users
    ├── myschedule.html              My Schedule (read-only session agenda)
    ├── pastevents.html              Past Events
    ├── feedback.html                Feedback
    ├── incidents.html               Incidents — shared with admin; users can only log one
    ├── analytics.html               Analytics
    ├── insights.html                AI Insights
    │
    │   ADMINISTRATOR dashboard pages:
    ├── events.html                  Events — includes event creation for admins
    ├── checkin.html                 Check-in
    ├── venues.html                  Venues + Venue Agent
    ├── speakers.html                Speakers + Speaker Agent
    ├── scheduling.html              Combined scheduling + booking acceptance workflow
    ├── session-analytics.html       Venue/speaker/budget analytics
    ├── sponsors.html                Sponsors + Sponsorship Agent
    ├── incidents.html               Incidents — full management for admins
    ├── operations.html              Real-time dashboard + AI recommendations
    │
    ├── css/style.css                One shared stylesheet, all pages
    └── js/
        ├── api.js                   fetch() wrapper — attaches the login token automatically
        ├── auth.js                   Token storage, role check, role-based nav filtering, page-lock
        ├── helpers.js                Shared DOM + formatting helpers
        ├── shared.js                 Nav highlighting + event selector + auth status + acceptance popup
        └── pages/                    One script per page — only that page's logic
```

## Setup

```bash
cd backend
npm install
cp .env.example .env      # optional — see "AI features" below
npm start
```

Open **http://localhost:4000** — the public landing page. Anyone not
signed in only ever sees that page plus Log in / Sign up; every other
page requires an account.

## Accounts & roles


Sign-up (`signup.html`) asks for an account type: **User** or
**Administrator**. Unlike a typical "admin sees everything" setup, the
two dashboards are **separate, not cumulative** — each role sees exactly
its own fixed set of pages in the sidebar, with only Events and
Incidents shared (each with different capabilities per role):

- **User** — Registration, Events (view only, cannot create), My
  Schedule, Past Events, Feedback, Incidents (can only log a new
  incident — no visibility into the incident list, priorities, or
  resolution workflow), Analytics, AI Insights.
- **Administrator** — Events (including creation), Check-in, Venues,
  Speakers, Scheduling, Session Analytics, Sponsors, Incidents (full
  management: list, prioritize, resolve, escalate, alerts, reports),
  Operations.

This is enforced in two layers:

1. **Server-side (the real boundary).** `middleware/requireAuth.js`
   exports `requireAuth` (any signed-in account) and `requireRole('admin')`
   (admin only). Routes that both roles can reach but with different
   capabilities — like creating a session vs. just viewing one — apply
   `requireRole('admin')` per-route rather than for the whole router; a
   user account gets a `403` from the API for anything beyond their role,
   even if they reach the page.
2. **Client-side (UX).** `js/auth.js`'s `filterNavByRole` shows/hides
   each nav link based on `data-roles="user"` / `"admin"` / `"user,admin"`
   tags, and `lockPageForAccount()` replaces admin-only page content with
   a message for non-admins who reach it directly.

**Note on role assignment:** for this project's scope, the account type
is self-selected at signup — there's no separate admin-invite flow. For
a real deployment, admin accounts should be created by an existing admin
or a manual promotion step (e.g. directly in the `users` table), not
chosen by the person signing up.

## Milestone 1 — Registration & Attendee Management

| Requirement | Implementation |
|---|---|
| Create an event | `POST /api/events` (admin only) |
| Register users, required fields | `POST /api/events/:id/attendees` (any signed-in account) |
| No duplicate emails/phone numbers | Unique index on `(event_id, email)` / `(event_id, phone)` |
| Server-generated ID + QR ticket | `utils/ids.js`, `utils/qr.js` |
| Check-in, validate | `POST /api/events/:id/checkin` (admin only) |
| Attendee analytics & AI insights | `GET /analytics`, `POST /insights` (any signed-in account) |

**Ticket printing shows only the ticket.** "Print ticket" (on Register
and on a User's My Schedule page) uses a `@media print` rule that hides
everything except the `.ticket` element — just the QR code and the
registered attendee's details print, not the surrounding page.

**My Schedule (User dashboard)** shows every attendee *this account*
has registered for any **future** event — via `GET /my-registrations`,
which joins across all events rather than being scoped to whichever
event is currently selected in the topbar. Each row has a "View
registration" action that re-fetches the ticket (QR regenerated on
demand via `GET /events/:id/attendees/:id/ticket`, since it isn't
stored) with a Print button — intentionally minimal, no admin tooling.

**Events page, User view.** Instead of "Select," a User's event list
shows **Register** (jumps to the Registration page with that event set
active) unless they've already registered at least one attendee for
that event, in which case it shows **Registered** — clicking it again
just confirms that rather than navigating anywhere.

## Milestone 2 — Venue Agent, Speaker Agent & Scheduling

**Venues, speakers and sponsors are shared resources, not per-event.**
Once added, a venue/speaker/sponsor appears in every event's Venues,
Speakers, and Sponsors pages — not just the event that happened to be
active when it was created (`venues`/`speakers`/`sponsors` list
queries have no `event_id` filter). A direct consequence: **conflict
checking is cross-event too** (`utils/conflicts.js`) — a venue or
speaker double-booked at the same date/time is rejected regardless of
which two events the bookings belong to, since a shared physical venue
or a speaker's calendar can't actually be in two places at once.
Sessions themselves stay tied to a single event, as does each event's
Session Analytics and Operations dashboard.

**Venue Agent** (`utils/agents/venueAgent.js`) scores venues on capacity
fit, budget fit, facilities match, accessibility/cleanliness/safety, and
location — excluding any venue already booked for the requested
date/time outright, before scoring even starts.

**Speaker Agent** (`utils/agents/speakerAgent.js`) ranks speakers by
topic relevance, audience feedback, language, experience and budget fit,
with availability as a hard filter rather than a scored factor.

**Hand off to Scheduling, not direct booking.** The Venues and Speakers
pages don't book anything themselves. Each ranked result card has a
**"Schedule"** button that carries the chosen venue/speaker plus the
topic/date/time (via `localStorage`) over to the combined Scheduling
page, which pre-fills the form, shows that pick as already selected, and
automatically searches for the *other* resource (venue or speaker) so
the admin can complete the pairing — or confirm with just the one
they picked.

**Mandatory contact number.** Both the "Add a venue" and "Add a
speaker" forms require a contact number — enforced client-side and
server-side (`venues.controller.js` / `speakers.controller.js` reject a
missing `contactNumber` with a `400`). It's also shown on every ranked
recommendation card on the Venues and Speakers pages, alongside the
usual scoring details.

**Acceptance popup.** Since venues and speakers don't have their own
login in this system, confirming a session on the Scheduling page
immediately opens a popup representing their response to the booking
request — Accept, Decline, or leave Pending — captured by the admin on
their behalf (e.g. after a phone call) and recorded via `PATCH
.../venue-status` / `.../speaker-status`. The resulting status shows as
a badge next to the venue/speaker name in the Scheduling page's session
list.

**Cancel any time before the event.** A booked venue or speaker can be
cancelled from the Scheduling page's session list at any point up until
the session's date — `sessions.controller.js#cancelSession` rejects
cancelling a session whose date has already passed.

**Scheduling** (`scheduling.html`) remains for the combined case —
booking a venue *and* a speaker together in one workflow, comparing both
side by side before confirming.

## Milestone 3 — Sponsorship Agent, Incident Agent & Operations

**Sponsorship Agent** (`utils/agents/sponsorshipAgent.js`,
`sponsors.html`) — manage sponsor profiles (tier, category, contribution,
promised deliverables) and get ranked recommendations against a
sponsorship need (category, budget, minimum tier), scored on category
match, contribution vs. budget fit, reliability, and engagement. Each
ranked result includes a **"Contact Sponsor"** button that sends a real
email — `POST /sponsors/:id/contact` (`utils/mailer.js`, via
nodemailer + Gmail SMTP) sends **from** `checkpoint.noreply@gmail.com`
(configurable via `EMAIL_USER`/`EMAIL_PASS` in `.env` — `EMAIL_PASS`
must be a
[Gmail App Password](https://myaccount.google.com/apppasswords), not
the account's normal password) **to** the sponsor's contact email. If
those aren't configured, the endpoint returns `EMAIL_NOT_CONFIGURED`
and the button falls back to opening a Gmail web-compose tab instead,
so the feature still works with zero setup.
**Sponsor performance tracking** is a `PATCH .../performance` endpoint
for updating deliverable fulfillment %, engagement and reliability
scores as the relationship develops.

**Incident Agent** (`utils/agents/incidentAgent.js`, `incidents.html`) —
**on both dashboards, with different capabilities.** A User can only
submit the "Report an incident" form (type, description, location,
severity — no category field; the agent still classifies internally
from type/description). An Administrator gets the full workflow view:
the list, priorities, alerts, and every status transition below. The
moment an incident is logged, the agent runs it through: determine
severity → assign priority → **assign a responsible team**
(`assignTeam`) → **notify the team** (auto-timestamped) → generate a
**recommended next action** (`recommendAction`, e.g. "switch to
backup/manual check-in" for a registration/technical incident).
Priority is a 0–100 urgency score from severity, incident type risk,
and how long it's sat unresolved — auto-escalating past a
severity-based time threshold, recomputed on every fetch so it ages in
real time. This split is enforced server-side too: `POST
/incidents` (log) accepts any signed-in account, while `GET`, `PATCH
.../status`, `.../alerts` and `.../report` all require
`requireRole('admin')`.

**Critical Alerts** (`CRITICAL_ALERT_PATTERNS` in `incidentAgent.js`) —
a fixed set of situations that always jump straight to `critical`
priority and immediate escalation, regardless of what the generic
severity-weighted score would otherwise produce: medical emergency,
security emergency, major system failure, venue evacuation, and
large-scale registration failure. (A severity-4 registration failure
under the generic formula alone would only score ~64/100 — not
critical — which is exactly the gap this override closes.) Matched
incidents are flagged `is_critical_alert` with a stored `alert_reason`,
surfaced in a dedicated red banner at the top of both `incidents.html`
and `operations.html`, ahead of every other alert.

The full workflow from report to close is: **open → in_progress
(investigate) → resolved (requires resolution notes) → verified →
closed**, with escalation layered on top of any open state. Closing an
incident makes a **generated incident report** available (`GET
.../report`) — type/category, priority, assigned team, resolution
notes, time-to-resolve and time-to-close, and a plain-language summary.

**Operational alerts** (`GET /incidents/alerts`) pattern-scan currently
open incidents for: Critical Alerts (above), a critical-priority
backlog, incidents overdue past their escalation threshold, clusters
(3+ of the same type at the same location), and general open-incident
volume — each returned with a severity level for the UI to badge.

**Real-time monitoring dashboard & analytical reports**
(`operations.html`, `operationsAnalytics.controller.js`) combine
incident stats (open/escalated/resolved, by type, by priority, average
resolution time, active Critical Alerts) and sponsor stats (total
contribution, average deliverable fulfillment, by tier) into one view,
plus an **AI-based recommendations** button using the same
fetch-with-fallback pattern as the attendee insights feature.

**Live notifications** (`utils/liveNotifications.js`, `GET
.../live-notifications`, polled every 20s) surface a rolling feed at
the top of the Operations page — VIP arrivals in the last 20 minutes,
a check-in pace summary, sessions starting within 15 minutes or
already in progress, and what's coming up next — computed fresh from
attendee check-in timestamps and today's session schedule each time,
no separate notifications table to keep in sync.

**Sponsor performance dashboard** (`GET /sponsors/dashboard`,
`sponsors.html`) — a Sponsor / Engagement / Leads / Deliverables /
Performance table, where each sponsor's engagement score and deliverable
fulfillment combine into a performance rating: **Excellent** (≥85),
**Good** (65–84), or **At Risk** (<65). Sponsors rated At Risk are
flagged with a concrete suggested action (e.g. "consider increasing
booth visibility" vs. "increasing attendee interaction activities at
the booth", chosen based on which metric is weaker) — the same pattern
also feeds into the operations AI recommendations. Performance tracking
now covers booth visits, leads generated, session participation, social
media engagement, satisfaction score, ROI indicator and conversion
rate, editable inline per sponsor via "Update performance."

### Simplifications (noted for a production build)

- Venue location matching is a simple substring comparison, not geodistance.
- Speaker/venue availability is modeled as optional date lists + one daily
  time window, not a full calendar.
- Agent reasoning (including Critical Alert messages and sponsor
  suggested actions) is template-generated, not an LLM call — instant
  and fully explainable. The operations recommendations endpoint shows
  how an LLM call with a rule-based fallback could be layered on top of
  any agent.
- Admin role is self-selected at signup (see "Accounts & roles" above) —
  a production system needs a real admin-invite or promotion flow.

## AI features (attendee insights & operations recommendations)

If `ANTHROPIC_API_KEY` is set in `backend/.env`, both `/insights` and
`/operations-analytics/recommendations` call the Anthropic API. If left
blank, both fall back to rule-based generation from the same data, so
the app works out of the box either way.

## Data storage

SQLite via `better-sqlite3`, created automatically at
`backend/data/checkpoint.db` on first run.

## Not included (left for a production build)

- A real admin-invite flow (see "Accounts & roles")
- Camera-based QR scanning (currently: paste/type the scanned payload)
- Email delivery of confirmations/tickets/incident notifications
- A calendar-style UI for speaker/venue availability
- The Attendees and Complaint pages still exist (`attendees.html`,
  `complaint.html`, with working backend routes) but aren't linked from
  either dashboard's nav per the current page lists above — reachable
  directly by URL if needed, not advertised in the UI.
