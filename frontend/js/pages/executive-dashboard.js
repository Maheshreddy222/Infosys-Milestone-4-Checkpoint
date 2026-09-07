let executiveData = null;

document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireAdminOrBlock();
  if (!user) return;
  addExecutiveControls();
  await loadExecutive();
  $('#refreshExec')?.addEventListener('click', loadExecutive);
  $('#execRange')?.addEventListener('change', renderExecutive);
});

function addExecutiveControls() {
  const topbar = document.querySelector('main .topbar');
  if (!topbar || $('#execRange')) return;
  topbar.insertAdjacentHTML('beforeend', `<div class="ops-toolbar compact">
    <label class="filter-label" for="execRange">View</label>
    <select id="execRange" class="input-sm"><option value="all">All events</option><option value="upcoming">Upcoming</option><option value="past">Past</option></select>
    <button class="btn btn-ghost btn-sm" id="refreshExec">Refresh</button>
  </div>`);
  const eventsCard = $('#execEvents')?.closest('.card');
  const oldSummary = $('#execRecommendations')?.closest('.card');
  if (oldSummary) oldSummary.remove();
  if (eventsCard && !$('#execChart')) {
    eventsCard.insertAdjacentHTML('beforebegin', `<div class="two-col exec-grid" style="margin-top:16px">
      <div class="card"><div class="section-kicker">Portfolio pulse</div><h3>Registration and attendance</h3><div id="execChart" class="exec-chart"><div class="empty">Loading…</div></div></div>
      <div class="card"><div class="section-kicker">Decision support</div><div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><h3>Executive summary</h3><span id="execUpdated" class="mono" style="color:var(--dim);font-size:10px"></span></div><div id="execRecommendations" style="margin-top:16px"></div></div>
    </div>`);
  }
}

async function loadExecutive() {
  const refresh = $('#refreshExec');
  if (refresh) refresh.disabled = true;
  try {
    executiveData = await apiGet('/executive-dashboard');
    renderExecutive();
  } catch (e) {
    $('#execEvents').innerHTML = `<div class="empty">${escapeHtml(e.error || 'Could not load executive dashboard.')}</div>`;
  } finally {
    if (refresh) refresh.disabled = false;
  }
}

function renderExecutive() {
  if (!executiveData) return;
  const d = executiveData;
  const range = $('#execRange')?.value || 'all';
  const today = new Date().toISOString().slice(0, 10);
  const events = (Array.isArray(d.events) ? d.events : []).filter(e => range === 'all' || (range === 'upcoming' ? e.date >= today : e.date < today));
  const totals = events.reduce((a, e) => ({
    registrations: a.registrations + e.totalAttendees,
    checkins: a.checkins + e.checkedIn,
    sessions: a.sessions + e.sessions,
    incidents: a.incidents + e.openIncidents,
  }), { registrations: 0, checkins: 0, sessions: 0, incidents: 0 });
  const rate = totals.registrations ? Math.round(totals.checkins / totals.registrations * 100) : 0;
  const items = [['Events', events.length], ['Registrations', totals.registrations], ['Check-ins', totals.checkins], ['Check-in rate', `${rate}%`], ['Sessions', totals.sessions], ['Open incidents', totals.incidents], ['Critical alerts', d.kpis.criticalAlerts], ['Sponsors', d.kpis.sponsors], ['Sponsorship', `₹${Number(d.kpis.totalSponsorship).toLocaleString()}`]];
  $('#execKpis').innerHTML = items.map(([label, value]) => `<div class="card"><div class="metric-label">${label}</div><div class="metric-value">${value}</div></div>`).join('');
  if ($('#execUpdated')) $('#execUpdated').textContent = `Updated ${new Date(d.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  if ($('#execRecommendations')) $('#execRecommendations').innerHTML = (Array.isArray(d.recommendations) ? d.recommendations : []).map((r, i) => `<div class="action-row"><p>${escapeHtml(r)}</p><span class="tag">${i + 1}</span></div>`).join('');
  renderExecutiveChart(events);
  $('#execEvents').innerHTML = events.length ? `<div class="data-table"><table><thead><tr><th>Event</th><th>Date</th><th>Registrations</th><th>Check-in</th><th>Sessions</th><th>Open incidents</th><th>Status</th></tr></thead><tbody>${events.map(e => `<tr><td><a class="table-link" href="event-intelligence.html" data-event-id="${escapeHtml(e.id)}">${escapeHtml(e.name)}</a><div class="mono" style="color:var(--dim);font-size:10px">${escapeHtml(e.id)}</div></td><td>${fmtDate(e.date)}</td><td>${e.totalAttendees}</td><td><div class="mini-bar"><i style="width:${e.checkInRate}%"></i></div><span class="mono">${e.checkInRate}%</span></td><td>${e.sessions}</td><td>${e.openIncidents}</td><td><span class="badge ${e.registrationOpen ? 'in' : 'out'}">${e.registrationOpen ? 'Open' : 'Closed'}</span></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No events match this view.</div>';
  document.querySelectorAll('[data-event-id]').forEach(link => link.addEventListener('click', () => setActiveEventId(link.dataset.eventId)));
}

function renderExecutiveChart(events) {
  const chart = $('#execChart');
  if (!chart) return;
  if (!events.length) { chart.innerHTML = '<div class="empty">No event data for this view.</div>'; return; }
  const max = Math.max(1, ...events.map(e => Math.max(e.totalAttendees, e.checkedIn)));
  chart.innerHTML = events.slice(0, 8).map(e => `<div class="chart-row"><div class="chart-name" title="${escapeHtml(e.name)}">${escapeHtml(e.name)}</div><div class="chart-track"><i class="reg" style="width:${Math.round(e.totalAttendees / max * 100)}%"></i><i class="check" style="width:${Math.round(e.checkedIn / max * 100)}%"></i></div><div class="chart-value mono">${e.checkedIn}/${e.totalAttendees}</div></div>`).join('') + '<div class="chart-legend"><span><i class="reg"></i> Registrations</span><span><i class="check"></i> Check-ins</span></div>';
}