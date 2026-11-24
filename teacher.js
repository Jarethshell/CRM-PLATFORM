const currentUser = JSON.parse(localStorage.getItem('ccs_user') || 'null');
if (!currentUser || !localStorage.getItem('ccs_token') || currentUser.role !== 'teacher') {
  localStorage.removeItem('ccs_user'); localStorage.removeItem('ccs_token'); window.location.href = '/index.html';
}
const getServerBase = () => (localStorage.getItem('ccs_server_url') || '').replace(/\/+$/, '');
const authHeaders = (extra = {}) => ({ ...extra, Authorization: `Bearer ${localStorage.getItem('ccs_token') || ''}` });

document.getElementById('teacher-name-display').textContent = currentUser.name;
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    ['view-submissions', 'view-students'].forEach(id => document.getElementById(id).classList.add('hidden'));
    document.getElementById(btn.dataset.view).classList.remove('hidden');
  });
});
document.getElementById('btn-logout').addEventListener('click', () => {
  localStorage.removeItem('ccs_user'); localStorage.removeItem('ccs_token'); window.location.href = '/index.html';
});

let allCalls = [], allStudents = [], activeCallId = null;

function escapeHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

async function loadDashboardData() {
  const [callsRes, studentsRes] = await Promise.all([
    fetch(`${getServerBase()}/api/calls`, { headers: authHeaders() }),
    fetch(`${getServerBase()}/api/students`, { headers: authHeaders() })
  ]);
  if (callsRes.status === 401 || callsRes.status === 403 || studentsRes.status === 401) {
    localStorage.clear(); return (window.location.href = '/index.html');
  }
  allCalls = await callsRes.json(); allStudents = await studentsRes.json();
  const graded = allCalls.filter(c => c.status === 'graded' && c.grade);
  document.getElementById('stat-total-calls').textContent = allCalls.length;
  document.getElementById('stat-pending-grades').textContent = allCalls.filter(c => c.status !== 'graded').length;
  document.getElementById('stat-avg-score').textContent = (graded.length ? Math.round(graded.reduce((s, c) => s + c.grade.totalScore, 0) / graded.length) : 0) + '%';
  document.getElementById('stat-total-students').textContent = allStudents.length;
  renderSubmissions(); renderStudents();
}

function renderSubmissions() {
  const filter = document.getElementById('filter-status').value, q = document.getElementById('search-submissions').value.trim().toLowerCase();
  const filtered = allCalls.filter(c => (filter === 'all' || c.status === filter) && (!q || c.studentName.toLowerCase().includes(q) || c.studentEmail.toLowerCase().includes(q) || c.scenarioTitle.toLowerCase().includes(q)));
  const tbody = document.getElementById('submissions-tbody');
  tbody.innerHTML = filtered.length ? '' : '<tr><td colspan="7">No matching submissions.</td></tr>';
  filtered.forEach(c => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${escapeHtml(c.studentName)}</strong><br/><small style="color:var(--muted);">${escapeHtml(c.studentEmail)}</small></td><td>${escapeHtml(c.scenarioTitle)}</td><td>${escapeHtml(c.languageLabel)}</td><td>AHT: ${c.metrics.durationSec}s | Hold: ${c.metrics.holdSec || 0}s | Emp: ${c.metrics.empathyScore}%</td><td><span class="badge ${c.status === 'graded' ? 'badge-online' : 'badge-offline'}">${c.status === 'graded' ? 'Graded' : 'Pending'}</span></td><td><strong>${c.grade ? c.grade.totalScore + '/100' : '—'}</strong></td><td style="display:flex;gap:6px;"><button class="btn btn-primary" onclick="openGradeModal('${c.clientCallId}')">${c.status === 'graded' ? 'Review' : 'Grade'}</button><button class="btn btn-danger" onclick="deleteSubmission('${c.clientCallId}')">Delete</button></td>`;
    tbody.appendChild(tr);
  });
}

function renderStudents() {
  const q = document.getElementById('search-students').value.trim().toLowerCase();
  const list = q ? allStudents.filter(s => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q) || s.section.toLowerCase().includes(q)) : allStudents;
  const tbody = document.getElementById('students-tbody');
  tbody.innerHTML = list.length ? '' : '<tr><td colspan="5">No matching students.</td></tr>';
  list.forEach(s => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${escapeHtml(s.name)}</strong></td><td>${escapeHtml(s.email)}</td><td>${escapeHtml(s.section)}</td><td>${new Date(s.createdAt).toLocaleDateString()}</td><td><button class="btn btn-danger" onclick="deleteStudent('${s.id}')">Delete</button></td>`;
    tbody.appendChild(tr);
  });
}

window.deleteStudent = async function(id) {
  if (!confirm('Delete this student and their call records?')) return;
  const res = await fetch(`${getServerBase()}/api/students/${id}`, { method: 'DELETE', headers: authHeaders() });
  const data = await res.json();
  alert(data.message || data.error || (res.ok ? 'Student deleted' : 'Failed to delete student'));
  loadDashboardData();
};

