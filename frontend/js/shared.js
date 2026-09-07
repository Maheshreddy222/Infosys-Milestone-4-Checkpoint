// SHARED ACROSS EVERY PAGE
// - persists which event is "active" across page navigations (localStorage,
//   since this is a real multi-page site now, not a single-page app)
// - highlights the current page in the sidebar / mobile nav
// - populates the event switcher dropdown that lives in every page's topbar

const ACTIVE_EVENT_KEY = 'checkpoint_active_event';

function getActiveEventId() {
  return localStorage.getItem(ACTIVE_EVENT_KEY) || null;
}
function setActiveEventId(id) {
  if (id) localStorage.setItem(ACTIVE_EVENT_KEY, id);
  else localStorage.removeItem(ACTIVE_EVENT_KEY);
}

function highlightNav() {
  const page = location.pathname.split('/').pop() || 'index.html';
  $$('.navitem, .mobile-tabs a').forEach((el) => el.classList.toggle('active', el.dataset.page === page));
}

function ensureAppChrome() {
  if (!document.getElementById('skipToContent')) {
    document.body.insertAdjacentHTML('afterbegin', '<a class="skip-link" id="skipToContent" href="#main-content">Skip to content</a>');
  }
  const main = document.querySelector('main');
  if (main) {
    main.id = 'main-content';
    main.setAttribute('tabindex', '-1');
  }
  if (!document.getElementById('appToastRegion')) {
    document.body.insertAdjacentHTML('beforeend', '<div id="appToastRegion" class="toast-region" aria-live="polite" aria-atomic="true"></div>');
  }
}

function showToast(message, type = 'info') {
  ensureAppChrome();
  const region = document.getElementById('appToastRegion');
  if (!region) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.textContent = message;
  region.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 220);
  }, 4200);
}

// Loads events, fills the switcher, resolves which event is active,
// renders the sidebar sign-in status, and returns
// { events, activeEventId, activeEvent, user }.
// Every page that calls this requires SOME signed-in account — if nobody's
// logged in, this redirects straight to login.html. (The public marketing
// landing page and login/signup pages don't include shared.js at all, so
// they're never affected by this redirect.)
async function initShared() {
  ensureAppChrome();
  highlightNav();
  const user = await renderAuthStatus();

  if (!user) {
    location.href = 'login.html';
    return { events: [], activeEventId: null, activeEvent: null, user: null };
  }

  let events = [];
  try {
    events = await apiGet('/events');
  } catch (e) {
    events = [];
  }

  const sel = $('#eventSwitcher');
  const pill = $('#sidebarEventPill');

  if (events.length === 0) {
    if (sel) sel.innerHTML = '<option value="">— no events yet —</option>';
    if (pill) pill.textContent = 'No event selected';
    setActiveEventId(null);
    return { events, activeEventId: null, activeEvent: null, user };
  }

  let activeEventId = getActiveEventId();
  if (!activeEventId || !events.find((e) => e.id === activeEventId)) {
    activeEventId = events[0].id;
  }
  setActiveEventId(activeEventId);

  if (sel) {
    sel.innerHTML = events.map((e) => `<option value="${e.id}">${escapeHtml(e.name)} — ${fmtDate(e.date)}</option>`).join('');
    sel.value = activeEventId;
    sel.addEventListener('change', (e) => {
      setActiveEventId(e.target.value || null);
      location.reload();
    });
  }

  const activeEvent = events.find((e) => e.id === activeEventId) || null;
  if (pill) pill.textContent = activeEvent ? `${activeEvent.name} (${activeEvent.code})` : 'No event selected';

  return { events, activeEventId, activeEvent, user };
}

// ACCEPTANCE POPUP — shown right after directly scheduling a venue or
// speaker (from Venues/Speakers pages, or the combined Scheduling page).
// Venues and speakers don't have their own login in this system, so an
// admin captures their response here (e.g. after a call or email) and
// it's recorded against the booking via PATCH .../venue-status or
// .../speaker-status. Returns a Promise that resolves once the admin
// picks Accept, Decline, or dismisses (leaving it Pending).
function showAcceptancePopup({ sessionId, eventId, resourceType, resourceName }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card">
        <div class="mi">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>
        </div>
        <h3>Booking request sent</h3>
        <p><b style="color:var(--text)">${escapeHtml(resourceName)}</b> has been notified of this booking and is awaiting a response. Record their reply below (or leave it pending for now).</p>
        <div class="modal-btns">
          <button class="btn btn-ghost btn-sm" id="modalDeclineBtn">Declined</button>
          <button class="btn btn-ghost btn-sm" id="modalLaterBtn">Leave pending</button>
          <button class="btn btn-amber btn-sm" id="modalAcceptBtn">Accepted</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = async (status) => {
      if (status) {
        try {
          const field = resourceType === 'venue' ? 'venue-status' : 'speaker-status';
          await apiPatch(`/events/${eventId}/sessions/${sessionId}/${field}`, { status });
        } catch (e) { /* best-effort; UI still closes */ }
      }
      document.body.removeChild(overlay);
      resolve(status || 'pending');
    };

    document.getElementById('modalAcceptBtn').addEventListener('click', () => close('accepted'));
    document.getElementById('modalDeclineBtn').addEventListener('click', () => close('declined'));
    document.getElementById('modalLaterBtn').addEventListener('click', () => close(null));
  });
}
