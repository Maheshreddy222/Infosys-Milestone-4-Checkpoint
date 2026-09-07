// SCHEDULING PAGE — venue optimization + speaker scheduling combined into
// one workflow: describe the session, get ranked venues & speakers side by
// side, pick one of each, confirm to create the session (server re-checks
// conflicts before committing).

let CTX = { activeEventId: null, activeEvent: null };
let selectedVenue = null;
let selectedSpeaker = null;

document.addEventListener('DOMContentLoaded', async () => {
  CTX = await initShared();
  if (!isAdmin(CTX.user)) { lockPageForAccount(CTX.user); return; }
  if (!CTX.activeEvent) {
    $('main').querySelectorAll('.card, .two-col').forEach(el => el.remove());
    $('main').insertAdjacentHTML('beforeend', `<div class="empty"><h3>No event selected</h3><div>Create or select an event first.</div></div>`);
    return;
  }

  $('#findMatchesBtn').addEventListener('click', findMatches);
  $('#confirmSessionBtn').addEventListener('click', confirmSession);
  await refreshSessionsList();
  await applyPrefill();
});

// Picks up a venue or speaker chosen on the Venues/Speakers recommendation
// pages (via "Schedule" there) and pre-fills the form + selection, then
// prompts for the OTHER resource so both can be confirmed together.
async function applyPrefill() {
  const raw = localStorage.getItem('checkpoint_schedule_prefill');
  if (!raw) return;
  localStorage.removeItem('checkpoint_schedule_prefill');

  let data;
  try { data = JSON.parse(raw); } catch (e) { return; }

  if (data.topic) $('#scTopic').value = data.topic;
  if (data.date) $('#scDate').value = data.date;
  if (data.startTime) $('#scStart').value = data.startTime;
  if (data.endTime) $('#scEnd').value = data.endTime;
  if (data.expectedAttendees) $('#scAttendees').value = data.expectedAttendees;

  selectedVenue = data.venue || null;
  selectedSpeaker = data.speaker || null;
  updateSelectionSummary();

  if (data.venue) {
    $('#scVenueResults').innerHTML = `<div class="agent-card top"><div class="agent-head"><div><h4>✓ ${escapeHtml(data.venue.name)}</h4><div class="meta">Carried over from the Venues page</div></div></div></div>`;
  }
  if (data.speaker) {
    $('#scSpeakerResults').innerHTML = `<div class="agent-card top"><div class="agent-head"><div><h4>✓ ${escapeHtml(data.speaker.name)}</h4><div class="meta">Carried over from the Speakers page</div></div></div></div>`;
  }

  const missing = data.venue ? 'speaker' : 'venue';
  const msg = $('#schedMsg');
  msg.textContent = `${(data.venue || data.speaker).name} carried over — now pick a ${missing} below, or confirm with just this one.`;
  msg.className = 'msg info show';

  if (data.topic && data.date && data.startTime && data.endTime) {
    await searchMissingSide(data);
  }
}

// Fetches recommendations only for whichever side (venue/speaker) wasn't
// already chosen, without touching the selection already carried over.
async function searchMissingSide(data) {
  const date = $('#scDate').value, startTime = $('#scStart').value, endTime = $('#scEnd').value;
  const attendees = $('#scAttendees').value, budget = $('#scBudget').value, topic = $('#scTopic').value.trim();
  try {
    if (!data.venue) {
      const venueResult = await apiPost(`/events/${CTX.activeEvent.id}/venues/recommend`, { expectedAttendees: attendees, budget, date, startTime, endTime });
      renderVenueChoices(venueResult.results);
    }
    if (!data.speaker) {
      const speakerResult = await apiPost(`/events/${CTX.activeEvent.id}/speakers/recommend`, { topic, date, startTime, endTime, budget });
      renderSpeakerChoices(speakerResult.results);
    }
  } catch (e) { /* admin can still use "Find matching venues & speakers" manually */ }
}

