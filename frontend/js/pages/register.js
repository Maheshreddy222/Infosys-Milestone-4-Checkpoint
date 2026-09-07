// REGISTER PAGE

let CTX = { activeEventId: null, activeEvent: null };

document.addEventListener('DOMContentLoaded', async () => {
  CTX = await initShared();
  if (!CTX.user) return; // already redirected to login by initShared
  if (!CTX.activeEvent) {
    $('#registerBody').innerHTML = `<div class="empty"><h3>No event selected</h3><div>Create or select an event first.</div></div>`;
    return;
  }
  const eventDatePassed = CTX.activeEvent.date < new Date().toISOString().slice(0, 10);
  if (CTX.activeEvent.registration_open === 0 || eventDatePassed) {
    $('#registerBody').innerHTML = `<div class="empty"><h3>Registrations are closed</h3><div>${eventDatePassed ? 'This event date has passed, so new registrations are no longer accepted.' : 'The administrator has stopped new registrations for this event.'}</div><div style="margin-top:16px;"><a class="btn btn-ghost" href="events.html">Back to Events</a></div></div>`;
    return;
  }
  $('#registerBtn').addEventListener('click', registerAttendee);
});

async function registerAttendee() {
  const ev = CTX.activeEvent;
  const msg = $('#regMsg');
  msg.classList.remove('show');

  const name = $('#regName').value.trim();
  const email = $('#regEmail').value.trim();
  const phone = $('#regPhone').value.trim();
  const company = $('#regCo').value.trim();
  const ticketType = $('#regTicket').value;

  if (!name || !email || !phone) {
    msg.textContent = 'Name, email and phone number are required.';
    msg.className = 'msg error show';
    return;
  }

  const btn = $('#registerBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Registering…';

  try {
    const result = await apiPost(`/events/${ev.id}/attendees`, { name, email, phone, company, ticketType });
    msg.textContent = result.message;
    msg.className = 'msg success show';
    renderTicket(ev, result.attendee, result.qrDataUrl);
    $('#regName').value = ''; $('#regEmail').value = ''; $('#regPhone').value = ''; $('#regCo').value = '';
  } catch (e) {
    msg.textContent = e.error || 'Something went wrong saving this registration — please try again.';
    msg.className = 'msg error show';
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Complete registration';
  }
}

// Only the QR and the registered attendee's details should appear — this
// markup is also what @media print isolates (see css/style.css).
function renderTicket(ev, attendee, qrDataUrl) {
  const panel = $('#ticketPanel');
  panel.innerHTML = `
    <h3>Ticket generated</h3>
    <div class="ticket">
      <div class="tt">${escapeHtml(ev.name)}</div>
      <div class="name">${escapeHtml(attendee.name)}</div>
      <div class="co">${escapeHtml(attendee.company || attendee.ticket_type)} · ${escapeHtml(attendee.ticket_type)}</div>
      <div class="qrbox"><img src="${qrDataUrl}" alt="Ticket QR code"></div>
      <div class="tid">ID · ${attendee.id}</div>
    </div>
    <div style="text-align:center; margin-top:16px;">
      <button class="btn btn-ghost btn-sm" onclick="window.print()">Print ticket</button>
    </div>
  `;
}
