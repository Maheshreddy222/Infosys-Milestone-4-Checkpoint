// SIGNUP PAGE

document.addEventListener('DOMContentLoaded', async () => {
  const user = await getCurrentUser();
  if (user) { location.href = 'events.html'; return; }

  $('#signupBtn').addEventListener('click', signup);
  $('#signupPassword').addEventListener('keydown', (e) => { if (e.key === 'Enter') signup(); });
});

async function signup() {
  const msg = $('#signupMsg');
  msg.classList.remove('show');

  const name = $('#signupName').value.trim();
  const email = $('#signupEmail').value.trim();
  const password = $('#signupPassword').value;
  const role = $('#signupRole').value;

  if (!name || !email || !password) {
    msg.textContent = 'Name, email and password are required.';
    msg.className = 'msg error show';
    return;
  }
  if (password.length < 6) {
    msg.textContent = 'Password must be at least 6 characters.';
    msg.className = 'msg error show';
    return;
  }

  const btn = $('#signupBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Creating account…';

  try {
    const result = await apiPost('/auth/register', { name, email, password, role });
    setToken(result.token);
    location.href = 'events.html';
  } catch (e) {
    msg.textContent = e.error || 'Could not create your account — please try again.';
    msg.className = 'msg error show';
    btn.disabled = false;
    btn.innerHTML = 'Create account';
  }
}
