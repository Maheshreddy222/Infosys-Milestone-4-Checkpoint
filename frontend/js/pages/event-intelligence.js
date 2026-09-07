document.addEventListener('DOMContentLoaded', async () => {
  const ctx = await initShared();
  if (!ctx.user) return;
  if (!isAdmin(ctx.user)) { lockPageForAccount(ctx.user); return; }
  enhanceIntelSurface();
  window.__intelEventId = ctx.activeEventId;
  loadIntelligence(ctx.activeEventId);
  $('#refreshIntel')?.addEventListener('click', () => loadIntelligence(window.__intelEventId));
});

function enhanceIntelSurface() {
  const top = document.querySelector('main .topbar');
  if (top) top.querySelector('.sub').textContent = 'A live operating picture assembled from registrations, sessions, resources, sponsors and incidents.';
  const oldHealth = document.querySelector('main > .card');
  if (oldHealth) {
    oldHealth.className = 'card hero-card';
    oldHealth.innerHTML = `<div class="health-layout"><div><div class="section-kicker">Event health</div><h3 id="eventTitle">Loading event…</h3><div id="eventMeta" class="sub" style="color:var(--dim);font-size:12px;margin-top:5px">Loading current event context…</div><div id="healthNarrative" class="sub" style="margin-top:14px;color:var(--muted)"></div></div><div id="healthScore" class="health-ring" style="--health:0%"><strong>—</strong><span>health</span></div></div>`;
  }
  const metrics = $('#intelMetrics');
  if (metrics) metrics.insertAdjacentHTML('beforebegin', `<div class="ops-toolbar"><button class="btn btn-ghost btn-sm" id="refreshIntel">Refresh data</button><span class="live-dot"><i></i> Live operational view</span><span id="intelUpdated" class="data-freshness">Waiting for data</span></div>`);
  const risks = $('#risks')?.closest('.card');
  if (risks) risks.insertAdjacentHTML('beforebegin', `<div class="card trend-card"><div class="section-kicker">Operational distribution</div><h3>Current signal mix</h3><div id="signalBars" class="trend-bars"><div class="empty">Loading…</div></div></div>`);
  if ($('#refreshIntel')) $('#refreshIntel').addEventListener('click', () => loadIntelligence(window.__intelEventId));
}

async function loadIntelligence(id) {
  if (!id) return;
  const refresh = $('#refreshIntel'); if (refresh) refresh.disabled = true;
  try {
    const d = await apiGet(`/events/${id}/intelligence`);
    $('#eventTitle').textContent = d.event.name;
    $('#eventMeta').textContent = `${fmtDate(d.event.date)} · ${d.event.registration_open ? 'Registrations open' : 'Registrations stopped'} · ${d.event.code || 'No event code'}`;
    const score = $('#healthScore'); score.style.setProperty('--health', `${d.health}%`); score.innerHTML = `<strong>${d.health}</strong><span>health</span>`;
    $('#healthNarrative').textContent = d.health >= 80 ? 'No immediate operational blockers detected.' : `${d.risks.length} signal${d.risks.length === 1 ? '' : 's'} need attention before the next operating checkpoint.`;
    const m = d.metrics;
    const items = [['Attendees',m.attendees],['Check-ins',m.checkedIn],['Check-in rate',m.checkInRate+'%'],['Sessions',m.sessions],['Open incidents',m.openIncidents],['Critical alerts',m.criticalAlerts],['Venue pool',m.venues],['Speaker pool',m.speakers],['Sponsors',m.sponsors]];
    $('#intelMetrics').innerHTML = items.map(x => `<div class="card"><div style="font:10px var(--mono);color:var(--dim);text-transform:uppercase">${x[0]}</div><div style="font:26px var(--disp);margin-top:6px">${x[1]}</div></div>`).join('');
    const signals = [['Attendees',m.attendees],['Sessions',m.sessions],['Open incidents',m.openIncidents],['Resources',m.venues + m.speakers + m.sponsors]];
    const max = Math.max(1, ...signals.map(x => x[1]));
    $('#signalBars').innerHTML = signals.map(x => `<div class="trend-bar" style="height:${Math.max(8, x[1] / max * 100)}%" title="${x[0]}: ${x[1]}"><small>${x[0].slice(0,4)}</small></div>`).join('');
    $('#risks').innerHTML = d.risks.length ? d.risks.map(r => `<div class="risk-row"><i class="risk-dot"></i><span>${escapeHtml(r)}</span></div>`).join('') : '<div class="empty">No active risks detected.</div>';
    $('#recommendations').innerHTML = d.recommendations.length ? d.recommendations.map((r,i) => `<div class="action-row"><p>${escapeHtml(r)}</p><span class="tag">${i+1}</span></div>`).join('') : '<div class="empty">No recommendations.</div>';
    $('#sources').innerHTML = Object.entries(d.dataSources).map(([k,v]) => `<span class="pill on">${k}: ${v}</span>`).join('');
    $('#intelIncidents').innerHTML = d.incidents?.length ? `<div class="section-kicker">Recent incident signals</div>${d.incidents.slice(0,4).map(i => `<div class="history-row"><span>${escapeHtml(i.title || i.description || 'Incident')}</span><span class="badge ${i.priority === 'critical' ? 'out' : 'vip'}">${escapeHtml(i.status || 'open')}</span></div>`).join('')}` : '';
    if ($('#intelUpdated')) $('#intelUpdated').textContent = `Updated ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`;
  } catch (e) { $('#eventMeta').textContent = e.error || 'Could not load intelligence. Retry when the API is available.'; }
  finally { if (refresh) refresh.disabled = false; }
}