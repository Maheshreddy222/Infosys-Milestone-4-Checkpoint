// OPERATIONS PAGE — real-time monitoring dashboard + analytical reports
// + AI-based recommendations, combining incidents and sponsors.

let CTX = { activeEventId: null, activeEvent: null };

document.addEventListener('DOMContentLoaded', async () => {
  CTX = await initShared();
  if (!isAdmin(CTX.user)) { lockPageForAccount(CTX.user); return; }
  const el = $('#operationsBody');
  if (!CTX.activeEvent) {
    el.innerHTML = `<div class="empty"><h3>No event selected</h3><div>Create or select an event first.</div></div>`;
    $('#genOpsRecsBtn').closest('.card').remove();
    return;
  }

  $('#genOpsRecsBtn').addEventListener('click', generateOpsRecommendations);
  await renderDashboard();
  await refreshLiveNotifications();
  setInterval(refreshLiveNotifications, 20000); // poll every 20s for a "live" feed
});

const NOTIF_ICON_LEVEL = { high: 'high', medium: 'medium', low: '' };

async function refreshLiveNotifications() {
  const box = $('#liveNotificationsList');
  if (!box) return;
  let result;
  try {
    result = await apiGet(`/events/${CTX.activeEvent.id}/operations-analytics/live-notifications`);
  } catch (e) {
    box.innerHTML = `<div class="empty">Could not load live notifications.</div>`;
    return;
  }
  const notifications = result.notifications || [];
  if (notifications.length === 0) {
    box.innerHTML = `<div class="empty" style="padding:16px;">Nothing happening right now — check back shortly.</div>`;
    return;
  }
  box.innerHTML = notifications.map(n => `
    <div class="notif-row ${NOTIF_ICON_LEVEL[n.level] || ''}">
      <div class="nt">${escapeHtml(n.message)}</div>
      <div class="ntime">${n.minutesAgo > 0 ? `${n.minutesAgo}m ago` : n.minutesAgo < 0 ? `in ${-n.minutesAgo}m` : 'now'}</div>
    </div>
  `).join('');
}

function renderCriticalBanner(criticalAlerts) {
  const box = $('#criticalAlertsBanner');
  if (!criticalAlerts || criticalAlerts.length === 0) {
    box.innerHTML = '';
    return;
  }
  box.innerHTML = `
    <div class="critical-banner">
      <div class="cb-head"><span class="dot"></span><span>Critical Alerts — require immediate action</span></div>
      ${criticalAlerts.map(a => `<div class="cb-item"><b>${escapeHtml(a.reason)}</b>: ${escapeHtml(a.description)}${a.location ? ' at ' + escapeHtml(a.location) : ''}</div>`).join('')}
    </div>
  `;
}

function renderEventHealth(event, attendance, sessions) {
  const box = $('#eventHealthBanner');
  if (!box || !event) return;
  const completed = event.datePassed;
  const closedReason = completed
    ? 'The event date has passed. Registrations were closed automatically.'
    : 'An administrator has closed new registrations for this event.';
  box.innerHTML = `
    <div class="event-health ${event.registrationOpen ? 'open' : 'closed'} ${completed ? 'completed' : ''}">
      <div class="event-health-main">
        <div class="event-health-kicker">EVENT OPERATIONS</div>
        <h2>${escapeHtml(event.name)}</h2>
        <div class="event-health-meta">${fmtDate(event.date)}${event.venue ? ` · ${escapeHtml(event.venue)}` : ''}</div>
      </div>
      <div class="event-health-status">
        <span class="status-dot"></span>
        <div><b>${completed ? 'Event completed' : event.registrationOpen ? 'Registrations open' : 'Registrations closed'}</b>
        <small>${event.registrationOpen ? 'Accepting new attendees' : closedReason}</small></div>
      </div>
      <div class="event-health-progress">
        <div><span>Check-in progress</span><b>${attendance.checkInRate}%</b></div>
        <div class="progress-track"><div style="width:${attendance.checkInRate}%"></div></div>
        <small>${attendance.checkedIn} of ${attendance.registered} registered attendees checked in · ${sessions.scheduled} scheduled sessions</small>
      </div>
    </div>
  `;
}

