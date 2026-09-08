// Event dates are stored as calendar dates (YYYY-MM-DD), so compare them
// against today's UTC calendar date rather than parsing them as timestamps.
function todayDateKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function isEventDatePassed(eventDate, now = new Date()) {
  return String(eventDate || '') < todayDateKey(now);
}

function closeExpiredRegistrations(db) {
  return db
    .prepare('UPDATE events SET registration_open = 0 WHERE registration_open = 1 AND date < ?')
    .run(todayDateKey()).changes;
}

function isRegistrationOpen(event) {
  return Boolean(event && event.registration_open === 1 && !isEventDatePassed(event.date));
}

module.exports = { todayDateKey, isEventDatePassed, closeExpiredRegistrations, isRegistrationOpen };