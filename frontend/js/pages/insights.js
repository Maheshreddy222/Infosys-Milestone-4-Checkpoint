// AI INSIGHTS PAGE — on the user dashboard; reads attendee registration
// and check-in data to surface actionable insights.

let CTX = { activeEventId: null, activeEvent: null };

document.addEventListener('DOMContentLoaded', async () => {
  CTX = await initShared();
  if (!CTX.user) return; // already redirected to login by initShared
  if (!CTX.activeEvent) {
    $('.card').outerHTML = `<div class="empty"><h3>No event selected</h3><div>Create or select an event first.</div></div>`;
    return;
  }
  $('#genInsightsBtn').addEventListener('click', generateInsights);
});

async function generateInsights() {
  const ev = CTX.activeEvent;
  const btn = $('#genInsightsBtn');
  const out = $('#insightsOut');

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Analyzing…';
  out.innerHTML = '';

  try {
    const result = await apiPost(`/events/${ev.id}/insights`, {});
    if (!result.insights || result.insights.length === 0) {
      out.innerHTML = `<div class="msg info show">${escapeHtml(result.message || "No data to analyze yet.")}</div>`;
      return;
    }
    out.innerHTML = result.insights.map((txt, i) => `
      <div class="insight"><div class="tag">${i + 1}</div><p>${escapeHtml(txt)}</p></div>
    `).join('') + (result.source ? `<div class="sub" style="color:var(--dim); font-size:11px; margin-top:6px;">source: ${escapeHtml(result.source)}</div>` : '');
  } catch (e) {
    out.innerHTML = `<div class="msg error show">Couldn't generate insights right now. Please try again in a moment.</div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '✨ Generate AI insights';
  }
}
