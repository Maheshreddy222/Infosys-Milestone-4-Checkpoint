// CHECK-IN PAGE

let CTX = { activeEventId: null, activeEvent: null };
let scanLog = [];

document.addEventListener('DOMContentLoaded', async () => {
  CTX = await initShared();
  if (!isAdmin(CTX.user)) { lockPageForAccount(CTX.user); return; }
  const card = $('.card');
  if (!CTX.activeEvent) {
    card.outerHTML = `<div class="empty"><h3>No event selected</h3><div>Create or select an event first.</div></div>`;
    return;
  }
  $('#scanInput').placeholder = `e.g. ${CTX.activeEvent.code}-00001, or email / phone`;
  const input = $('#scanInput');
  const go = () => doCheckin(input.value.trim());
  $('#scanBtn').addEventListener('click', go);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  $('#scanLog').addEventListener('click', (e) => {
    const button = e.target.closest('[data-checkout-code]');
    if (button) doCheckout(button.dataset.checkoutCode, button);
  });
  renderScanLog();
});

function renderScanLog() {
  const box = $('#scanLog');
  if (scanLog.length === 0) {
    box.innerHTML = `<div class="empty" style="padding:26px;">No scans yet this session.</div>`;
    return;
  }
  box.innerHTML = scanLog.map(row => `
    <div class="scan-row ${row.status}">
      <div>
        <div class="rn">${escapeHtml(row.name)}</div>
        <div class="rt">${escapeHtml(row.detail)}</div>
      </div>
      <div>
        <div class="badge ${row.status === 'ok' ? 'in' : row.status === 'dup' ? 'vip' : 'out'}">${escapeHtml(row.label)}</div>
        ${row.checkoutCode ? `<button class="btn btn-sm" style="margin-top:6px;" data-checkout-code="${escapeHtml(row.checkoutCode)}">Checkout</button>` : ''}
      </div>
    </div>
  `).join('');
}

async function doCheckin(raw) {
  const ev = CTX.activeEvent;
  const input = $('#scanInput');
  if (!raw) return;
  input.value = '';

  try {
    const result = await apiPost(`/events/${ev.id}/checkin`, { code: raw });
    if (result.status === 'checked_in') {
      showToast(`${result.attendee.name} checked in successfully.`, 'success');
      scanLog.unshift({
        status: 'ok', name: result.attendee.name,
        detail: `${result.attendee.ticket_type} · ${result.attendee.id} · checked in ${fmtTime(result.attendee.checked_in_at)}`,
        label: 'checked in',
        checkoutCode: result.attendee.id,
      });
    } else if (result.status === 'already_checked_in') {
      showToast(`${result.attendee.name} is already checked in.`, 'info');
      scanLog.unshift({
        status: 'dup', name: result.attendee.name,
        detail: `Already checked in at ${fmtTime(result.attendee.checked_in_at)} · ${result.attendee.id}`,
        label: 'already in',
        checkoutCode: result.attendee.id,
      });
    }
  } catch (e) {
    showToast(e.error || e.message || 'Ticket could not be checked in.', 'error');
    scanLog.unshift({ status: 'fail', name: 'Not found', detail: e.message || `"${raw}" doesn't match any registered attendee`, label: 'no match' });
  }
  renderScanLog();
}

async function doCheckout(code, button) {
  const ev = CTX.activeEvent;
  if (button) button.disabled = true;
  try {
    const result = await apiPost(`/events/${ev.id}/checkin/checkout`, { code });
    scanLog.unshift({
      status: 'ok', name: result.attendee.name,
      detail: `${result.attendee.ticket_type} · ${result.attendee.id} · checked out ${fmtTime(result.attendee.last_checked_out_at)}`,
      label: 'checked out',
    });
    showToast(`${result.attendee.name} checked out successfully.`, 'success');
  } catch (e) {
    showToast(e.error || e.message || 'Unable to check out attendee.', 'error');
    scanLog.unshift({ status: 'fail', name: 'Checkout failed', detail: e.message || 'Unable to check out attendee', label: 'error' });
  }
  renderScanLog();
}
