// PAST EVENTS PAGE — events whose date has already passed.

document.addEventListener('DOMContentLoaded', async () => {
  const { user } = await initShared();
  if (!user) return; // already redirected to login by initShared

  const el = $('#pastEventsBody');
  let events;
  try {
    events = await apiGet('/events');
  } catch (e) {
    el.innerHTML = `<div class="empty"><h3>Could not load events</h3></div>`;
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const past = events.filter(e => e.date < today).sort((a, b) => b.date.localeCompare(a.date));

  if (past.length === 0) {
    el.innerHTML = `<div class="empty"><h3>No past events</h3><div>Events move here automatically once their date has passed.</div></div>`;
    return;
  }

  el.innerHTML = `<div class="card"><table><thead><tr><th>Event</th><th>Date</th><th>Venue</th><th>Code</th></tr></thead><tbody>
    ${past.map(e => `
      <tr>
        <td><b style="color:var(--text)">${escapeHtml(e.name)}</b>${e.description ? `<div style="color:var(--dim); font-size:12px; margin-top:2px;">${escapeHtml(e.description)}</div>` : ''}</td>
        <td>${fmtDate(e.date)}</td>
        <td>${escapeHtml(e.venue || '—')}</td>
        <td class="mono">${escapeHtml(e.code)}</td>
      </tr>
    `).join('')}
  </tbody></table></div>`;
});
