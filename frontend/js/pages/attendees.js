// ATTENDEES PAGE

let CTX = { activeEventId: null, activeEvent: null };

document.addEventListener('DOMContentLoaded', async () => {
  CTX = await initShared();
  if (!CTX.user) return; // already redirected to login by initShared
  if (!CTX.activeEvent) {
    $('.toolbar').outerHTML = `<div class="empty"><h3>No event selected</h3><div>Create or select an event first.</div></div>`;
    $('#attTableWrap').remove();
    return;
  }

  const search = async (q) => {
    const rows = await apiGet(`/events/${CTX.activeEvent.id}/attendees${q ? '?q=' + encodeURIComponent(q) : ''}`);
    $('#attCount').textContent = `${rows.length} shown`;
    renderTable(rows);
  };

  await search('');
  $('#attSearch').addEventListener('input', (e) => search(e.target.value.trim()));
});

function renderTable(rows) {
  const wrap = $('#attTableWrap');
  if (rows.length === 0) {
    wrap.innerHTML = `<div class="empty"><h3>No attendees found</h3><div>Try a different search, or register someone from the Register page.</div></div>`;
    return;
  }
  wrap.innerHTML = `<table><thead><tr><th>Attendee</th><th>Contact</th><th>Ticket</th><th>Status</th><th></th></tr></thead><tbody>
    ${rows.map(a => `
      <tr>
        <td class="name-cell"><b>${escapeHtml(a.name)}</b><small>${a.id}</small></td>
        <td>${escapeHtml(a.email)}<br><span class="mono" style="font-size:11px;">${escapeHtml(a.phone)}</span></td>
        <td><span class="badge ${a.ticket_type === 'VIP' ? 'vip' : 'out'}">${escapeHtml(a.ticket_type)}</span></td>
        <td><span class="badge ${a.checked_in ? 'in' : 'out'}">${a.checked_in ? 'checked in' : 'not arrived'}</span></td>
        <td><button class="btn btn-ghost btn-sm" data-toggle="${a.id}">${a.checked_in ? 'Undo' : 'Check in'}</button></td>
      </tr>
    `).join('')}
  </tbody></table>`;

  $$('button[data-toggle]', wrap).forEach(btn => btn.addEventListener('click', async () => {
    await apiPatch(`/events/${CTX.activeEvent.id}/attendees/${btn.dataset.toggle}/toggle`, {});
    const rows2 = await apiGet(`/events/${CTX.activeEvent.id}/attendees`);
    $('#attCount').textContent = `${rows2.length} shown`;
    renderTable(rows2);
  }));
}
