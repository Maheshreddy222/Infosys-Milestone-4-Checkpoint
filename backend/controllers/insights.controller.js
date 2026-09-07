const { getDb } = require('../db/database');

// Simple rule-based fallback so the app works even without an API key configured.
function fallbackInsights(summary) {
  const insights = [];

  insights.push(
    `${summary.checkedIn} of ${summary.total} registered attendees have checked in so far (${summary.checkedInRate}%).`
  );

  const tickets = Object.entries(summary.byTicketType);
  if (tickets.length) {
    const [topType, topCount] = tickets.sort((a, b) => b[1] - a[1])[0];
    insights.push(`${topType} is the largest ticket segment with ${topCount} attendees.`);
  }

  if (summary.notArrived > 0) {
    insights.push(
      `${summary.notArrived} registered attendees have not yet checked in — consider sending a reminder.`
    );
  }

  if (summary.topCompanies.length) {
    const [name, count] = summary.topCompanies[0];
    insights.push(`${name} has the largest single-organization presence with ${count} attendees.`);
  }

  return insights;
}

async function buildSummary(eventId) {
  const db = getDb();
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) return null;

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

  return {
    event: event.name,
    date: event.date,
    total,
    checkedIn,
    notArrived: total - checkedIn,
    checkedInRate: total ? Math.round((checkedIn / total) * 100) : 0,
    byTicketType,
    topCompanies: Object.entries(byCompany).sort((a, b) => b[1] - a[1]).slice(0, 5),
  };
}

// AI-GENERATED ATTENDEE INSIGHTS.
// Uses the Anthropic API when ANTHROPIC_API_KEY is set; otherwise falls back
// to rule-based insights computed from the same summary data.
async function generateInsights(req, res) {
  const { eventId } = req.params;
  const summary = await buildSummary(eventId);
  if (!summary) return res.status(404).json({ error: 'event not found' });

  if (summary.total === 0) {
    return res.json({ insights: [], message: 'No attendees registered yet — nothing to analyze.' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.json({ insights: fallbackInsights(summary), source: 'fallback (no ANTHROPIC_API_KEY set)' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content:
              'You are an event operations analyst. Given this attendee registration data as JSON, ' +
              'return 4-6 short, concrete, actionable insights for the event organizer. Focus on ' +
              'check-in pace, ticket mix, notable concentrations of attendees, and operational ' +
              'recommendations. Respond ONLY with a raw JSON array of strings, no markdown, no preamble.\n\n' +
              `Data: ${JSON.stringify(summary)}`,
          },
        ],
      }),
    });

    const data = await response.json();
    const text = (data.content || []).map((b) => b.text || '').join('\n');
    const clean = text.replace(/```json|```/g, '').trim();

    let insights;
    try {
      insights = JSON.parse(clean);
    } catch (e) {
      insights = clean.split('\n').filter((l) => l.trim().length > 8);
    }
    if (!Array.isArray(insights) || insights.length === 0) throw new Error('empty AI response');

    res.json({ insights, source: 'claude-sonnet-4-6' });
  } catch (e) {
    res.json({ insights: fallbackInsights(summary), source: 'fallback (AI request failed)' });
  }
}

module.exports = { generateInsights };
