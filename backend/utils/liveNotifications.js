// LIVE OPERATIONAL NOTIFICATIONS — a rolling feed for the Operations
// dashboard: recent VIP arrivals, sessions about to start, and what's
// coming up next. Computed fresh on every request from real check-in
// and session data (no separate notifications table to keep in sync).

const { getDb } = require('../db/database');

function minutesBetween(a, b) {
  return Math.round((a - b) / 60000);
}

function sessionStartDate(session) {
  return new Date(`${session.date}T${session.start_time}:00`);
}
function sessionEndDate(session) {
  return new Date(`${session.date}T${session.end_time}:00`);
}

function generateLiveNotifications(eventId) {
  const db = getDb();
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const notifications = [];

  // --- VIP arrivals in the last 20 minutes ---
  const recentVips = db
    .prepare(
      `SELECT * FROM attendees WHERE event_id = ? AND ticket_type = 'VIP' AND checked_in = 1
       AND checked_in_at IS NOT NULL ORDER BY checked_in_at DESC LIMIT 20`
    )
    .all(eventId);
  recentVips.forEach((a) => {
    const mins = minutesBetween(now, new Date(a.checked_in_at));
    if (mins >= 0 && mins <= 20) {
      notifications.push({
        type: 'vip_arrival',
        level: 'high',
        message: `🌟 ${a.name} (VIP) has arrived`,
        minutesAgo: mins,
        at: a.checked_in_at,
      });
    }
  });

  // --- Recent general check-ins (last 5 minutes), summarized rather than one-per-person ---
  const recentCheckins = db
    .prepare(
      `SELECT COUNT(*) as c FROM attendees WHERE event_id = ? AND checked_in = 1 AND checked_in_at >= ?`
    )
    .get(eventId, new Date(now.getTime() - 5 * 60000).toISOString());
  if (recentCheckins.c > 0) {
    notifications.push({
      type: 'checkin_pace',
      level: 'low',
      message: `👥 ${recentCheckins.c} attendee${recentCheckins.c > 1 ? 's' : ''} checked in during the last 5 minutes`,
      minutesAgo: 0,
      at: now.toISOString(),
    });
  }

  // --- Sessions today, for "starting soon" + "next up" ---
  const sessions = db
    .prepare(
      `SELECT s.*, v.name AS venue_name, sp.name AS speaker_name
       FROM sessions s
       LEFT JOIN venues v ON v.id = s.venue_id
       LEFT JOIN speakers sp ON sp.id = s.speaker_id
       WHERE s.event_id = ? AND s.date = ? AND s.status = 'scheduled'
       ORDER BY s.start_time ASC`
    )
    .all(eventId, todayIso);

  let nextUpcoming = null;
  sessions.forEach((s) => {
    const start = sessionStartDate(s);
    const end = sessionEndDate(s);
    const minsToStart = minutesBetween(start, now);
    const minsToEnd = minutesBetween(end, now);

    if (minsToStart > 0 && minsToStart <= 15) {
      notifications.push({
        type: 'session_starting',
        level: 'medium',
        message: `🕒 "${s.topic}" starts in ${minsToStart} min${s.venue_name ? ` at ${s.venue_name}` : ''}${s.speaker_name ? ` with ${s.speaker_name}` : ''}`,
        minutesAgo: -minsToStart,
        at: s.start_time,
      });
    } else if (minsToStart <= 0 && minsToEnd > 0) {
      notifications.push({
        type: 'session_live',
        level: 'medium',
        message: `▶ "${s.topic}" is in progress${s.venue_name ? ` at ${s.venue_name}` : ''} — wraps up in ${minsToEnd} min`,
        minutesAgo: 0,
        at: s.start_time,
      });
    }

    if (minsToStart > 0 && (!nextUpcoming || start < sessionStartDate(nextUpcoming))) {
      nextUpcoming = s;
    }
  });

  if (nextUpcoming) {
    const mins = minutesBetween(sessionStartDate(nextUpcoming), now);
    if (mins > 15) {
      notifications.push({
        type: 'next_session',
        level: 'low',
        message: `Next up: "${nextUpcoming.topic}"${nextUpcoming.speaker_name ? ` with ${nextUpcoming.speaker_name}` : ''} in ${mins} min${nextUpcoming.venue_name ? ` at ${nextUpcoming.venue_name}` : ''}`,
        minutesAgo: -mins,
        at: nextUpcoming.start_time,
      });
    }
  }

  // Most time-urgent first.
  notifications.sort((a, b) => a.minutesAgo - b.minutesAgo);
  return notifications;
}

module.exports = { generateLiveNotifications };
