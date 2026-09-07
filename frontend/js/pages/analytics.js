// ANALYTICS PAGE (attendee registration & check-in analytics)

document.addEventListener('DOMContentLoaded', async () => {
  const { activeEvent, user } = await initShared();
  if (!user) return; // already redirected to login by initShared
  const el = $('#analyticsBody');
  if (!activeEvent) {
    el.innerHTML = `<div class="empty"><h3>No event selected</h3><div>Create or select an event first.</div></div>`;
    return;
  }

  let stats;
  try {
    stats = await apiGet(`/events/${activeEvent.id}/analytics`);
  } catch (e) {
    el.innerHTML = `<div class="empty"><h3>Could not load analytics</h3></div>`;
    return;
  }

  const byTicket = stats.byTicketType || {};
  const maxTicket = Math.max(1, ...Object.values(byTicket));

  el.innerHTML = `
    <div class="kpis">
      <div class="kpi"><span>Registered</span><b>${stats.total}</b></div>
      <div class="kpi"><span>Checked in</span><b style="color:var(--green)">${stats.checkedIn}</b></div>
      <div class="kpi"><span>Not yet arrived</span><b style="color:var(--amber)">${stats.notArrived}</b></div>
      <div class="kpi"><span>Check-in rate</span><b>${stats.checkedInRate}%</b></div>
    </div>
    <div class="grid2">
      <div class="card">
        <h3>Ticket type breakdown</h3>
        <div class="bars">
          ${Object.keys(byTicket).length === 0 ? '<div class="empty">No registrations yet</div>' :
            Object.entries(byTicket).map(([k, v]) => `
              <div class="bar-row"><span>${escapeHtml(k)}</span><div class="bar-track"><div class="bar-fill" style="width:${(v / maxTicket) * 100}%"></div></div><span>${v}</span></div>
            `).join('')}
        </div>
      </div>
      <div class="card">
        <h3>Event details</h3>
        <div class="bars">
          <div class="bar-row" style="grid-template-columns:100px 1fr;"><span>Date</span><span style="color:var(--text)">${fmtDate(activeEvent.date)}</span></div>
          <div class="bar-row" style="grid-template-columns:100px 1fr;"><span>Venue</span><span style="color:var(--text)">${escapeHtml(activeEvent.venue || '—')}</span></div>
          <div class="bar-row" style="grid-template-columns:100px 1fr;"><span>Event code</span><span class="mono" style="color:var(--text)">${escapeHtml(activeEvent.code)}</span></div>
        </div>
      </div>
    </div>
  `;
});
