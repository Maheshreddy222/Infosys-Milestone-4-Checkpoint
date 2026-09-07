// VENUES PAGE — venue CRUD + Venue Agent recommendations

let CTX = { activeEventId: null, activeEvent: null };

document.addEventListener('DOMContentLoaded', async () => {
  CTX = await initShared();
  if (!isAdmin(CTX.user)) { lockPageForAccount(CTX.user); return; }
  if (!CTX.activeEvent) {
    $('.two-col').outerHTML = `<div class="empty"><h3>No event selected</h3><div>Create or select an event first.</div></div>`;
    $$('#venuesList, #venueResults').forEach(el => el.closest('.card, div')?.remove());
    return;
  }

  wireRatingSliders();
  $('#createVenueBtn').addEventListener('click', createVenue);
  $('#recommendVenueBtn').addEventListener('click', recommendVenues);
  await refreshVenuesList();
});

function wireRatingSliders() {
  [['vSeating', 'vSeatingVal'], ['vAccessibility', 'vAccessibilityVal'], ['vCleanliness', 'vCleanlinessVal'], ['vSafety', 'vSafetyVal']]
    .forEach(([id, valId]) => {
      const input = $('#' + id);
      const val = $('#' + valId);
      input.addEventListener('input', () => { val.textContent = input.value; });
    });
}

async function refreshVenuesList() {
  const list = $('#venuesList');
  const venues = await apiGet(`/events/${CTX.activeEvent.id}/venues`);
  if (venues.length === 0) {
    list.innerHTML = `<div class="empty"><h3>No venues yet</h3><div>Add a venue above so the Venue Agent has options to recommend from.</div></div>`;
    return;
  }
  list.innerHTML = `<table><thead><tr><th>Venue</th><th>Capacity</th><th>Cost/day</th><th>Facilities</th><th>Ratings</th></tr></thead><tbody>
    ${venues.map(v => `
      <tr>
        <td><b style="color:var(--text)">${escapeHtml(v.name)}</b><div style="color:var(--dim); font-size:12px;">${escapeHtml(v.location || '—')}</div></td>
        <td>${v.capacity}</td>
        <td>₹${v.cost_per_day}</td>
        <td>
          <div class="pill-list">
            <span class="pill ${v.wifi ? 'on' : ''}">Wi-Fi</span>
            <span class="pill ${v.projector ? 'on' : ''}">Projector</span>
            <span class="pill ${v.air_conditioning ? 'on' : ''}">A/C</span>
            <span class="pill ${v.stage ? 'on' : ''}">Stage</span>
            <span class="pill ${v.power_outlets ? 'on' : ''}">Power</span>
          </div>
        </td>
        <td class="mono" style="font-size:11.5px;">A11y ${v.accessibility}/5 · Clean ${v.cleanliness}/5 · Safety ${v.safety_security}/5</td>
      </tr>
    `).join('')}
  </tbody></table>`;
}

