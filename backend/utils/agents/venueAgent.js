const { getDb } = require('../../db/database');
const { findConflicts } = require('../conflicts');

// ============================================================
// VENUE AGENT
// Ranks a set of venues against a requirement profile:
//   event type, expected attendees, budget, date/time,
//   required facilities (wifi, projector, AC, seating, stage,
//   power outlets), accessibility, cleanliness, safety/security,
//   and location preference. Venues with a scheduling conflict on
//   the requested date/time are excluded outright, never scored.
// ============================================================

const WEIGHTS = {
  capacity: 25,
  budget: 15,
  facilities: 20,
  accessibility: 10,
  cleanliness: 10,
  safety: 10,
  location: 10,
};

function scoreCapacity(venue, expectedAttendees) {
  if (!expectedAttendees) return WEIGHTS.capacity;
  if (venue.capacity < expectedAttendees) return 0; // hard fail — too small
  const excessRatio = (venue.capacity - expectedAttendees) / venue.capacity;
  const fit = 1 - Math.min(1, Math.abs(excessRatio - 0.15) * 1.5);
  return Math.round(WEIGHTS.capacity * Math.max(0.2, fit));
}

function scoreBudget(venue, budget) {
  if (!budget) return WEIGHTS.budget;
  if (venue.cost_per_day > budget) return 0; // hard fail — over budget
  const savingsRatio = (budget - venue.cost_per_day) / budget;
  return Math.round(WEIGHTS.budget * Math.min(1, 0.5 + savingsRatio));
}

function scoreFacilities(venue, required) {
  const keys = ['wifi', 'projector', 'air_conditioning', 'stage', 'power_outlets'];
  const requiredKeys = keys.filter((k) => required[k]);
  const seatingWanted = required.seating_comfort ? 1 : 0;
  const totalRequired = requiredKeys.length + seatingWanted;
  if (totalRequired === 0) return WEIGHTS.facilities;

  let met = requiredKeys.filter((k) => venue[k]).length;
  if (seatingWanted) met += venue.seating_comfort >= 4 ? 1 : venue.seating_comfort === 3 ? 0.5 : 0;

  return Math.round(WEIGHTS.facilities * (met / totalRequired));
}

function scoreRating(value, weight) {
  return Math.round(weight * (Math.min(5, Math.max(1, value)) / 5));
}

function scoreLocation(venue, locationPreference) {
  if (!locationPreference) return WEIGHTS.location;
  const a = (venue.location || '').toLowerCase();
  const b = locationPreference.toLowerCase();
  if (!a) return Math.round(WEIGHTS.location * 0.4);
  if (a.includes(b) || b.includes(a)) return WEIGHTS.location;
  return Math.round(WEIGHTS.location * 0.3);
}

function buildReasoning(venue, req) {
  const bits = [];
  if (req.expectedAttendees) bits.push(`fits ${req.expectedAttendees} attendees (capacity ${venue.capacity})`);
  if (req.budget) bits.push(`$${venue.cost_per_day}/day within a $${req.budget} budget`);
  const facilities = ['wifi', 'projector', 'air_conditioning', 'stage', 'power_outlets']
    .filter((k) => venue[k])
    .map((k) => (k === 'air_conditioning' ? 'A/C' : k === 'power_outlets' ? 'power outlets' : k));
  if (facilities.length) bits.push(`has ${facilities.join(', ')}`);
  bits.push(`rated ${venue.safety_security}/5 on safety, ${venue.cleanliness}/5 on cleanliness`);
  return `Recommended: ${bits.join('; ')}.`;
}

function recommendVenues(eventId, requirements) {
  const db = getDb();
  const {
    expectedAttendees = 0,
    budget = 0,
    date,
    startTime,
    endTime,
    eventType = '',
    requiredFacilities = {},
    accessibilityNeeded = false,
    locationPreference = '',
  } = requirements;

  // Venues are a shared resource across all events.
  let venues = db.prepare('SELECT * FROM venues').all();

  // Hard filter: never suggest a venue that's already booked for this date/time.
  if (date && startTime && endTime) {
    venues = venues.filter(
      (v) => findConflicts(eventId, 'venue_id', v.id, date, startTime, endTime).length === 0
    );
  }

  const results = venues.map((venue) => {
    const breakdown = {
      capacity: scoreCapacity(venue, expectedAttendees),
      budget: scoreBudget(venue, budget),
      facilities: scoreFacilities(venue, requiredFacilities),
      accessibility: scoreRating(
        venue.accessibility,
        accessibilityNeeded ? WEIGHTS.accessibility * 1.5 : WEIGHTS.accessibility
      ),
      cleanliness: scoreRating(venue.cleanliness, WEIGHTS.cleanliness),
      safety: scoreRating(venue.safety_security, WEIGHTS.safety),
      location: scoreLocation(venue, locationPreference),
    };
    let typeBonus = 0;
    if (eventType && venue.event_types) {
      const types = venue.event_types.toLowerCase().split(',').map((s) => s.trim());
      if (types.includes(eventType.toLowerCase())) typeBonus = 5;
    }
    const total = Math.min(100, Object.values(breakdown).reduce((a, b) => a + b, 0) + typeBonus);
    return {
      venue,
      score: total,
      breakdown,
      eventTypeMatch: typeBonus > 0,
      reasoning: buildReasoning(venue, { expectedAttendees, budget }),
    };
  });

  results.sort((a, b) => b.score - a.score);
  return results;
}

module.exports = { recommendVenues, WEIGHTS };
