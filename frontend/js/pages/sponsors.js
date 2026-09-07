// SPONSORS PAGE — sponsor CRUD, performance tracking, Sponsorship Agent
// recommendations, and the performance dashboard with "at risk" alerts.

let CTX = { activeEventId: null, activeEvent: null };

document.addEventListener('DOMContentLoaded', async () => {
  CTX = await initShared();
  if (!isAdmin(CTX.user)) { lockPageForAccount(CTX.user); return; }
  if (!CTX.activeEvent) {
    $('.two-col').outerHTML = `<div class="empty"><h3>No event selected</h3><div>Create or select an event first.</div></div>`;
    $$('#sponsorsList, #sponsorDashboardTable, #sponsorResults').forEach(el => el.closest('.card, div')?.remove());
    return;
  }

  wireRatingSliders();
  $('#createSponsorBtn').addEventListener('click', createSponsor);
  $('#recommendSponsorBtn').addEventListener('click', recommendSponsors);
  await refreshSponsorsList();
  await refreshDashboard();
});

function wireRatingSliders() {
  [['spEngagement', 'spEngagementVal'], ['spReliability', 'spReliabilityVal'], ['spSatisfaction', 'spSatisfactionVal']].forEach(([id, valId]) => {
    const input = $('#' + id);
    const val = $('#' + valId);
    input.addEventListener('input', () => { val.textContent = input.value; });
  });
}

async function refreshSponsorsList() {
  const list = $('#sponsorsList');
  const sponsors = await apiGet(`/events/${CTX.activeEvent.id}/sponsors`);
  if (sponsors.length === 0) {
    list.innerHTML = `<div class="empty"><h3>No sponsors yet</h3><div>Add a sponsor above so the Sponsorship Agent has options to recommend from.</div></div>`;
    return;
  }
  list.innerHTML = `<table><thead><tr><th>Sponsor</th><th>Tier / Category</th><th>Contribution</th><th>Fulfillment</th><th>Scores</th><th></th></tr></thead><tbody>
    ${sponsors.map(s => `
      <tr>
        <td><b style="color:var(--text)">${escapeHtml(s.name)}</b><div style="color:var(--dim); font-size:12px;">${escapeHtml(s.contact_name || '—')}</div></td>
        <td><span class="badge vip">${escapeHtml(s.tier)}</span> <span class="mono" style="font-size:11px; color:var(--dim);">${escapeHtml(s.category || '—')}</span></td>
        <td>₹${s.contribution_amount}</td>
        <td>
          <div class="bar-track" style="width:90px;"><div class="bar-fill" style="width:${s.deliverables_fulfilled_pct}%"></div></div>
          <span class="mono" style="font-size:11px;">${s.deliverables_fulfilled_pct}%</span>
        </td>
        <td class="mono" style="font-size:11.5px;">Eng ${s.engagement_score}/5 · Rel ${s.reliability_score}/5 · Sat ${s.satisfaction_score}/5</td>
        <td><button class="btn btn-ghost btn-sm" data-edit-perf="${s.id}">Update performance</button></td>
      </tr>
      <tr id="perf-row-${s.id}" class="hide"><td colspan="6">${performanceEditForm(s)}</td></tr>
    `).join('')}
  </tbody></table>`;

  $$('button[data-edit-perf]', list).forEach(btn => btn.addEventListener('click', () => {
    $(`#perf-row-${btn.dataset.editPerf}`).classList.toggle('hide');
  }));
  $$('button[data-save-perf]', list).forEach(btn => btn.addEventListener('click', () => savePerformance(btn.dataset.savePerf)));
}

function performanceEditForm(s) {
  return `
    <div class="grid2" style="padding:12px 0;">
      <div class="field-row"><label>Deliverables fulfilled (%)</label><input id="pf-deliv-${s.id}" type="number" min="0" max="100" value="${s.deliverables_fulfilled_pct}"></div>
      <div class="field-row"><label>Engagement score (1-5)</label><input id="pf-eng-${s.id}" type="number" min="1" max="5" value="${s.engagement_score}"></div>
      <div class="field-row"><label>Reliability score (1-5)</label><input id="pf-rel-${s.id}" type="number" min="1" max="5" value="${s.reliability_score}"></div>
      <div class="field-row"><label>Satisfaction score (1-5)</label><input id="pf-sat-${s.id}" type="number" min="1" max="5" value="${s.satisfaction_score}"></div>
      <div class="field-row"><label>Booth visits</label><input id="pf-booth-${s.id}" type="number" min="0" value="${s.booth_visits}"></div>
      <div class="field-row"><label>Leads generated</label><input id="pf-leads-${s.id}" type="number" min="0" value="${s.leads_generated}"></div>
      <div class="field-row"><label>Session participation</label><input id="pf-sess-${s.id}" type="number" min="0" value="${s.session_participation}"></div>
      <div class="field-row"><label>Social media engagement</label><input id="pf-social-${s.id}" type="number" min="0" value="${s.social_media_engagement}"></div>
      <div class="field-row"><label>ROI indicator (%)</label><input id="pf-roi-${s.id}" type="number" min="0" value="${s.roi_indicator}"></div>
      <div class="field-row"><label>Conversion rate (%)</label><input id="pf-conv-${s.id}" type="number" min="0" max="100" value="${s.conversion_rate}"></div>
    </div>
    <button class="btn btn-amber btn-sm" data-save-perf="${s.id}">Save performance</button>
  `;
}

