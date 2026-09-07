const { getDb } = require('../db/database');

function getAnalytics(req, res) {
  const db = getDb();
  const { eventId } = req.params;

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) return res.status(404).json({ error: 'event not found' });

  const attendees = db.prepare('SELECT * FROM attendees WHERE event_id = ?').all(eventId);
  const total = attendees.length;
  const checkedIn = attendees.filter((a) => a.checked_in).length;

  const byTicketType = {};
  attendees.forEach((a) => {
    byTicketType[a.ticket_type] = (byTicketType[a.ticket_type] || 0) + 1;
  });

  const byCompany = {};
  attendees.forEach((a) => {
    if (a.company) byCompany[a.company] = (byCompany[a.company] || 0) + 1;
  });

  res.json({
    event: { id: event.id, name: event.name, date: event.date, venue: event.venue, code: event.code },
    total,
    checkedIn,
    notArrived: total - checkedIn,
    checkedInRate: total ? Math.round((checkedIn / total) * 100) : 0,
    byTicketType,
    topCompanies: Object.entries(byCompany)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5),
  });
}

module.exports = { getAnalytics };
