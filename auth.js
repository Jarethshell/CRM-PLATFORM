if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
const getApiBase = () => (localStorage.getItem('ccs_server_url') || '').replace(/\/+$/, '');

const urlInp = document.getElementById('server-url-input');
urlInp.value = getApiBase();
document.getElementById('btn-save-server-url').addEventListener('click', () => {
  localStorage.setItem('ccs_server_url', urlInp.value.trim().replace(/\/+$/, ''));
  showAlert('Server Sync URL saved!', false);
});

const urlParams = new URLSearchParams(window.location.search);
const existingUser = JSON.parse(localStorage.getItem('ccs_user') || 'null');

if (existingUser && localStorage.getItem('ccs_token')) {
  if (!urlParams.has('signin')) {
    if (existingUser.role === 'admin') window.location.href = '/admin-dashboard.html';
    else if (existingUser.role === 'teacher') window.location.href = '/teacher-dashboard.html';
    else window.location.href = '/student-dashboard.html';
  } else {
    const returnBanner = document.createElement('div');
    returnBanner.style.cssText = 'background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:8px 12px;font-size:0.83rem;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;';
    const targetUrl = existingUser.role === 'admin' ? '/admin-dashboard.html' : (existingUser.role === 'teacher' ? '/teacher-dashboard.html' : '/student-dashboard.html');
    returnBanner.innerHTML = `<span>Active: <strong>${existingUser.name || 'User'}</strong></span><a href="${targetUrl}" style="color:var(--primary);font-weight:600;text-decoration:none;">Go to Dashboard &rarr;</a>`;
    const authCard = document.querySelector('.auth-card');
    const authHeader = document.querySelector('.auth-header');
    if (authCard && authHeader) authCard.insertBefore(returnBanner, authHeader.nextSibling);
  }
}

const tabLogin = document.getElementById('tab-login'), tabSignup = document.getElementById('tab-signup');
const formLogin = document.getElementById('form-login'), formSignup = document.getElementById('form-signup');
const alertBox = document.getElementById('auth-alert'), groupPasskey = document.getElementById('group-passkey'), inputPasskey = document.getElementById('signup-passkey');

function showAlert(msg, isError = true) {
  alertBox.textContent = msg;
  alertBox.className = `alert ${isError ? 'alert-error' : 'alert-success'}`;
  alertBox.classList.remove('hidden');
}

document.querySelectorAll('input[name="signupRole"]').forEach(r => {
  r.addEventListener('change', () => {
    const isTeacher = r.value === 'teacher' && r.checked;
    groupPasskey.classList.toggle('hidden', !isTeacher);
    inputPasskey.required = isTeacher;
  });
});

tabLogin.addEventListener('click', () => { tabLogin.classList.add('active'); tabSignup.classList.remove('active'); formLogin.classList.remove('hidden'); formSignup.classList.add('hidden'); alertBox.classList.add('hidden'); });
tabSignup.addEventListener('click', () => { tabSignup.classList.add('active'); tabLogin.classList.remove('active'); formSignup.classList.remove('hidden'); formLogin.classList.add('hidden'); alertBox.classList.add('hidden'); });

function redirectByRole(role) {
  if (role === 'admin') window.location.href = '/admin-dashboard.html';
  else if (role === 'teacher') window.location.href = '/teacher-dashboard.html';
  else window.location.href = '/student-dashboard.html';
}

formLogin.addEventListener('submit', async e => {
  e.preventDefault();
  const role = document.querySelector('input[name="loginRole"]:checked').value;
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (password.length < 5) return showAlert('Password must be at least 5 characters.');
  try {
    const res = await fetch(`${getApiBase()}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, role })
    });
    const data = await res.json();
    if (!res.ok) return showAlert(data.error || 'Login failed.');
    localStorage.setItem('ccs_user', JSON.stringify(data.user));
    localStorage.setItem('ccs_token', data.token);
    redirectByRole(data.user.role);
  } catch { showAlert('Cannot reach server.'); }
});

formSignup.addEventListener('submit', async e => {
  e.preventDefault();
  const role = document.querySelector('input[name="signupRole"]:checked').value;
  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const section = document.getElementById('signup-section').value.trim();
  const password = document.getElementById('signup-password').value;
  const passkey = inputPasskey.value;
  if (password.length < 5) return showAlert('Password must be at least 5 characters.');
  try {
    const res = await fetch(`${getApiBase()}/api/auth/signup`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, role, section, passkey })
    });
    const data = await res.json();
    if (!res.ok) return showAlert(data.error || 'Registration failed.');
    localStorage.setItem('ccs_user', JSON.stringify(data.user));
    localStorage.setItem('ccs_token', data.token);
    redirectByRole(data.user.role);
  } catch { showAlert('Cannot reach server.'); }
});
