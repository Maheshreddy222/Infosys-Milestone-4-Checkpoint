// MY SCHEDULE PAGE — for a User account, this shows every attendee THEY
// registered (registered_by = this account) for any FUTURE event —
// not scoped to whichever event happens to be selected in the topbar.
// "View registration" shows the ticket (QR + registrant details) with
// a print option. Deliberately minimal — no admin tools here.

document.addEventListener('DOMContentLoaded', async () => {
  const { user } = await initShared();
  if (!user) return; // already redirected to login by initShared

  const el = $('#scheduleBody');
  let mine;
  try {
    mine = await apiGet('/my-registrations');
  } catch (e) {
    el.innerHTML = `<div class="empty"><h3>Could not load your registrations</h3></div>`;
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = mine.filter(a => a.event_date >= today);

  if (upcoming.length === 0) {
    el.innerHTML = `<div class="empty"><h3>No upcoming registrations</h3><div>Attendees you register for future events will appear here.</div></div>`;
    return;
  }

  el.innerHTML = `<div class="card"><table><thead><tr><th>Event</th><th>Attendee</th><th>Ticket</th><th>Status</th><th></th></tr></thead><tbody>
    ${upcoming.map(a => `
      <tr>
        <td><b style="color:var(--text)">${escapeHtml(a.event_name)}</b><div style="color:var(--dim); font-size:12px;">${fmtDate(a.event_date)}</div></td>
        <td><b style="color:var(--text)">${escapeHtml(a.name)}</b><div style="color:var(--dim); font-size:12px;">${escapeHtml(a.email)}</div></td>
        <td><span class="badge ${a.ticket_type === 'VIP' ? 'vip' : 'out'}">${escapeHtml(a.ticket_type)}</span></td>
        <td><span class="badge ${a.checked_in ? 'in' : 'out'}">${a.checked_in ? 'checked in' : 'not arrived'}</span></td>
        <td><button class="btn btn-ghost btn-sm" data-view="${a.id}" data-event="${a.event_id}" data-eventname="${escapeHtml(a.event_name)}">View registration</button></td>
      </tr>
    `).join('')}
  </tbody></table></div>`;

  $$('button[data-view]', el).forEach(btn => btn.addEventListener('click', () =>
    showTicket(btn.dataset.event, btn.dataset.view, btn.dataset.eventname)
  ));
});

async function showTicket(eventId, attendeeId, eventName) {
  const out = $('#ticketViewBody');
  out.innerHTML = `<div class="empty">Loading ticket…</div>`;
  try {
    const { attendee, qrDataUrl } = await apiGet(`/events/${eventId}/attendees/${attendeeId}/ticket`);
    out.innerHTML = `
      <div class="card">
        <h3>Registration</h3>
        <div class="ticket">
          <div class="tt">${escapeHtml(eventName)}</div>
          <div class="name">${escapeHtml(attendee.name)}</div>
          <div class="co">${escapeHtml(attendee.company || attendee.ticket_type)} · ${escapeHtml(attendee.ticket_type)}</div>
          <div class="qrbox"><img src="${qrDataUrl}" alt="Ticket QR code"></div>
          <div class="tid">ID · ${attendee.id}</div>
        </div>
        <div style="text-align:center; margin-top:16px;">
          <button class="btn btn-ghost btn-sm" onclick="window.print()">Print</button>
        </div>
      </div>
    `;
  } catch (e) {
    out.innerHTML = `<div class="msg error show">Could not load this registration.</div>`;
  }
}
