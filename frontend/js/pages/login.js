// LOGIN PAGE

const ROLE_SUB = {
  user: 'Sign in to register attendees, view your schedule and more.',
  admin: 'Sign in to manage events, venues, speakers, sponsors and incidents.',
};

document.addEventListener('DOMContentLoaded', async () => {
  // Already signed in? Skip straight to Events.
  const user = await getCurrentUser();
  if (user) { location.href = 'events.html'; return; }

  $('#tabUser').addEventListener('click', () => selectTab('user'));
  $('#tabAdmin').addEventListener('click', () => selectTab('admin'));

  $('#loginBtn').addEventListener('click', login);
  $('#loginPassword').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
});

function selectTab(role) {
  $('#tabUser').classList.toggle('active', role === 'user');
  $('#tabAdmin').classList.toggle('active', role === 'admin');
  $('#loginSub').textContent = ROLE_SUB[role];
}

async function login() {
  const msg = $('#loginMsg');
  msg.classList.remove('show');

  const email = $('#loginEmail').value.trim();
  const password = $('#loginPassword').value;
  if (!email || !password) {
    msg.textContent = 'Email and password are required.';
    msg.className = 'msg error show';
    return;
  }

  const btn = $('#loginBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Logging in…';

  try {
    const result = await apiPost('/auth/login', { email, password });
    setToken(result.token);
    location.href = 'events.html';
  } catch (e) {
    msg.textContent = e.error || 'Could not log in — please try again.';
    msg.className = 'msg error show';
    btn.disabled = false;
    btn.innerHTML = 'Log in';
  }
}
