function eventCodeFromName(name) {
  const letters = String(name || 'EVT').toUpperCase().replace(/[^A-Z]/g, '');
  return (letters.slice(0, 4) || 'EVT').padEnd(3, 'X');
}

function generateEventId() {
  return 'ev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function generateTicketId(eventCode, sequence) {
  return `${eventCode}-${String(sequence).padStart(5, '0')}`;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizePhone(phone) {
  return String(phone || '').replace(/[^0-9]/g, '');
}

module.exports = {
  eventCodeFromName,
  generateEventId,
  generateTicketId,
  normalizeEmail,
  normalizePhone,
};
