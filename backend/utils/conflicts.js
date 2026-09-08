const { getDb } = require('../db/database');

// True if [aStart,aEnd) overlaps [bStart,bEnd) on the same date. Times are "HH:MM" strings.
function timesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

// Returns the list of existing sessions that would conflict with a proposed
// booking of `resourceCol` ('venue_id' | 'speaker_id') = resourceId on date/start/end.
// Excludes a given sessionId (used when re-checking on update). Venues and
// speakers are shared across every event, so this checks conflicts across
// ALL events, not just the one being booked — a physical venue or a
// speaker's calendar can't be double-booked just because the two bookings
// happen to belong to different events.
function findConflicts(eventId, resourceCol, resourceId, date, start, end, excludeSessionId) {
  if (!resourceId) return [];
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM sessions WHERE ${resourceCol} = ? AND date = ? AND status != 'cancelled'`
    )
    .all(resourceId, date);
  return rows.filter(
    (s) => s.id !== excludeSessionId && timesOverlap(start, end, s.start_time, s.end_time)
  );
}

module.exports = { timesOverlap, findConflicts };
