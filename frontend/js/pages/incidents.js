// INCIDENTS PAGE — on BOTH dashboards, with different capabilities:
//   user  — can only log a new incident (no visibility into the incident
//           list, alerts, or resolution workflow)
//   admin — full workflow: log → auto-categorize/assign team/notify →
//           investigate → resolve (with notes) → verify → close (with a
//           generated report), plus operational alerts.
// The server enforces the same split (see routes/incidents.routes.js);
// the UI differences here are for a clean experience, not the security boundary.

let CTX = { activeEventId: null, activeEvent: null };
let currentFilter = '';

document.addEventListener('DOMContentLoaded', async () => {
  CTX = await initShared();
  if (!CTX.user) return; // already redirected to login by initShared
  if (!CTX.activeEvent) {
    $('#incidentTopRow').outerHTML = `<div class="empty"><h3>No event selected</h3><div>Create or select an event first.</div></div>`;
    $$('#incidentsManagement, #criticalAlertsBanner').forEach(el => el.remove());
    return;
  }

  if (!isAdmin(CTX.user)) {
    // Users can only log an incident — hide alerts panel and the whole
    // management/resolution section entirely.
    $('#opsAlertsCard').remove();
    $('#incidentsManagement').remove();
    $('#criticalAlertsBanner').remove();
  }

  $('#incSeverity').addEventListener('input', () => { $('#incSeverityVal').textContent = $('#incSeverity').value; });
  $('#createIncidentBtn').addEventListener('click', createIncident);

  if (isAdmin(CTX.user)) {
    $('#refreshAlertsBtn').addEventListener('click', refreshAlerts);
    $$('.pill[data-filter]').forEach(p => p.addEventListener('click', () => {
      currentFilter = p.dataset.filter;
      $$('.pill[data-filter]').forEach(x => x.classList.remove('on'));
      p.classList.add('on');
      refreshIncidentsList();
    }));
    await refreshIncidentsList();
    await refreshAlerts();
  }
});

function renderCriticalBanner(alertsList) {
  const box = $('#criticalAlertsBanner');
  if (!box) return;
  const criticalItems = (alertsList || []).filter(a => a.critical);
  if (criticalItems.length === 0) {
    box.innerHTML = '';
    return;
  }
  box.innerHTML = `
    <div class="critical-banner">
      <div class="cb-head"><span class="dot"></span><span>Critical Alerts — require immediate action</span></div>
      ${criticalItems.map(a => `<div class="cb-item">${escapeHtml(a.message)}</div>`).join('')}
    </div>
  `;
}

