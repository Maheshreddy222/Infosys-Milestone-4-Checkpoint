// SESSION ANALYTICS PAGE — venue utilization, speaker load, budget and
// capacity mismatches across scheduled sessions (Milestone 2).

document.addEventListener('DOMContentLoaded', async () => {
  const { activeEvent, user } = await initShared();
  if (!isAdmin(user)) { lockPageForAccount(user); return; }
  const el = $('#sessionAnalyticsBody');
  if (!activeEvent) {
    el.innerHTML = `<div class="empty"><h3>No event selected</h3><div>Create or select an event first.</div></div>`;
    return;
  }

  let stats;
  try {
    stats = await apiGet(`/events/${activeEvent.id}/session-analytics`);
  } catch (e) {
    el.innerHTML = `<div class="empty"><h3>Could not load session analytics</h3></div>`;
    return;
  }

  const venueEntries = Object.entries(stats.sessionsPerVenue || {});
  const speakerEntries = Object.entries(stats.sessionsPerSpeaker || {});
  const maxVenue = Math.max(1, ...venueEntries.map(([, v]) => v));
  const maxSpeaker = Math.max(1, ...speakerEntries.map(([, v]) => v));

  el.innerHTML = `
    <div class="kpis">
      <div class="kpi"><span>Sessions scheduled</span><b>${stats.totalSessions}</b></div>
      <div class="kpi"><span>Venue utilization</span><b>${stats.venueUtilization}%</b></div>
      <div class="kpi"><span>Avg. speaker engagement</span><b>${stats.avgEngagement || '—'}${stats.avgEngagement ? '/5' : ''}</b></div>
      <div class="kpi"><span>Total budget spend</span><b>₹${stats.budget.total}</b></div>
    </div>

    <div class="grid2">
      <div class="card">
        <h3>Sessions per venue</h3>
        <div class="bars">
          ${venueEntries.length === 0 ? '<div class="empty">No venue bookings yet</div>' :
            venueEntries.map(([name, count]) => `
              <div class="bar-row"><span>${escapeHtml(name)}</span><div class="bar-track"><div class="bar-fill" style="width:${(count / maxVenue) * 100}%"></div></div><span>${count}</span></div>
            `).join('')}
        </div>
      </div>
      <div class="card">
        <h3>Sessions per speaker</h3>
        <div class="bars">
          ${speakerEntries.length === 0 ? '<div class="empty">No speaker bookings yet</div>' :
            speakerEntries.map(([name, count]) => `
              <div class="bar-row"><span>${escapeHtml(name)}</span><div class="bar-track"><div class="bar-fill" style="width:${(count / maxSpeaker) * 100}%"></div></div><span>${count}</span></div>
            `).join('')}
        </div>
      </div>
    </div>

    <div class="grid2" style="margin-top:16px;">
      <div class="card">
        <h3>Budget breakdown</h3>
        <div class="bars">
          <div class="bar-row" style="grid-template-columns:110px 1fr;"><span>Venues</span><span style="color:var(--text)">₹${stats.budget.venueSpend}</span></div>
          <div class="bar-row" style="grid-template-columns:110px 1fr;"><span>Speakers</span><span style="color:var(--text)">₹${stats.budget.speakerSpend}</span></div>
          <div class="bar-row" style="grid-template-columns:110px 1fr;"><span>Total</span><span style="color:var(--amber)">₹${stats.budget.total}</span></div>
        </div>
      </div>
      <div class="card">
        <h3>Capacity mismatches</h3>
        ${stats.capacityMismatches.length === 0
          ? '<div class="empty" style="padding:20px;">No mismatches — every session fits its venue well.</div>'
          : stats.capacityMismatches.map(m => `
              <div class="mismatch-row">
                <span>${escapeHtml(m.topic)}<br><span style="color:var(--dim); font-size:11px;">${escapeHtml(m.venue)} — capacity ${m.venueCapacity}</span></span>
                <span class="badge ${m.issue === 'over capacity' ? 'out' : 'vip'}">${escapeHtml(m.issue)} (${m.expectedAttendees})</span>
              </div>
            `).join('')
        }
      </div>
    </div>
  `;
});
