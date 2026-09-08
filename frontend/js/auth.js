// ACCOUNTS — session token storage + role helpers used on every page.
// Two separate dashboards: 'user' (registration, events (view-only), my
// schedule, past events, feedback, log-only incidents, analytics, AI
// insights) and 'admin' (events incl. creation, check-in, venues,
// speakers, scheduling, session analytics, sponsors, full incident
// management, operations).

const TOKEN_KEY = 'checkpoint_token';

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || null;
}
function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
}
function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function isAdmin(user) {
  return !!(user && user.role === 'admin');
}

// Resolves the signed-in user (or null), clearing a stale/expired token if found.
async function getCurrentUser() {
  if (!getToken()) return null;
  try {
    const res = await apiGet('/auth/me');
    return res.user;
  } catch (e) {
    clearToken();
    return null;
  }
}

// Populates the small "Log in" / "Signed in as ..." line in the sidebar,
// and hides/shows admin-only nav links based on role. Returns the user (or null).
async function renderAuthStatus() {
  const el = document.getElementById('authStatus');
  const user = await getCurrentUser();

  if (el) {
    if (user) {
      const roleLabel = isAdmin(user) ? 'Administrator' : 'User';
      el.innerHTML = `
        <div>Signed in as <b style="color:var(--text)">${escapeHtml(user.name)}</b></div>
        <div class="mono" style="color:var(--dim); font-size:10px; margin:2px 0 8px;">${roleLabel}</div>
        <button class="btn btn-ghost btn-sm" id="signOutBtn" style="width:100%;">Sign out</button>
      `;
      const signOutBtn = document.getElementById('signOutBtn');
      if (signOutBtn) signOutBtn.addEventListener('click', () => { clearToken(); location.href = 'login.html'; });
    } else {
      el.innerHTML = `<a href="login.html" style="color:var(--amber)">Log in</a> to continue`;
    }
  }

  filterNavByRole(user);
  return user;
}

// Each nav link is tagged data-roles="user" / "admin" / "user,admin" and
// only shown if the signed-in account's role is in that list. The two
// dashboards are NOT cumulative — a user gets exactly their own set of
// pages (Registration, Events, My Schedule, Past Events, Feedback,
// Incidents, Analytics, AI Insights), and an admin gets their own
// separate set (Events, Check-in, Venues, Speakers, Scheduling, Session
// Analytics, Sponsors, Incidents, Operations) — Events and Incidents are
// the only two pages both roles share, each with different capabilities
// once there.
function filterNavByRole(user) {
  const role = user ? user.role : null;

  document.querySelectorAll('[data-roles]').forEach((el) => {
    const roles = el.dataset.roles.split(',');
    el.style.display = role && roles.includes(role) ? '' : 'none';
  });

  // Reveal the sidebar only after role filtering is complete.
  document.body.classList.add('auth-ready');
}

// Replaces everything in <main> below the topbar with a locked-out message.
// Used on Milestone 2 & 3 pages when the signed-in user isn't an admin (or
// isn't signed in at all). The server enforces this too (every admin-only
// API route requires the same role check), so this is a UX convenience,
// not the actual security boundary.
function lockPageForAccount(user) {
  const needsLogin = !user;
  document.querySelectorAll('main > *:not(.topbar)').forEach((el) => el.remove());
  document.querySelector('main').insertAdjacentHTML(
    'beforeend',
    `<div class="card" style="max-width:440px; margin:36px auto 0; text-align:center;">
      <h3>Administrator account required</h3>
      <p style="color:var(--muted); font-size:13.5px; margin:10px 0 20px; line-height:1.6;">
        ${needsLogin
          ? 'Venue, speaker, sponsorship and incident planning tools are only available to signed-in admin accounts.'
          : 'This tool is limited to admin accounts. Your account is registered as a user.'}
      </p>
      ${needsLogin
        ? `<a class="btn btn-amber" href="login.html">Log in</a>&nbsp;<a class="btn btn-ghost" href="signup.html">Create an account</a>`
        : `<a class="btn btn-amber" href="events.html">Back to Events</a>`}
    </div>`
  );
}

// Convenience for pages that haven't called initShared() (which already
// resolves the user): checks the admin role and locks the page in one call.
async function requireAdminOrBlock() {
  const user = await renderAuthStatus();

  if (!isAdmin(user)) {
    lockPageForAccount(user);
  }

  return user;
}
