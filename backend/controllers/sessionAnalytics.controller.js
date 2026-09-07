const { getDb } = require('../db/database');

// SESSION ANALYTICS — venue utilization, speaker load, budget spend and
// capacity mismatches, computed from the sessions actually scheduled
// (via the Scheduling page) for the active event.
function getSessionAnalytics(req, res) {
  const db = getDb();
  const { eventId } = req.params;
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) return res.status(404).json({ error: 'event not found' });

  const sessions = db
    .prepare("SELECT * FROM sessions WHERE event_id = ? AND status != 'cancelled'")
    .all(eventId);
  const venues = db.prepare('SELECT * FROM venues').all(); // shared across all events
  const speakers = db.prepare('SELECT * FROM speakers').all(); // shared across all events

  const totalSessions = sessions.length;

  // Venue utilization: how many of the venues on file were actually booked.
  const bookedVenueIds = new Set(sessions.filter((s) => s.venue_id).map((s) => s.venue_id));
  const venueUtilization = venues.length ? Math.round((bookedVenueIds.size / venues.length) * 100) : 0;

  const sessionsPerVenue = {};
  sessions.forEach((s) => {
    if (!s.venue_id) return;
    const v = venues.find((v) => v.id === s.venue_id);
    const key = v ? v.name : s.venue_id;
    sessionsPerVenue[key] = (sessionsPerVenue[key] || 0) + 1;
  });

  const sessionsPerSpeaker = {};
  sessions.forEach((s) => {
    if (!s.speaker_id) return;
    const sp = speakers.find((sp) => sp.id === s.speaker_id);
    const key = sp ? sp.name : s.speaker_id;
    sessionsPerSpeaker[key] = (sessionsPerSpeaker[key] || 0) + 1;
  });

  // Capacity mismatches: expected attendees vs. assigned venue capacity.
  const capacityMismatches = sessions
    .filter((s) => s.venue_id && s.expected_attendees)
    .map((s) => ({ session: s, venue: venues.find((v) => v.id === s.venue_id) }))
    .filter((x) => x.venue && (x.session.expected_attendees > x.venue.capacity || x.session.expected_attendees < x.venue.capacity * 0.4))
    .map((x) => ({
      topic: x.session.topic,
      expectedAttendees: x.session.expected_attendees,
      venue: x.venue.name,
      venueCapacity: x.venue.capacity,
      issue: x.session.expected_attendees > x.venue.capacity ? 'over capacity' : 'venue much larger than needed',
    }));

  // Budget: sum of venue cost/day + speaker fee for every scheduled session.
  let venueSpend = 0;
  let speakerSpend = 0;
  sessions.forEach((s) => {
    if (s.venue_id) {
      const v = venues.find((v) => v.id === s.venue_id);
      if (v) venueSpend += v.cost_per_day;
    }
    if (s.speaker_id) {
      const sp = speakers.find((sp) => sp.id === s.speaker_id);
      if (sp) speakerSpend += sp.fee;
    }
  });

  // Average engagement score across booked speakers (weighted by sessions).
  const engagementValues = sessions
    .filter((s) => s.speaker_id)
    .map((s) => speakers.find((sp) => sp.id === s.speaker_id))
    .filter(Boolean)
    .map((sp) => sp.engagement_score);
  const avgEngagement = engagementValues.length
    ? Math.round((engagementValues.reduce((a, b) => a + b, 0) / engagementValues.length) * 10) / 10
    : 0;

  res.json({
    totalSessions,
    totalVenues: venues.length,
    totalSpeakers: speakers.length,
    venueUtilization,
    sessionsPerVenue,
    sessionsPerSpeaker,
    avgEngagement,
    budget: {
      venueSpend: Math.round(venueSpend * 100) / 100,
      speakerSpend: Math.round(speakerSpend * 100) / 100,
      total: Math.round((venueSpend + speakerSpend) * 100) / 100,
    },
    capacityMismatches,
  });
}

module.exports = { getSessionAnalytics };
