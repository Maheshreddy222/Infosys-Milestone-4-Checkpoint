let lastOrchestration = null;

document.addEventListener('DOMContentLoaded', async () => {
  const ctx = await initShared();
  if (!ctx.user) return;
  if (!isAdmin(ctx.user)) { lockPageForAccount(ctx.user); return; }
  addOrchestrationSurface();
  $('#runAgentsBtn').addEventListener('click', () => runAgents(ctx.activeEventId));
});

function addOrchestrationSurface() {
  const card = $('#agentCards');
  if (!card || $('#agentSummary')) return;
  card.insertAdjacentHTML('beforebegin', `<div class="status-grid" id="agentSummary" style="margin-top:16px">
    <div class="status-stat"><span>Agents</span><b>—</b></div><div class="status-stat"><span>Completed</span><b>—</b></div><div class="status-stat"><span>Results</span><b>—</b></div>
  </div>`);
  card.insertAdjacentHTML('afterend', `<div class="card" style="margin-top:16px"><div class="section-kicker">Recent run</div><h3>Execution details</h3><div id="agentHistory" class="history-list"><div class="empty">No orchestration run yet.</div></div></div>`);
  const top = document.querySelector('main .topbar');
  top?.querySelector('.sub')?.insertAdjacentHTML('afterend', '<div class="live-dot" id="agentHealth"><i></i> Ready</div>');
}

async function runAgents(id) {
  if (!id) { alert('Select an event first.'); return; }
  const button = $('#runAgentsBtn');
  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span> Running…';
  $('#orchestrationStatus').innerHTML = '<div class="msg show">Collecting current event data and running the agents…</div>';
  $('#agentHealth').innerHTML = '<i></i> Running';
  try {
    lastOrchestration = await apiPost(`/events/${id}/orchestration`, {});
    const d = lastOrchestration;
    const completed = d.agents.filter(a => a.status === 'completed').length;
    const results = d.agents.reduce((sum, a) => sum + (a.resultCount || 0), 0);
    $('#agentSummary').innerHTML = [['Agents', d.agents.length], ['Completed', `${completed}/${d.agents.length}`], ['Results', results]].map(([l, v]) => `<div class="status-stat"><span>${l}</span><b>${v}</b></div>`).join('');
    $('#orchestrationStatus').innerHTML = `<div class="msg success show">${escapeHtml(d.message)} <span class="mono">${new Date(d.orchestratedAt).toLocaleTimeString()}</span></div>`;
    $('#agentCards').innerHTML = d.agents.map(a => `<div class="agent-card ${a.status === 'completed' ? 'top' : 'running'}"><div class="agent-head"><div><h4>${escapeHtml(a.agent)}</h4><div class="meta">${escapeHtml(a.status)} · evaluated just now</div></div><div class="score-pill">${a.resultCount || 0}<span>results</span></div></div><p class="reasoning">${escapeHtml(a.message || 'Agent completed successfully using the current event context.')}</p>${a.critical != null ? `<div class="pill-list"><span class="pill">Critical alerts: ${a.critical}</span></div>` : ''}</div>`).join('');
    $('#agentHistory').innerHTML = `<div class="history-row"><span><b>${escapeHtml(d.event.name)}</b><br><span class="data-freshness">Full portfolio evaluation</span></span><span class="badge in">${completed} completed</span></div>`;
    $('#agentHealth').innerHTML = `<i></i> ${completed === d.agents.length ? 'Healthy' : 'Attention needed'}`;
  } catch (e) {
    $('#orchestrationStatus').innerHTML = `<div class="msg error show">${escapeHtml(e.error || 'Agent orchestration failed.')}</div>`;
    $('#agentHealth').innerHTML = '<i></i> Error';
  } finally {
    button.disabled = false;
    button.innerHTML = '▶ Run orchestration';
  }
}