async function createVenue() {
  const msg = $('#venueMsg');
  msg.classList.remove('show');
  const name = $('#vName').value.trim();
  const capacity = $('#vCapacity').value;
  const contactNumber = $('#vContactNumber').value.trim();
  if (!name || !capacity) {
    msg.textContent = 'Venue name and capacity are required.';
    msg.className = 'msg error show';
    return;
  }
  if (!contactNumber) {
    msg.textContent = 'Contact number is required.';
    msg.className = 'msg error show';
    return;
  }

  const btn = $('#createVenueBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Adding…';

  try {
    await apiPost(`/events/${CTX.activeEvent.id}/venues`, {
      name, capacity, contactNumber, location: $('#vLocation').value.trim(),
      costPerDay: $('#vCost').value, eventTypes: $('#vEventTypes').value.trim(),
      wifi: $('#vWifi').checked, projector: $('#vProjector').checked, airConditioning: $('#vAc').checked,
      stage: $('#vStage').checked, powerOutlets: $('#vPower').checked,
      seatingComfort: $('#vSeating').value, accessibility: $('#vAccessibility').value,
      cleanliness: $('#vCleanliness').value, safetySecurity: $('#vSafety').value,
    });
    $('#vName').value = ''; $('#vLocation').value = ''; $('#vCapacity').value = ''; $('#vContactNumber').value = '';
    $('#vCost').value = ''; $('#vEventTypes').value = '';
    await refreshVenuesList();
  } catch (e) {
    msg.textContent = e.error || 'Could not save the venue — please try again.';
    msg.className = 'msg error show';
  } finally {
    btn.disabled = false; btn.innerHTML = '+ Add venue';
  }
}

async function recommendVenues() {
  const out = $('#venueResults');
  const btn = $('#recommendVenueBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Scoring venues…';
  out.innerHTML = '';

  const reqCtx = {
    topic: $('#rqTopic').value.trim(),
    date: $('#rqDate').value,
    startTime: $('#rqStart').value,
    endTime: $('#rqEnd').value,
    expectedAttendees: $('#rqAttendees').value,
  };

  try {
    const result = await apiPost(`/events/${CTX.activeEvent.id}/venues/recommend`, {
      eventType: $('#rqEventType').value.trim(),
      expectedAttendees: $('#rqAttendees').value,
      budget: $('#rqBudget').value,
      date: $('#rqDate').value,
      startTime: $('#rqStart').value,
      endTime: $('#rqEnd').value,
      locationPreference: $('#rqLocation').value.trim(),
      accessibilityNeeded: $('#rqAccessible').checked,
      requiredFacilities: {
        wifi: $('#rqWifi').checked, projector: $('#rqProjector').checked, air_conditioning: $('#rqAc').checked,
        stage: $('#rqStage').checked, power_outlets: $('#rqPower').checked, seating_comfort: $('#rqSeating').checked,
      },
    });
    renderVenueResults(result.results, reqCtx);
  } catch (e) {
    out.innerHTML = `<div class="msg error show">${escapeHtml(e.error || "Couldn't generate recommendations.")}</div>`;
  } finally {
    btn.disabled = false; btn.innerHTML = 'Recommend venues';
  }
}

function renderVenueResults(results, reqCtx) {
  const out = $('#venueResults');
  if (!results || results.length === 0) {
    out.innerHTML = `<div class="empty"><h3>No matching venues</h3><div>Try relaxing capacity, budget or facility requirements — or add more venues.</div></div>`;
    return;
  }
  out.innerHTML = `<h3 style="font-size:14px; margin-bottom:10px;">Ranked recommendations</h3>` +
    results.map((r, i) => `
      <div class="agent-card ${i === 0 ? 'top' : ''}" data-venue-card="${r.venue.id}">
        <div class="agent-head">
          <div>
            <h4>${i === 0 ? '🏆 ' : ''}${escapeHtml(r.venue.name)}</h4>
            <div class="meta">${escapeHtml(r.venue.location || 'Location not set')} · Capacity ${r.venue.capacity} · ₹${r.venue.cost_per_day}/day${r.eventTypeMatch ? ' · event type match' : ''}</div>
            <div class="meta">📞 ${escapeHtml(r.venue.contact_number || 'no contact on file')}</div>
          </div>
          <div class="score-pill">${r.score}<span>/ 100</span></div>
        </div>
        <p class="reasoning">${escapeHtml(r.reasoning)}</p>
        <div class="breakdown">
          <div class="bd"><span>Capacity</span><b>${r.breakdown.capacity}</b></div>
          <div class="bd"><span>Budget</span><b>${r.breakdown.budget}</b></div>
          <div class="bd"><span>Facilities</span><b>${r.breakdown.facilities}</b></div>
          <div class="bd"><span>Accessibility</span><b>${r.breakdown.accessibility}</b></div>
          <div class="bd"><span>Cleanliness</span><b>${r.breakdown.cleanliness}</b></div>
          <div class="bd"><span>Safety</span><b>${r.breakdown.safety}</b></div>
          <div class="bd"><span>Location</span><b>${r.breakdown.location}</b></div>
        </div>
        <div class="select-row">
          <button class="btn btn-amber btn-sm" data-schedule-venue="${r.venue.id}">Schedule</button>
        </div>
      </div>
    `).join('');

  $$('button[data-schedule-venue]', out).forEach(btn => btn.addEventListener('click', () => {
    const r = results.find(x => x.venue.id === btn.dataset.scheduleVenue);
    scheduleVenueDirect(btn, reqCtx, r.venue);
  }));
}

function scheduleVenueDirect(btn, reqCtx, venue) {
  if (!reqCtx.topic) {
    alert('Add a session topic in the form above before scheduling.');
    return;
  }
  if (!reqCtx.date || !reqCtx.startTime || !reqCtx.endTime) {
    alert('Add a date, start time and end time in the form above before scheduling.');
    return;
  }
  // Hand off to the Scheduling page — it also prompts for a speaker (or
  // lets the admin confirm with just this venue).
  localStorage.setItem('checkpoint_schedule_prefill', JSON.stringify({
    topic: reqCtx.topic, date: reqCtx.date, startTime: reqCtx.startTime, endTime: reqCtx.endTime,
    expectedAttendees: reqCtx.expectedAttendees,
    venue: { id: venue.id, name: venue.name },
  }));
  location.href = 'scheduling.html';
}
