const user = JSON.parse(localStorage.getItem('ccs_user') || 'null');
if (!user || !localStorage.getItem('ccs_token') || user.role !== 'admin') {
  localStorage.clear(); window.location.href = '/index.html';
}
const getBase = () => (localStorage.getItem('ccs_server_url') || '').replace(/\/+$/, '');
const headers = (extra = {}) => ({ ...extra, Authorization: `Bearer ${localStorage.getItem('ccs_token') || ''}` });

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    ['view-teachers', 'view-admin-students', 'view-smtp', 'view-semester'].forEach(id => document.getElementById(id).classList.add('hidden'));
    document.getElementById(btn.dataset.view).classList.remove('hidden');
  });
});

document.getElementById('btn-logout').addEventListener('click', () => { localStorage.clear(); window.location.href = '/index.html'; });

function escapeHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

async function loadAdminData() {
  const [tRes, sRes, smtpRes] = await Promise.all([
    fetch(`${getBase()}/api/admin/teachers`, { headers: headers() }),
    fetch(`${getBase()}/api/admin/students`, { headers: headers() }),
    fetch(`${getBase()}/api/admin/smtp`, { headers: headers() })
  ]);
  if (tRes.status === 401 || tRes.status === 403) { localStorage.clear(); return (window.location.href = '/index.html'); }

  const teachers = await tRes.json();
  const students = await sRes.json();
  const smtp = await smtpRes.json();

  const tBody = document.getElementById('admin-teachers-tbody');
  tBody.innerHTML = teachers.length ? teachers.map(t => `<tr><td><strong>${escapeHtml(t.name)}</strong></td><td>${escapeHtml(t.email)}</td><td>${escapeHtml(t.section)}</td><td>${new Date(t.createdAt).toLocaleDateString()}</td><td><button class="btn btn-danger" onclick="deleteTeacher('${t.id}')">Delete Teacher</button></td></tr>`).join('') : '<tr><td colspan="5">No teachers registered.</td></tr>';

  const sBody = document.getElementById('admin-students-tbody');
  sBody.innerHTML = students.length ? students.map(s => `<tr><td><strong>${escapeHtml(s.name)}</strong></td><td>${escapeHtml(s.email)}</td><td>${escapeHtml(s.section)}</td><td>${new Date(s.createdAt).toLocaleDateString()}</td><td><button class="btn btn-danger" onclick="deleteStudentAdmin('${s.id}')">Delete Student</button></td></tr>`).join('') : '<tr><td colspan="5">No students registered.</td></tr>';

  document.getElementById('smtp-user').value = smtp.user || '';
  document.getElementById('smtp-status-text').textContent = smtp.configured ? `Configured (${smtp.user})` : 'Not configured yet';
  document.getElementById('smtp-status-text').style.color = smtp.configured ? 'var(--success)' : 'var(--warning)';
}

window.deleteTeacher = async function(id) {
  if (!confirm('Delete this Teacher account permanently?')) return;
  const r = await fetch(`${getBase()}/api/admin/teachers/${id}`, { method: 'DELETE', headers: headers() });
  const data = await r.json();
  alert(data.message || data.error || (r.ok ? 'Teacher deleted' : 'Failed to delete'));
  loadAdminData();
};

window.deleteStudentAdmin = async function(id) {
  if (!confirm('Delete this Student account and their records?')) return;
  const r = await fetch(`${getBase()}/api/admin/students/${id}`, { method: 'DELETE', headers: headers() });
  const data = await r.json();
  alert(data.message || data.error || (r.ok ? 'Student deleted' : 'Failed to delete'));
  loadAdminData();
};

window.runCleanup = async function(mode) {
  if (!confirm('Are you sure you want to run this semester cleanup? This cannot be undone!')) return;
  const r = await fetch(`${getBase()}/api/admin/end-semester`, {
    method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ mode })
  });
  const data = await r.json();
  alert(data.message || data.error || (r.ok ? 'Cleanup complete' : 'Cleanup failed'));
  loadAdminData();
};

document.getElementById('form-smtp').addEventListener('submit', async e => {
  e.preventDefault();
  const r = await fetch(`${getBase()}/api/admin/smtp`, {
    method: 'POST', headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ user: document.getElementById('smtp-user').value, pass: document.getElementById('smtp-pass').value })
  });
  const data = await r.json();
  alert(data.message || data.error || (r.ok ? 'SMTP saved' : 'Failed to save SMTP'));
  loadAdminData();
});

document.getElementById('btn-test-smtp').addEventListener('click', async () => {
  const testEmail = document.getElementById('smtp-test-email').value.trim();
  const r = await fetch(`${getBase()}/api/admin/smtp/test`, {
    method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ testEmail })
  });
  const d = await r.json();
  alert(d.message || d.error);
});

document.getElementById('btn-admin-refresh').addEventListener('click', loadAdminData);
loadAdminData();
