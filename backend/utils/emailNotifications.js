const { sendMail, isConfigured } = require('./mailer');

// Email is deliberately best-effort: callers invoke this only after their
// database write has completed, so SMTP problems can never roll it back.
async function sendEmailSafely({ to, subject, text, context }) {
  if (!isConfigured()) {
    console.warn(`[email] ${context} not sent: EMAIL_USER and EMAIL_PASS are not configured`);
    return { sent: false, reason: 'not_configured' };
  }

  try {
    await sendMail({ to, subject, text });
    return { sent: true };
  } catch (err) {
    console.error(`[email] ${context} failed for ${to}: ${err.message}`);
    return { sent: false, reason: 'failed' };
  }
}

async function notifyEventAttendees(db, event, subject, text, context) {
  const attendees = db.prepare('SELECT email FROM attendees WHERE event_id = ?').all(event.id);
  const results = await Promise.all(
    attendees.map(({ email }) => sendEmailSafely({ to: email, subject, text, context }))
  );
  const failed = results.filter(result => !result.sent).length;
  if (failed) console.warn(`[email] ${context}: ${failed} of ${attendees.length} attendee email(s) were not sent`);
  return { recipients: attendees.length, sent: attendees.length - failed, failed };
}

module.exports = { sendEmailSafely, notifyEventAttendees };