async function createIncident() {
  const msg = $('#incidentMsg');
  msg.classList.remove('show');
  const description = $('#incDescription').value.trim();
  if (!description) {
    msg.textContent = 'A description is required.';
    msg.className = 'msg error show';
    return;
  }

  const btn = $('#createIncidentBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Logging…';

  try {
    const result = await apiPost(`/events/${CTX.activeEvent.id}/incidents`, {
      type: $('#incType').value, description,
      location: $('#incLocation').value.trim(),
      severity: $('#incSeverity').value, reportedBy: $('#incReportedBy').value.trim(),
    });
    msg.textContent = result.message;
    msg.className = 'msg success show';
    $('#incDescription').value = ''; $('#incLocation').value = ''; $('#incReportedBy').value = '';
    if (isAdmin(CTX.user)) {
      await refreshIncidentsList();
      await refreshAlerts();
    }
  } catch (e) {
    msg.textContent = e.error || 'Could not log the incident — please try again.';
    msg.className = 'msg error show';
  } finally {
    btn.disabled = false; btn.innerHTML = 'Log incident';
  }
}

const PRIORITY_BADGE = { critical: 'out', high: 'out', medium: 'vip', low: 'in' };
const STATUS_BADGE = { open: 'out', in_progress: 'vip', escalated: 'out', resolved: 'vip', verified: 'vip', closed: 'in' };

async function refreshIncidentsList() {
  const wrap = $('#incidentsList');
  const q = currentFilter ? `?status=${currentFilter}` : '';
  const incidents = await apiGet(`/events/${CTX.activeEvent.id}/incidents${q}`);
  if (incidents.length === 0) {
    wrap.innerHTML = `<div class="empty"><h3>No incidents</h3><div>Nothing reported${currentFilter ? ' with this status' : ' yet'}.</div></div>`;
    return;
  }
  wrap.innerHTML = `<table><thead><tr><th>Type</th><th>Description</th><th>Team</th><th>Priority</th><th>Status</th><th></th></tr></thead><tbody>
    ${incidents.map(i => `
      <tr>
        <td class="mono" style="text-transform:capitalize;">${escapeHtml(i.type)}</td>
        <td>${escapeHtml(i.description)}${i.is_critical_alert ? `<span class="critical-badge">CRITICAL</span>` : ''}<div style="color:var(--dim); font-size:11px;">Severity ${i.severity}/5 · ${escapeHtml(i.location || 'no location')} · reported ${fmtTime(i.reported_at)}</div></td>
        <td class="mono" style="font-size:11.5px;">${escapeHtml(i.assigned_team || '—')}</td>
        <td><span class="badge ${PRIORITY_BADGE[i.priority] || 'out'}">${escapeHtml(i.priority)} (${i.urgency_score})</span></td>
        <td><span class="badge ${STATUS_BADGE[i.status] || 'out'}">${escapeHtml(i.status.replace('_', ' '))}</span></td>
        <td>${actionButtons(i)}</td>
      </tr>
      ${i.recommended_action ? `<tr><td colspan="6" style="color:var(--dim); font-size:11.5px; padding-top:0;">↳ Suggested: ${escapeHtml(i.recommended_action)}</td></tr>` : ''}
    `).join('')}
  </tbody></table>`;

  $$('button[data-status]', wrap).forEach(btn => btn.addEventListener('click', () => handleStatusChange(btn)));
  $$('button[data-report]', wrap).forEach(btn => btn.addEventListener('click', () => showReport(btn.dataset.report)));
}

function actionButtons(i) {
  if (i.status === 'open' || i.status === 'escalated') {
    return `<button class="btn btn-ghost btn-sm" data-status="in_progress" data-id="${i.id}">Investigate</button>`;
  }
  if (i.status === 'in_progress') {
    return `<button class="btn btn-ghost btn-sm" data-status="resolved" data-id="${i.id}">Resolve</button>`;
  }
  if (i.status === 'resolved') {
    return `<button class="btn btn-ghost btn-sm" data-status="verified" data-id="${i.id}">Verify</button>`;
  }
  if (i.status === 'verified') {
    return `<button class="btn btn-ghost btn-sm" data-status="closed" data-id="${i.id}">Close</button>`;
  }
  if (i.status === 'closed') {
    return `<button class="btn btn-ghost btn-sm" data-report="${i.id}">View report</button>`;
  }
  return '';
}

async function handleStatusChange(btn) {
  const status = btn.dataset.status;
  const id = btn.dataset.id;
  let resolutionNotes;
  if (status === 'resolved') {
    resolutionNotes = window.prompt('Resolution notes (what fixed it):');
    if (resolutionNotes === null) return; // cancelled
  }
  try {
    await apiPatch(`/events/${CTX.activeEvent.id}/incidents/${id}/status`, { status, resolutionNotes });
    await refreshIncidentsList();
    await refreshAlerts();
  } catch (e) {
    alert(e.error || 'Could not update the incident.');
  }
}

async function showReport(id) {
  try {
    const report = await apiGet(`/events/${CTX.activeEvent.id}/incidents/${id}/report`);
    alert(
      `Incident report\n\n` +
      `Type: ${report.type}\n` +
      `Priority: ${report.priority}\n` +
      `Assigned team: ${report.assignedTeam || '—'}\n` +
      `Resolution notes: ${report.resolutionNotes || '—'}\n` +
      `Resolution time: ${report.resolutionMinutes != null ? report.resolutionMinutes + ' min' : '—'}\n` +
      `Total time to close: ${report.totalMinutes != null ? report.totalMinutes + ' min' : '—'}\n\n` +
      report.summary
    );
  } catch (e) {
    alert('Could not load the report.');
  }
}

const ALERT_BADGE = { critical: 'out', high: 'out', medium: 'vip', low: 'in' };

async function refreshAlerts() {
  const box = $('#alertsList');
  const result = await apiGet(`/events/${CTX.activeEvent.id}/incidents/alerts`);
  renderCriticalBanner(result.alerts);
  const nonCritical = (result.alerts || []).filter(a => !a.critical);
  if (nonCritical.length === 0) {
    box.innerHTML = `<div class="empty" style="padding:20px;">No other active alerts — operations look normal.</div>`;
    return;
  }
  box.innerHTML = nonCritical.map(a => `
    <div class="scan-row ${a.level === 'critical' || a.level === 'high' ? 'fail' : 'dup'}">
      <div class="rn" style="font-weight:500; font-size:12.5px;">${escapeHtml(a.message)}</div>
      <span class="badge ${ALERT_BADGE[a.level] || 'vip'}">${escapeHtml(a.level)}</span>
    </div>
  `).join('');
}