window.openGradeModal = function(id) {
  const call = allCalls.find(c => c.clientCallId === id); if (!call) return;
  activeCallId = id;
  const crmNotes = escapeHtml(call.crmTicket?.notes || 'None');
  const strengths = (call.metrics?.strengths || []).map(escapeHtml).join('; ');
  const weaknesses = (call.metrics?.weaknesses || []).map(escapeHtml).join('; ');
  document.getElementById('modal-call-details').innerHTML = `<p><strong>Student:</strong> ${escapeHtml(call.studentName)} (${escapeHtml(call.studentEmail)}) | <strong>Scenario:</strong> ${escapeHtml(call.scenarioTitle)}</p><p><strong>CRM:</strong> ${escapeHtml(call.crmTicket?.accountNo || '-')} • ${escapeHtml(call.crmTicket?.disposition || '-')} • Hold: ${call.metrics?.holdSec || 0}s • Notes: <em>${crmNotes}</em></p><p style="color:var(--success);"><strong>Did Well:</strong> ${strengths}</p><p style="color:var(--danger);"><strong>Improve:</strong> ${weaknesses}</p>`;
  document.getElementById('modal-pdf-wrap').innerHTML = `<a class="btn btn-outline btn-full" href="${getServerBase()}/api/calls/${call.clientCallId}/pdf?token=${encodeURIComponent(localStorage.getItem('ccs_token') || '')}" target="_blank">Download Performance Report (PDF)</a>`;
  document.getElementById('modal-audio-wrap').innerHTML = call.audioDataUrl ? `<audio controls src="${call.audioDataUrl}" style="width:100%;"></audio>` : `<small style="color:var(--muted);">No voice audio recorded.</small>`;
  document.getElementById('modal-transcript').innerHTML = (call.transcript || []).map(m => `<div class="msg ${m.sender === 'agent' ? 'msg-agent' : 'msg-customer'}"><span class="msg-meta">${m.sender === 'agent' ? 'Student' : 'AI'}</span>${escapeHtml(m.text)}</div>`).join('');
  if (call.grade) {
    ['comm', 'empathy', 'crm', 'res'].forEach((k, i) => (document.getElementById(['grade-comm', 'grade-empathy', 'grade-crm', 'grade-res'][i]).value = call.grade.rubric[k]));
    document.getElementById('teacher-feedback').value = call.grade.teacherFeedback || '';
  }
  updateTotalScore(); document.getElementById('grade-modal').classList.remove('hidden');
};

function updateTotalScore() {
  const total = ['grade-comm', 'grade-empathy', 'grade-crm', 'grade-res'].reduce((s, id) => s + Number(document.getElementById(id).value || 0), 0);
  document.getElementById('grade-total-display').textContent = `${total} / 100`;
  return total;
}
document.querySelectorAll('.rubric-input').forEach(i => i.addEventListener('input', updateTotalScore));
document.getElementById('btn-close-modal').addEventListener('click', () => document.getElementById('grade-modal').classList.add('hidden'));

document.getElementById('form-grade').addEventListener('submit', async e => {
  e.preventDefault();
  const rubric = { comm: +document.getElementById('grade-comm').value, empathy: +document.getElementById('grade-empathy').value, crm: +document.getElementById('grade-crm').value, res: +document.getElementById('grade-res').value };
  const res = await fetch(`${getServerBase()}/api/calls/${activeCallId}/grade`, {
    method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ rubric, totalScore: updateTotalScore(), teacherFeedback: document.getElementById('teacher-feedback').value.trim() })
  });
  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'Failed to save grade.');
    return;
  }
  document.getElementById('grade-modal').classList.add('hidden');
  alert(data.emailStatus || 'Grade saved successfully!');
  loadDashboardData();
});

window.deleteSubmission = async function(id) {
  if (!confirm('Delete this submission?')) return;
  await fetch(`${getServerBase()}/api/calls/${id}`, { method: 'DELETE', headers: authHeaders() });
  loadDashboardData();
};

document.getElementById('btn-clear-pending').addEventListener('click', async () => {
  if (!confirm('Clear ALL pending submissions?')) return;
  const res = await fetch(`${getServerBase()}/api/calls/clear-pending`, { method: 'DELETE', headers: authHeaders() });
  alert((await res.json()).message); loadDashboardData();
});

document.getElementById('btn-export-csv').addEventListener('click', () => {
  if (!allCalls.length) return alert('No records to export.');
  const headers = ['Student Name', 'Email', 'Section', 'Scenario', 'Language', 'AHT(s)', 'Hold(s)', 'Auto QA%', 'Status', 'Final Grade', 'Feedback', 'Date'];
  const rows = allCalls.map(c => [c.studentName, c.studentEmail, c.studentSection || '', c.scenarioTitle, c.languageLabel, c.metrics.durationSec, c.metrics.holdSec || 0, c.metrics.autoOverall, c.status, c.grade ? c.grade.totalScore : '', (c.grade?.teacherFeedback || '').replace(/"/g, '""'), new Date(c.timestamp).toLocaleString()].map(v => `"${v}"`).join(','));
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' }));
  link.download = `CCS_Class_Grades_${new Date().toISOString().slice(0, 10)}.csv`; link.click();
});

document.getElementById('filter-status').addEventListener('change', renderSubmissions);
document.getElementById('search-submissions').addEventListener('input', renderSubmissions);
document.getElementById('search-students').addEventListener('input', renderStudents);
document.getElementById('btn-refresh-data').addEventListener('click', loadDashboardData);
loadDashboardData();
