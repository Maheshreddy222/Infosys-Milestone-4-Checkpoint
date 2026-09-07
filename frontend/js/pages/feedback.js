// FEEDBACK PAGE — any signed-in account can submit; admins see everyone's,
// a regular user sees only their own (scoped server-side).

let CTX = { activeEventId: null, activeEvent: null };

document.addEventListener('DOMContentLoaded', async () => {
  CTX = await initShared();
  if (!CTX.user) return; // already redirected to login by initShared
  if (!CTX.activeEvent) {
    $('.grid2').outerHTML = `<div class="empty"><h3>No event selected</h3><div>Create or select an event first.</div></div>`;
    return;
  }

  $('#fbRating').addEventListener('input', () => { $('#fbRatingVal').textContent = $('#fbRating').value; });
  $('#submitFeedbackBtn').addEventListener('click', submitFeedback);
  $('#feedbackListTitle').textContent = isAdmin(CTX.user) ? 'All feedback' : 'Your feedback';

  await refreshFeedbackList();
});

async function submitFeedback() {
  const msg = $('#feedbackMsg');
  msg.classList.remove('show');
  const btn = $('#submitFeedbackBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Submitting…';

  try {
    await apiPost(`/events/${CTX.activeEvent.id}/feedback`, {
      rating: $('#fbRating').value, comments: $('#fbComments').value.trim(),
    });
    $('#fbComments').value = '';
    await refreshFeedbackList();
  } catch (e) {
    msg.textContent = e.error || 'Could not submit feedback — please try again.';
    msg.className = 'msg error show';
  } finally {
    btn.disabled = false; btn.innerHTML = 'Submit feedback';
  }
}

async function refreshFeedbackList() {
  const list = $('#feedbackList');
  const rows = await apiGet(`/events/${CTX.activeEvent.id}/feedback`);
  if (rows.length === 0) {
    list.innerHTML = `<div class="empty">No feedback submitted yet.</div>`;
    return;
  }
  list.innerHTML = rows.map(r => `
    <div class="scan-row" style="align-items:flex-start; margin-bottom:8px;">
      <div>
        ${r.user_name ? `<div class="rn" style="font-size:12.5px;">${escapeHtml(r.user_name)}</div>` : ''}
        <div class="rt">${escapeHtml(r.comments || 'No comments left')}</div>
      </div>
      <span class="badge vip">${r.rating}/5</span>
    </div>
  `).join('');
}
