// EVENTS PAGE
let myRegisteredEventIds = new Set();

document.addEventListener('DOMContentLoaded', async () => {
  const { user } = await initShared();
  if (!user) return;
  wireCreateEventCard(user);

  if (!isAdmin(user)) {
    try {
      const mine = await apiGet('/my-registrations');
      myRegisteredEventIds = new Set(mine.map(a => a.event_id));
    } catch (e) {}
  }
  await refreshEventsList(user);
});

function wireCreateEventCard(user) {
  const card = $('#createEventCard');
  if (isAdmin(user)) {
    $('#createEventBtn').addEventListener('click', createEvent);
    return;
  }
  card.innerHTML = `
    <h3>Create a new event</h3>
    <p style="color:var(--muted);font-size:13.5px;margin:6px 0 16px;line-height:1.6;">
      Only admin accounts can create and manage events. You're signed in as a user.
    </p>`;
}

async function refreshEventsList(user) {
  const list = $('#eventsList');
  let events;
  try { events = await apiGet('/events'); }
  catch (e) { list.innerHTML = `<div class="empty"><h3>Could not load events</h3><div>Is the backend running?</div></div>`; return; }

  if (!events.length) {
    list.innerHTML = `<div class="empty"><h3>No events yet</h3><div>Sign in as an administrator and create the first event.</div></div>`;
    return;
  }

  const activeEventId = getActiveEventId();
  const userMode = !isAdmin(user);
  list.innerHTML = `<table><thead><tr><th>Event</th><th>Date</th><th>Venue</th><th>Code / ID</th><th>Status</th><th>Actions</th></tr></thead><tbody>
    ${events.map(e => {
       const eventPassed = e.date < new Date().toISOString().slice(0, 10);
       const closed = e.registration_open === 0 || eventPassed;
      if (!userMode) return `
        <tr>
          <td><b style="color:var(--text)">${escapeHtml(e.name)}</b>${e.description ? `<div style="color:var(--dim);font-size:12px;margin-top:2px;">${escapeHtml(e.description)}</div>` : ''}</td>
          <td>${fmtDate(e.date)}</td>
          <td>${escapeHtml(e.venue || '—')}</td>
          <td><div class="mono">${escapeHtml(e.code)}</div><div style="color:var(--dim);font:10px var(--mono);margin-top:3px;">${escapeHtml(e.id)}</div></td>
           <td><span class="badge ${closed ? 'out' : 'in'}">${eventPassed ? 'Completed' : closed ? 'Registrations stopped' : 'Open'}</span></td>
          <td><div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
            <button class="btn btn-ghost btn-sm" data-select="${e.id}">${e.id === activeEventId ? 'Selected' : 'Select'}</button>
             ${closed && !eventPassed
              ? `<button class="btn btn-ghost btn-sm" data-reopen="${e.id}">Reopen</button>`
               : eventPassed
                 ? `<span class="event-action-note">Completed</span>`
                 : `<button class="btn btn-ghost btn-sm" data-stop="${e.id}">Stop registrations</button>`}
            <button class="btn btn-sm" style="border:1px solid rgba(242,102,75,.45);color:#f2664b;background:transparent;" data-delete="${e.id}" data-name="${escapeHtml(e.name)}">Delete event</button>
          </div></td>
        </tr>`;

      const already = myRegisteredEventIds.has(e.id);
      return `
        <tr>
          <td><b style="color:var(--text)">${escapeHtml(e.name)}</b>${e.description ? `<div style="color:var(--dim);font-size:12px;margin-top:2px;">${escapeHtml(e.description)}</div>` : ''}</td>
          <td>${fmtDate(e.date)}</td><td>${escapeHtml(e.venue || '—')}</td>
          <td><div class="mono">${escapeHtml(e.code)}</div><div style="color:var(--dim);font:10px var(--mono);margin-top:3px;">${escapeHtml(e.id)}</div></td>
           <td><span class="badge ${closed ? 'out' : 'in'}">${eventPassed ? 'Completed' : closed ? 'Closed' : 'Open'}</span></td>
           <td>${closed ? `<span style="color:var(--dim);font-size:12px;">${eventPassed ? 'Event completed' : 'Registration unavailable'}</span>` : already
            ? `<button class="btn btn-ghost btn-sm" data-already="${e.id}">Registered</button>`
            : `<button class="btn btn-amber btn-sm" data-register="${e.id}">Register</button>`}</td>
        </tr>`;
    }).join('')}
  </tbody></table>`;

  $$('button[data-select]', list).forEach(btn => btn.addEventListener('click', () => { setActiveEventId(btn.dataset.select); location.reload(); }));
  $$('button[data-register]', list).forEach(btn => btn.addEventListener('click', () => { setActiveEventId(btn.dataset.register); location.href = 'register.html'; }));
  $$('button[data-already]', list).forEach(btn => btn.addEventListener('click', () => showToast('You have already registered for this event.', 'info')));
  $$('button[data-stop]', list).forEach(btn => btn.addEventListener('click', () => stopRegistrations(btn.dataset.stop)));
  $$('button[data-reopen]', list).forEach(btn => btn.addEventListener('click', () => reopenRegistrations(btn.dataset.reopen)));
  $$('button[data-delete]', list).forEach(btn => btn.addEventListener('click', () => deleteEvent(btn.dataset.delete, btn.dataset.name)));
}

async function stopRegistrations(eventId) {
  if (!confirm('Stop registrations for this event? Existing registrations will remain, but no new registrations will be allowed.')) return;
  try { await apiPatch(`/events/${eventId}/stop-registrations`, {}); await refreshEventsList(await getCurrentUser()); }
  catch (e) { showToast(e.error || 'Could not stop registrations.', 'error'); }
}

async function reopenRegistrations(eventId) {
  if (!confirm('Reopen registrations for this event?')) return;
  try { await apiPatch(`/events/${eventId}/reopen-registrations`, {}); await refreshEventsList(await getCurrentUser()); }
  catch (e) { showToast(e.error || 'Could not reopen registrations.', 'error'); }
}

async function deleteEvent(eventId, name) {
  if (!confirm(`Delete "${name}" permanently? This removes the event and its registrations, sessions, incidents, feedback and complaints. This cannot be undone.`)) return;
  try {
    await apiDelete(`/events/${eventId}`);
    if (getActiveEventId() === eventId) setActiveEventId(null);
    showToast('Event deleted successfully.', 'success');
    const user = await getCurrentUser();
    if (user) await refreshEventsList(user);
  } catch (e) { showToast(e.error || 'Could not delete event.', 'error'); }
}

async function createEvent() {
  const name = $('#evName').value.trim(), date = $('#evDate').value;
  const venue = $('#evVenue').value.trim(), description = $('#evDesc').value.trim();
  const msg = $('#eventMsg'); msg.classList.remove('show');
  if (!name || !date) { msg.textContent='Event name and date are required.'; msg.className='msg error show'; return; }
  const btn=$('#createEventBtn'); btn.disabled=true; btn.innerHTML='<span class="spinner"></span> Creating…';
  try {
    const event=await apiPost('/events',{name,date,venue,description});
    setActiveEventId(event.id); $('#evName').value='';$('#evDate').value='';$('#evVenue').value='';$('#evDesc').value=''; location.reload();
  } catch(e) { msg.textContent=e.error||'Could not save the event — please try again.'; msg.className='msg error show'; showToast(e.error || 'Could not save the event.', 'error'); }
  finally { btn.disabled=false; btn.innerHTML='+ Create event'; }
}
