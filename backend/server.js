require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const { initDb } = require('./db/database');

const authRoutes = require('./routes/auth.routes');
const myRegistrationsRoutes = require('./routes/my-registrations.routes');
const eventsRoutes = require('./routes/events.routes');
const attendeesRoutes = require('./routes/attendees.routes');
const checkinRoutes = require('./routes/checkin.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const insightsRoutes = require('./routes/insights.routes');
const feedbackRoutes = require('./routes/feedback.routes');
const complaintsRoutes = require('./routes/complaints.routes');

// --- Milestone 2: Venue Agent, Speaker Agent, Scheduling (admin only) ---
const venuesRoutes = require('./routes/venues.routes');
const speakersRoutes = require('./routes/speakers.routes');
const sessionsRoutes = require('./routes/sessions.routes');
const sessionAnalyticsRoutes = require('./routes/session-analytics.routes');

// --- Milestone 3: Sponsorship Agent, Incident Agent, Operations (admin only) ---
const sponsorsRoutes = require('./routes/sponsors.routes');
const incidentsRoutes = require('./routes/incidents.routes');
const operationsAnalyticsRoutes = require('./routes/operations-analytics.routes');
const intelligenceRoutes = require('./routes/intelligence.routes');
const orchestrationRoutes = require('./routes/orchestration.routes');
const executiveDashboardRoutes = require('./routes/executive-dashboard.routes');

initDb();

const app = express();
app.use(cors());
app.use(express.json());

// --- Accounts (sign up / log in required to create events & use Milestone 2) ---
app.use('/api/auth', authRoutes);
app.use('/api/my-registrations', myRegistrationsRoutes);

// --- API: Milestone 1 (registration & attendees) ---
app.use('/api/events', eventsRoutes);
app.use('/api/events/:eventId/attendees', attendeesRoutes);
app.use('/api/events/:eventId/checkin', checkinRoutes);
app.use('/api/events/:eventId/analytics', analyticsRoutes);
app.use('/api/events/:eventId/insights', insightsRoutes);
app.use('/api/events/:eventId/feedback', feedbackRoutes);
app.use('/api/events/:eventId/complaints', complaintsRoutes);

// --- API: Milestone 2 (venue agent, speaker agent, scheduling) ---
app.use('/api/events/:eventId/venues', venuesRoutes);
app.use('/api/events/:eventId/speakers', speakersRoutes);
app.use('/api/events/:eventId/sessions', sessionsRoutes);
app.use('/api/events/:eventId/session-analytics', sessionAnalyticsRoutes);

// --- API: Milestone 3 (sponsorship agent, incident agent, operations) ---
app.use('/api/events/:eventId/sponsors', sponsorsRoutes);
app.use('/api/events/:eventId/incidents', incidentsRoutes);
app.use('/api/events/:eventId/operations-analytics', operationsAnalyticsRoutes);

// --- Milestone 4: Event Intelligence & Enterprise Deployment ---
app.use('/api/events/:eventId/intelligence', intelligenceRoutes);
app.use('/api/events/:eventId/orchestration', orchestrationRoutes);
app.use('/api/executive-dashboard', executiveDashboardRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api', (req, res) => res.status(404).json({ error: 'not found' }));

// --- Static frontend (real multi-page HTML — one file per view) ---
const frontendDir = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendDir));

const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Checkpoint API + app running on port ${PORT}`);
  console.log(`Open on this PC: http://localhost:${PORT}`);
});
