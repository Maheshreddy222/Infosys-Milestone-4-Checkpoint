// COMPLAINT PAGE — any signed-in account can file; admins see everyone's,
// a regular user sees only their own (scoped server-side).

let CTX = { activeEventId: null, activeEvent: null };

document.addEventListener('DOMContentLoaded', async () => {
  CTX = await initShared();
  if (!CTX.user) return; // already redirected to login by initShared
  if (!CTX.activeEvent) {
    $('.grid2').outerHTML = `<div class="empty"><h3>No event selected</h3><div>Create or select an event first.</div></div>`;
    return;
  }

  $('#submitComplaintBtn').addEventListener('click', submitComplaint);
  $('#complaintListTitle').textContent = isAdmin(CTX.user) ? 'All complaints' : 'Your complaints';

  await refreshComplaintList();
});

async function submitComplaint() {
  const msg = $('#complaintMsg');
  msg.classList.remove('show');
  const subject = $('#cpSubject').value.trim();
  if (!subject) {
    msg.textContent = 'A subject is required.';
    msg.className = 'msg error show';
    return;
  }

  const btn = $('#submitComplaintBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Submitting…';

  try {
    await apiPost(`/events/${CTX.activeEvent.id}/complaints`, {
      subject, description: $('#cpDescription').value.trim(),
    });
    $('#cpSubject').value = ''; $('#cpDescription').value = '';
    await refreshComplaintList();
  } catch (e) {
    msg.textContent = e.error || 'Could not submit the complaint — please try again.';
    msg.className = 'msg error show';
  } finally {
    btn.disabled = false; btn.innerHTML = 'Submit complaint';
  }
}

async function refreshComplaintList() {
  const list = $('#complaintList');
  const rows = await apiGet(`/events/${CTX.activeEvent.id}/complaints`);
  if (rows.length === 0) {
    list.innerHTML = `<div class="empty">No complaints filed yet.</div>`;
    return;
  }
  list.innerHTML = rows.map(r => `
    <div class="scan-row" style="align-items:flex-start; margin-bottom:8px;">
      <div>
        <div class="rn" style="font-size:12.5px;">${escapeHtml(r.subject)}${r.user_name ? ` <span style="color:var(--dim); font-weight:400;">· ${escapeHtml(r.user_name)}</span>` : ''}</div>
        <div class="rt">${escapeHtml(r.description || 'No further details')}</div>
      </div>
      <span class="badge ${r.status === 'resolved' ? 'in' : 'out'}">${escapeHtml(r.status)}</span>
    </div>
  `).join('');
}