async function findMatches() {
  const msg = $('#schedMsg');
  msg.classList.remove('show');
  selectedVenue = null;
  selectedSpeaker = null;
  updateSelectionSummary();

  const topic = $('#scTopic').value.trim();
  const date = $('#scDate').value;
  const startTime = $('#scStart').value;
  const endTime = $('#scEnd').value;

  if (!topic || !date || !startTime || !endTime) {
    msg.textContent = 'Topic, date, start time and end time are required.';
    msg.className = 'msg error show';
    return;
  }

  const attendees = $('#scAttendees').value;
  const budget = $('#scBudget').value;

  const btn = $('#findMatchesBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Searching…';
  $('#scVenueResults').innerHTML = `<div class="empty">Scoring venues…</div>`;
  $('#scSpeakerResults').innerHTML = `<div class="empty">Ranking speakers…</div>`;

  try {
    const [venueResult, speakerResult] = await Promise.all([
      apiPost(`/events/${CTX.activeEvent.id}/venues/recommend`, {
        expectedAttendees: attendees, budget, date, startTime, endTime,
      }),
      apiPost(`/events/${CTX.activeEvent.id}/speakers/recommend`, {
        topic, date, startTime, endTime, budget,
      }),
    ]);
    renderVenueChoices(venueResult.results);
    renderSpeakerChoices(speakerResult.results);
  } catch (e) {
    msg.textContent = e.error || 'Could not fetch recommendations.';
    msg.className = 'msg error show';
  } finally {
    btn.disabled = false; btn.innerHTML = 'Find matching venues & speakers';
  }
}

function renderVenueChoices(results) {
  const out = $('#scVenueResults');
  if (!results || results.length === 0) {
    out.innerHTML = `<div class="empty">No available venues for this slot.</div>`;
    return;
  }
  out.innerHTML = results.slice(0, 5).map((r, i) => `
    <div class="agent-card ${i === 0 ? 'top' : ''}">
      <div class="agent-head">
        <div><h4>${escapeHtml(r.venue.name)}</h4><div class="meta">Capacity ${r.venue.capacity} · ₹${r.venue.cost_per_day}/day</div></div>
        <div class="score-pill">${r.score}<span>/ 100</span></div>
      </div>
      <div class="select-row"><button class="btn btn-ghost btn-sm" data-venue="${r.venue.id}">Select this venue</button></div>
    </div>
  `).join('');
  $$('button[data-venue]', out).forEach(btn => btn.addEventListener('click', () => {
    const r = results.find(x => x.venue.id === btn.dataset.venue);
    selectedVenue = r.venue;
    $$('.agent-card', out).forEach(c => c.classList.remove('top'));
    btn.closest('.agent-card').classList.add('top');
    updateSelectionSummary();
  }));
}

function renderSpeakerChoices(results) {
  const out = $('#scSpeakerResults');
  if (!results || results.length === 0) {
    out.innerHTML = `<div class="empty">No available speakers for this topic/slot.</div>`;
    return;
  }
  out.innerHTML = results.slice(0, 5).map((r, i) => `
    <div class="agent-card ${i === 0 ? 'top' : ''}">
      <div class="agent-head">
        <div><h4>${escapeHtml(r.speaker.name)}</h4><div class="meta">${escapeHtml(r.speaker.expertise)} · ₹${r.speaker.fee}</div></div>
        <div class="score-pill">${r.score}<span>/ 100</span></div>
      </div>
      <div class="select-row"><button class="btn btn-ghost btn-sm" data-speaker="${r.speaker.id}">Select this speaker</button></div>
    </div>
  `).join('');
  $$('button[data-speaker]', out).forEach(btn => btn.addEventListener('click', () => {
    const r = results.find(x => x.speaker.id === btn.dataset.speaker);
    selectedSpeaker = r.speaker;
    $$('.agent-card', out).forEach(c => c.classList.remove('top'));
    btn.closest('.agent-card').classList.add('top');
    updateSelectionSummary();
  }));
}

function updateSelectionSummary() {
  const el = $('#scSelectionSummary');
  const btn = $('#confirmSessionBtn');
  if (selectedVenue || selectedSpeaker) {
    el.textContent = `Venue: ${selectedVenue ? selectedVenue.name : 'none selected'} · Speaker: ${selectedSpeaker ? selectedSpeaker.name : 'none selected'}`;
    btn.disabled = false;
  } else {
    el.textContent = 'Select a venue and/or a speaker above to enable scheduling.';
    btn.disabled = true;
  }
}

async function confirmSession() {
  const msg = $('#schedMsg');
  msg.classList.remove('show');
  const btn = $('#confirmSessionBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Scheduling…';

  try {
    const result = await apiPost(`/events/${CTX.activeEvent.id}/sessions`, {
      topic: $('#scTopic').value.trim(),
      date: $('#scDate').value,
      startTime: $('#scStart').value,
      endTime: $('#scEnd').value,
      expectedAttendees: $('#scAttendees').value,
      venueId: selectedVenue ? selectedVenue.id : null,
      speakerId: selectedSpeaker ? selectedSpeaker.id : null,
    });
    const sessionId = result.session.id;
    const venueName = selectedVenue ? selectedVenue.name : null;
    const speakerName = selectedSpeaker ? selectedSpeaker.name : null;
    selectedVenue = null; selectedSpeaker = null;
    $('#scTopic').value = ''; $('#scAttendees').value = ''; $('#scBudget').value = '';
    $('#scVenueResults').innerHTML = `<div class="empty">Fill in the form above and search.</div>`;
    $('#scSpeakerResults').innerHTML = `<div class="empty">Fill in the form above and search.</div>`;
    updateSelectionSummary();
    await refreshSessionsList();

    // Simulated acceptance popups — one per assigned resource.
    if (venueName) await showAcceptancePopup({ sessionId, eventId: CTX.activeEvent.id, resourceType: 'venue', resourceName: venueName });
    if (speakerName) await showAcceptancePopup({ sessionId, eventId: CTX.activeEvent.id, resourceType: 'speaker', resourceName: speakerName });
    await refreshSessionsList();
  } catch (e) {
    msg.textContent = e.error || 'Could not schedule this session — please try again.';
    msg.className = 'msg error show';
  } finally {
    btn.disabled = false; btn.innerHTML = 'Schedule session';
  }
}

async function refreshSessionsList() {
  const list = $('#sessionsList');
  const sessions = await apiGet(`/events/${CTX.activeEvent.id}/sessions`);
  if (sessions.length === 0) {
    list.innerHTML = `<div class="empty"><h3>No sessions scheduled yet</h3></div>`;
    return;
  }
  list.innerHTML = `<table><thead><tr><th>Topic</th><th>When</th><th>Venue</th><th>Speaker</th><th>Status</th><th></th></tr></thead><tbody>
    ${sessions.map(s => `
      <tr>
        <td><b style="color:var(--text)">${escapeHtml(s.topic)}</b></td>
        <td>${fmtDate(s.date)}<br><span class="mono" style="font-size:11px;">${s.start_time}–${s.end_time}</span></td>
        <td>${s.venue_name ? `${escapeHtml(s.venue_name)}${s.venue_status ? ` <span class="status-pill ${s.venue_status}">${escapeHtml(s.venue_status)}</span>` : ''}` : '<span style="color:var(--dim)">unassigned</span>'}</td>
        <td>${s.speaker_name ? `${escapeHtml(s.speaker_name)}${s.speaker_status ? ` <span class="status-pill ${s.speaker_status}">${escapeHtml(s.speaker_status)}</span>` : ''}` : '<span style="color:var(--dim)">unassigned</span>'}</td>
        <td><span class="badge ${s.status === 'cancelled' ? 'out' : 'in'}">${escapeHtml(s.status)}</span></td>
        <td>${s.status !== 'cancelled' ? `<button class="btn btn-ghost btn-sm" data-cancel="${s.id}">Cancel</button>` : ''}</td>
      </tr>
    `).join('')}
  </tbody></table>`;

  $$('button[data-cancel]', list).forEach(btn => btn.addEventListener('click', async () => {
    try {
      await apiPatch(`/events/${CTX.activeEvent.id}/sessions/${btn.dataset.cancel}/cancel`, {});
      refreshSessionsList();
    } catch (e) {
      alert(e.error || 'Could not cancel this session.');
    }
  }));
}