async function savePerformance(sponsorId) {
  await apiPatch(`/events/${CTX.activeEvent.id}/sponsors/${sponsorId}/performance`, {
    deliverablesFulfilledPct: $(`#pf-deliv-${sponsorId}`).value,
    engagementScore: $(`#pf-eng-${sponsorId}`).value,
    reliabilityScore: $(`#pf-rel-${sponsorId}`).value,
    satisfactionScore: $(`#pf-sat-${sponsorId}`).value,
    boothVisits: $(`#pf-booth-${sponsorId}`).value,
    leadsGenerated: $(`#pf-leads-${sponsorId}`).value,
    sessionParticipation: $(`#pf-sess-${sponsorId}`).value,
    socialMediaEngagement: $(`#pf-social-${sponsorId}`).value,
    roiIndicator: $(`#pf-roi-${sponsorId}`).value,
    conversionRate: $(`#pf-conv-${sponsorId}`).value,
  });
  await refreshSponsorsList();
  await refreshDashboard();
}

async function createSponsor() {
  const msg = $('#sponsorMsg');
  msg.classList.remove('show');
  const name = $('#spName').value.trim();
  if (!name) {
    msg.textContent = 'Sponsor name is required.';
    msg.className = 'msg error show';
    return;
  }

  const btn = $('#createSponsorBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Adding…';

  try {
    await apiPost(`/events/${CTX.activeEvent.id}/sponsors`, {
      name, tier: $('#spTier').value, category: $('#spCategory').value.trim(),
      contributionAmount: $('#spContribution').value, deliverablesPromised: $('#spDeliverables').value.trim(),
      contactName: $('#spContactName').value.trim(), contactEmail: $('#spContactEmail').value.trim(),
      engagementScore: $('#spEngagement').value, reliabilityScore: $('#spReliability').value,
      satisfactionScore: $('#spSatisfaction').value, boothVisits: $('#spBoothVisits').value,
      leadsGenerated: $('#spLeadsGenerated').value, sessionParticipation: $('#spSessionParticipation').value,
      socialMediaEngagement: $('#spSocialMedia').value, roiIndicator: $('#spRoi').value,
      conversionRate: $('#spConversion').value,
    });
    $('#spName').value = ''; $('#spCategory').value = ''; $('#spContribution').value = '';
    $('#spDeliverables').value = ''; $('#spContactName').value = ''; $('#spContactEmail').value = '';
    $('#spBoothVisits').value = ''; $('#spLeadsGenerated').value = ''; $('#spSessionParticipation').value = '';
    $('#spSocialMedia').value = ''; $('#spRoi').value = ''; $('#spConversion').value = '';
    await refreshSponsorsList();
    await refreshDashboard();
  } catch (e) {
    msg.textContent = e.error || 'Could not save the sponsor — please try again.';
    msg.className = 'msg error show';
  } finally {
    btn.disabled = false; btn.innerHTML = '+ Add sponsor';
  }
}

async function recommendSponsors() {
  const out = $('#sponsorResults');
  const btn = $('#recommendSponsorBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Scoring sponsors…';
  out.innerHTML = '';

  try {
    const result = await apiPost(`/events/${CTX.activeEvent.id}/sponsors/recommend`, {
      category: $('#rqCategory').value.trim(),
      budgetNeeded: $('#rqBudgetNeeded').value,
      minTier: $('#rqMinTier').value,
    });
    renderSponsorResults(result.results);
  } catch (e) {
    out.innerHTML = `<div class="msg error show">${escapeHtml(e.error || "Couldn't generate recommendations.")}</div>`;
  } finally {
    btn.disabled = false; btn.innerHTML = 'Recommend sponsors';
  }
}

function renderSponsorResults(results) {
  const out = $('#sponsorResults');
  if (!results || results.length === 0) {
    out.innerHTML = `<div class="empty"><h3>No matching sponsors</h3><div>Try relaxing the category, budget or tier requirement — or add more sponsors.</div></div>`;
    return;
  }
  out.innerHTML = `<h3 style="font-size:14px; margin-bottom:10px;">Ranked recommendations</h3>` +
    results.map((r, i) => `
      <div class="agent-card ${i === 0 ? 'top' : ''}">
        <div class="agent-head">
          <div>
            <h4>${i === 0 ? '🏆 ' : ''}${escapeHtml(r.sponsor.name)}</h4>
            <div class="meta">${escapeHtml(r.sponsor.tier)} · ${escapeHtml(r.sponsor.category || 'uncategorized')} · ₹${r.sponsor.contribution_amount}</div>
          </div>
          <div class="score-pill">${r.score}<span>/ 100</span></div>
        </div>
        <p class="reasoning">${escapeHtml(r.reasoning)}</p>
        <div class="breakdown">
          <div class="bd"><span>Category</span><b>${r.breakdown.category}</b></div>
          <div class="bd"><span>Contribution</span><b>${r.breakdown.contribution}</b></div>
          <div class="bd"><span>Reliability</span><b>${r.breakdown.reliability}</b></div>
          <div class="bd"><span>Engagement</span><b>${r.breakdown.engagement}</b></div>
        </div>
        <div class="select-row">
          ${r.sponsor.contact_email
            ? `<button class="btn btn-amber btn-sm" data-contact-sponsor="${r.sponsor.id}">Contact Sponsor</button>`
            : `<span style="color:var(--dim); font-size:11.5px;">No contact email on file</span>`}
        </div>
      </div>
    `).join('');

  $$('button[data-contact-sponsor]', out).forEach(btn => btn.addEventListener('click', () => {
    const r = results.find(x => x.sponsor.id === btn.dataset.contactSponsor);
    contactSponsor(btn, r.sponsor);
  }));
}

const PERF_BADGE = { Excellent: 'in', Good: 'vip', 'At Risk': 'out' };

// Sends the email from checkpoint.noreply@gmail.com via the backend
// (utils/mailer.js on the server). If the server has no email
// credentials configured, falls back to opening a Gmail web-compose
// tab so the admin can still send it manually.
async function contactSponsor(btn, sponsor) {
  const original = btn.textContent;
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Sending…';

  try {
    const result = await apiPost(`/events/${CTX.activeEvent.id}/sponsors/${sponsor.id}/contact`, {});
    btn.textContent = '✓ Sent';
    btn.title = result.message;
    setTimeout(() => { btn.disabled = false; btn.textContent = original; }, 3000);
  } catch (e) {
    if (e.code === 'EMAIL_NOT_CONFIGURED') {
      window.open(gmailComposeUrl(sponsor), '_blank', 'noopener');
      btn.disabled = false; btn.textContent = original;
    } else {
      alert(e.error || 'Could not send the email — please try again.');
      btn.disabled = false; btn.textContent = original;
    }
  }
}

// Fallback only — used when the server has no email account configured
// (see contactSponsor above). Opens Gmail web-compose directly in the
// browser, no local mail client required.
function gmailComposeUrl(sponsor) {
  const to = encodeURIComponent(sponsor.contact_email);
  const subject = encodeURIComponent(`Sponsorship — ${sponsor.name}`);
  const body = encodeURIComponent(
    `Hi ${sponsor.contact_name || sponsor.name} team,\n\n` +
    `Reaching out regarding your sponsorship for our event.\n\n` +
    `— Sent via Checkpoint (checkpoint.noreply@gmail.com)`
  );
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${subject}&body=${body}`;
}

async function refreshDashboard() {
  const table = $('#sponsorDashboardTable');
  const alertsBox = $('#sponsorAlerts');
  const data = await apiGet(`/events/${CTX.activeEvent.id}/sponsors/dashboard`);

  if (data.rows.length === 0) {
    table.innerHTML = `<div class="empty">No sponsors yet.</div>`;
    alertsBox.innerHTML = '';
    return;
  }

  table.innerHTML = `<table><thead><tr><th>Sponsor</th><th>Engagement</th><th>Leads</th><th>Deliverables</th><th>Performance</th></tr></thead><tbody>
    ${data.rows.map(r => `
      <tr>
        <td><b style="color:var(--text)">${escapeHtml(r.name)}</b></td>
        <td class="mono">${r.engagementPct}%</td>
        <td class="mono">${r.leadsGenerated}</td>
        <td class="mono">${r.deliverablesFulfilledPct}%</td>
        <td><span class="badge ${PERF_BADGE[r.performance] || 'out'}">${escapeHtml(r.performance)}</span></td>
      </tr>
    `).join('')}
  </tbody></table>`;

  if (data.alerts.length === 0) {
    alertsBox.innerHTML = `<div class="empty" style="padding:16px;">No sponsors currently need attention.</div>`;
  } else {
    alertsBox.innerHTML = data.alerts.map(a => `
      <div class="scan-row dup" style="margin-bottom:8px;">
        <div class="rt" style="font-size:12.5px;">${escapeHtml(a.message)}</div>
        <span class="badge vip">attention</span>
      </div>
    `).join('');
  }
}