async function renderDashboard() {
  const el = $('#operationsBody');
  let stats;
  try {
    stats = await apiGet(`/events/${CTX.activeEvent.id}/operations-analytics`);
  } catch (e) {
    el.innerHTML = `<div class="empty"><h3>Could not load operations analytics</h3></div>`;
    return;
  }

  renderCriticalBanner(stats.incidents.criticalAlerts);
  renderEventHealth(stats.event, stats.attendance, stats.sessions);

  const typeEntries = Object.entries(stats.incidents.byType || {});
  const maxType = Math.max(1, ...typeEntries.map(([, v]) => v));
  const tierEntries = Object.entries(stats.sponsors.byTier || {});
  const maxTier = Math.max(1, ...tierEntries.map(([, v]) => v));
  const pr = stats.incidents.byPriority;

  el.innerHTML = `
     <div class="kpis ops-kpis">
       <div class="kpi"><span>Registered</span><b>${stats.attendance.registered}</b><small>attendees</small></div>
       <div class="kpi"><span>Checked in</span><b style="color:var(--green)">${stats.attendance.checkedIn}</b><small>${stats.attendance.checkInRate}% of registered</small></div>
       <div class="kpi"><span>Open incidents</span><b style="color:var(--amber)">${stats.incidents.open}</b><small>${stats.incidents.escalated} escalated</small></div>
       <div class="kpi"><span>Resolution time</span><b>${stats.incidents.avgResolutionMinutes != null ? stats.incidents.avgResolutionMinutes + ' min' : '—'}</b><small>average</small></div>
       <div class="kpi"><span>Sponsor contribution</span><b>₹${stats.sponsors.totalContribution}</b><small>${stats.sponsors.total} sponsors</small></div>
    </div>

    <div class="grid2">
      <div class="card">
        <h3>Incidents by priority</h3>
        <div class="bars">
          <div class="bar-row"><span>Critical</span><div class="bar-track"><div class="bar-fill" style="width:${(pr.critical / Math.max(1, stats.incidents.total)) * 100}%; background:var(--red)"></div></div><span>${pr.critical}</span></div>
          <div class="bar-row"><span>High</span><div class="bar-track"><div class="bar-fill" style="width:${(pr.high / Math.max(1, stats.incidents.total)) * 100}%; background:var(--amber)"></div></div><span>${pr.high}</span></div>
          <div class="bar-row"><span>Medium</span><div class="bar-track"><div class="bar-fill" style="width:${(pr.medium / Math.max(1, stats.incidents.total)) * 100}%"></div></div><span>${pr.medium}</span></div>
          <div class="bar-row"><span>Low</span><div class="bar-track"><div class="bar-fill" style="width:${(pr.low / Math.max(1, stats.incidents.total)) * 100}%; background:var(--green)"></div></div><span>${pr.low}</span></div>
        </div>
      </div>
      <div class="card">
        <h3>Incidents by type</h3>
        <div class="bars">
          ${typeEntries.length === 0 ? '<div class="empty">No incidents logged yet</div>' :
            typeEntries.map(([k, v]) => `<div class="bar-row"><span style="text-transform:capitalize;">${escapeHtml(k)}</span><div class="bar-track"><div class="bar-fill" style="width:${(v / maxType) * 100}%"></div></div><span>${v}</span></div>`).join('')}
        </div>
      </div>
    </div>

    <div class="grid2" style="margin-top:16px;">
      <div class="card">
        <h3>Sponsors by tier</h3>
        <div class="bars">
          ${tierEntries.length === 0 ? '<div class="empty">No sponsors yet</div>' :
            tierEntries.map(([k, v]) => `<div class="bar-row"><span>${escapeHtml(k)}</span><div class="bar-track"><div class="bar-fill" style="width:${(v / maxTier) * 100}%"></div></div><span>${v}</span></div>`).join('')}
        </div>
      </div>
      <div class="card">
        <h3>Report summary</h3>
        <div class="bars">
          <div class="bar-row" style="grid-template-columns:150px 1fr;"><span>Total incidents</span><span style="color:var(--text)">${stats.incidents.total}</span></div>
          <div class="bar-row" style="grid-template-columns:150px 1fr;"><span>Resolved</span><span style="color:var(--text)">${stats.incidents.resolved}</span></div>
          <div class="bar-row" style="grid-template-columns:150px 1fr;"><span>Total sponsors</span><span style="color:var(--text)">${stats.sponsors.total}</span></div>
          <div class="bar-row" style="grid-template-columns:150px 1fr;"><span>Avg. deliverable fulfillment</span><span style="color:var(--text)">${stats.sponsors.avgFulfillmentPct}%</span></div>
        </div>
      </div>
    </div>
  `;
}

async function generateOpsRecommendations() {
  const btn = $('#genOpsRecsBtn');
  const out = $('#opsRecsOut');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Analyzing…';
  out.innerHTML = '';

  try {
    const result = await apiPost(`/events/${CTX.activeEvent.id}/operations-analytics/recommendations`, {});
    if (!result.recommendations || result.recommendations.length === 0) {
      out.innerHTML = `<div class="msg info show">${escapeHtml(result.message || 'No data to analyze yet.')}</div>`;
      return;
    }
    out.innerHTML = result.recommendations.map((txt, i) => `
      <div class="insight"><div class="tag">${i + 1}</div><p>${escapeHtml(txt)}</p></div>
    `).join('') + (result.source ? `<div class="sub" style="color:var(--dim); font-size:11px; margin-top:6px;">source: ${escapeHtml(result.source)}</div>` : '');
  } catch (e) {
    out.innerHTML = `<div class="msg error show">Couldn't generate recommendations right now. Please try again.</div>`;
  } finally {
    btn.disabled = false; btn.innerHTML = '✨ Generate recommendations';
  }
}
