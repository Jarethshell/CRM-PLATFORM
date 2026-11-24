if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
const currentUser = JSON.parse(localStorage.getItem('ccs_user') || 'null');
if (!currentUser || !localStorage.getItem('ccs_token') || currentUser.role !== 'student') {
  localStorage.clear(); window.location.href = '/index.html';
}

document.getElementById('student-name-display').textContent = currentUser.name;
document.getElementById('student-section-display').textContent = currentUser.section;

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    ['view-simulator', 'view-diagnostics', 'view-crm', 'view-grades'].forEach(id => document.getElementById(id).classList.add('hidden'));
    document.getElementById(btn.dataset.view).classList.remove('hidden');
    if (btn.dataset.view === 'view-crm') renderCallLogs();
    if (btn.dataset.view === 'view-grades') renderGrades();
  });
});

document.getElementById('btn-logout').addEventListener('click', () => { localStorage.clear(); window.location.href = '/index.html'; });

const networkBadge = document.getElementById('network-badge'), syncBadge = document.getElementById('sync-count-badge');
async function updateSyncStatus() {
  if (navigator.onLine) {
    networkBadge.className = 'badge badge-online'; networkBadge.textContent = 'Online - Auto-Sync Active';
    await syncPendingCalls(currentUser.email);
  } else {
    networkBadge.className = 'badge badge-offline'; networkBadge.textContent = 'Offline Mode - Saving Locally';
  }
  const pendingCount = (await getLocalCalls(currentUser.email)).filter(c => !c.synced).length;
  syncBadge.textContent = `${pendingCount} Pending Sync`;
}
window.addEventListener('online', async () => { await updateSyncStatus(); renderCallLogs(); });
window.addEventListener('offline', updateSyncStatus);
updateSyncStatus();

let callActive = false, onHold = false, holdSec = 0, holdWarned = false, callStartTime = null, timerInterval = null, deadAirEvents = 0, lastActivityTime = null, transcript = [], turnCount = 0;
let mediaRecorder = null, audioChunks = [], recorderStream = null;

const chatBox = document.getElementById('chat-transcript'), agentInput = document.getElementById('agent-input');
const btnStart = document.getElementById('btn-start-call'), btnHold = document.getElementById('btn-hold-call'), btnEnd = document.getElementById('btn-end-call');
const btnSend = document.getElementById('btn-send-reply'), btnMic = document.getElementById('btn-mic-toggle'), recBadge = document.getElementById('rec-badge');

function escapeHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function appendMessage(sender, text) {
  const div = document.createElement('div');
  if (sender === 'system') { div.className = 'msg-system'; div.textContent = text; }
  else {
    div.className = `msg ${sender === 'agent' ? 'msg-agent' : 'msg-customer'}`;
    div.innerHTML = `<span class="msg-meta">${sender === 'agent' ? 'You (Agent)' : 'AI Customer'}</span>${escapeHtml(text)}`;
    transcript.push({ sender, text, time: new Date().toISOString() });
  }
  chatBox.appendChild(div); chatBox.scrollTop = chatBox.scrollHeight;
}

function updateLiveMetrics() {
  const sec = Math.max(1, Math.floor((Date.now() - callStartTime) / 1000));
  const m = evaluateCallMetrics(transcript, sec, document.getElementById('lang-select').value, document.getElementById('crm-notes').value, holdSec);
  document.getElementById('live-wpm').textContent = m.wpm;
  document.getElementById('live-empathy').textContent = m.empathyScore + '%';
  document.getElementById('live-adherence').textContent = m.adherenceScore + '%';
  document.getElementById('live-hold').textContent = holdSec + 's';
  document.getElementById('live-deadair').textContent = deadAirEvents;
}

async function startVoiceRecording() {
  audioChunks = [];
  if (!navigator.mediaDevices || !window.MediaRecorder) return;
  try {
    recorderStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(recorderStream, { audioBitsPerSecond: 24000 });
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.start(); recBadge.classList.remove('hidden');
  } catch { mediaRecorder = null; }
}

function stopVoiceRecording() {
  recBadge.classList.add('hidden');
  return new Promise(resolve => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      if (recorderStream) recorderStream.getTracks().forEach(t => t.stop());
      return resolve(null);
    }
    mediaRecorder.onstop = () => {
      if (recorderStream) recorderStream.getTracks().forEach(t => t.stop());
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' }));
    };
    mediaRecorder.stop();
  });
}

btnStart.addEventListener('click', async () => {
  const scenarioKey = document.getElementById('scenario-select').value, lang = document.getElementById('lang-select').value;
  const scenario = SCENARIOS[scenarioKey];
  callActive = true; onHold = false; holdSec = 0; holdWarned = false; callStartTime = Date.now(); lastActivityTime = Date.now(); deadAirEvents = 0; turnCount = 0; transcript = [];
  chatBox.innerHTML = '';

  // Editable CRM fields start blank so student must ask & encode Customer Name + Account #
  document.getElementById('crm-cust-name').value = '';
  document.getElementById('crm-cust-account').value = '';
  document.getElementById('crm-issue-cat').value = scenario.category;
  document.getElementById('crm-notes').value = '';

  btnStart.classList.add('hidden'); btnHold.classList.remove('hidden'); btnHold.textContent = 'Hold Call'; btnEnd.classList.remove('hidden');
  agentInput.disabled = false; agentInput.placeholder = 'Type or speak your agent spiel...'; btnSend.disabled = false; btnMic.disabled = false;

  await startVoiceRecording();
  appendMessage('customer', scenario[lang].opening); speakText(scenario[lang].opening, lang);

  timerInterval = setInterval(() => {
    const sec = Math.floor((Date.now() - callStartTime) / 1000);
    document.getElementById('call-timer').textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
    if (onHold) {
      holdSec++; lastActivityTime = Date.now();
      if (holdSec > 45 && !holdWarned) { holdWarned = true; appendMessage('system', 'QA Warning: Hold time exceeded 45s!'); }
    } else if (Date.now() - lastActivityTime > 12000) { deadAirEvents++; lastActivityTime = Date.now(); }
    updateLiveMetrics();
  }, 1000);
});

btnHold.addEventListener('click', () => {
  if (!callActive) return;
  onHold = !onHold;
  btnHold.textContent = onHold ? 'Resume Call' : 'Hold Call';
  agentInput.disabled = onHold; btnSend.disabled = onHold; btnMic.disabled = onHold;
  agentInput.placeholder = onHold ? 'Call is ON HOLD...' : 'Type or speak your agent spiel...';
  if (!onHold) lastActivityTime = Date.now();
  appendMessage('system', onHold ? 'Call placed ON HOLD (Dead-air paused).' : 'Call RESUMED. Thank the customer for holding.');
});

async function handleAgentReply() {
  const text = agentInput.value.trim();
  if (!text || !callActive || onHold) return;
  agentInput.value = ''; lastActivityTime = Date.now(); appendMessage('agent', text); updateLiveMetrics();
  const lang = document.getElementById('lang-select').value;
  const reply = await generateAIReply(document.getElementById('scenario-select').value, lang, turnCount++, transcript);
  setTimeout(() => { if (!callActive) return; appendMessage('customer', reply); speakText(reply, lang); lastActivityTime = Date.now(); }, 600);
}

btnSend.addEventListener('click', handleAgentReply);
agentInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleAgentReply(); });

let micRecognizing = false;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
  const recognition = new SpeechRecognition();
  recognition.interimResults = false;
  btnMic.addEventListener('click', () => {
    if (micRecognizing) return;
    if (!navigator.onLine) return alert('Speech-to-text requires internet. You can type your spiel directly in the box!');
    try {
      micRecognizing = true;
      recognition.lang = document.getElementById('lang-select').value === 'fil' ? 'fil-PH' : 'en-US';
      btnMic.textContent = 'Listening...';
      recognition.start();
    } catch {
      micRecognizing = false;
      btnMic.textContent = 'Speak (Mic)';
    }
  });
  recognition.onresult = e => {
    micRecognizing = false;
    agentInput.value = e.results[0][0].transcript;
    btnMic.textContent = 'Speak (Mic)';
    handleAgentReply();
  };
  recognition.onerror = e => {
    micRecognizing = false;
    btnMic.textContent = 'Speak (Mic)';
    if (e.error === 'network') {
      alert('Note: Google Speech-to-text is unreachable or offline. You can seamlessly type your spiel in the input box!');
    } else if (e.error !== 'no-speech') {
      alert(`Mic notice (${e.error}). You can type your spiel instead.`);
    }
  };
  recognition.onend = () => {
    micRecognizing = false;
    btnMic.textContent = 'Speak (Mic)';
  };
} else {
  btnMic.addEventListener('click', () => alert('Voice-to-text works in Chrome/Edge. You can type your spiel directly in this browser.'));
}

btnEnd.addEventListener('click', async () => {
  callActive = false; onHold = false; clearInterval(timerInterval);
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  const audioDataUrl = await stopVoiceRecording();
  const durationSec = Math.max(1, Math.floor((Date.now() - callStartTime) / 1000));
  const scenarioKey = document.getElementById('scenario-select').value, lang = document.getElementById('lang-select').value, notes = document.getElementById('crm-notes').value;
  const crmTicket = {
    customerName: document.getElementById('crm-cust-name').value.trim(),
    accountNo: document.getElementById('crm-cust-account').value.trim(),
    category: document.getElementById('crm-issue-cat').value,
    disposition: document.getElementById('crm-disposition').value,
    notes
  };
  const metrics = evaluateCallMetrics(transcript, durationSec, lang, notes, holdSec, crmTicket, SCENARIOS[scenarioKey]);
  metrics.deadAirEvents = deadAirEvents;

  await saveCallLocally({
    clientCallId: 'CALL-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    studentName: currentUser.name, studentEmail: currentUser.email, studentSection: currentUser.section,
    scenarioKey, scenarioTitle: SCENARIOS[scenarioKey].title, language: lang, languageLabel: lang === 'fil' ? 'Filipino' : 'English',
    crmTicket, transcript, audioDataUrl, metrics, timestamp: new Date().toISOString(), synced: false, status: 'pending_grade'
  });
  await updateSyncStatus();
  btnStart.classList.remove('hidden'); btnHold.classList.add('hidden'); btnEnd.classList.add('hidden');
  agentInput.disabled = true; btnSend.disabled = true; btnMic.disabled = true;
  alert(navigator.onLine ? 'Mock call & CRM ticket saved and synced!' : 'OFFLINE: Saved locally and will auto-upload when Wi-Fi returns!');
});

// --- 10 ENGLISH BPO TYPING SPIELS ---
const TYPING_SPIELS_EN = [
  'Thank you for calling CCS Crosstrack Support! My name is Alex, how may I assist you today?',
  'I completely understand how frustrating this service interruption is. Let me look into this right away.',
  'Before we access your account details, may I please verify your full name and account number?',
  'May I place you on a brief hold for one to two minutes while I check your billing statement?',
  'Thank you so much for patiently holding. I have reviewed your account and found the extra charge.',
  'I have created a priority technical support ticket and scheduled a technician visit for tomorrow.',
  'To keep your account secure, I will send a one-time verification code to your registered mobile number.',
  'I apologize for the delay in your parcel delivery. Let me process a full refund to your e-wallet.',
  'Could you please confirm if the indicator light on your fiber modem is still blinking red?',
  'Is there anything else I can assist you with today? Thank you for calling and have a wonderful day!'
];
let typingIndex = 0, typingStart = null, typingTimer = null;
const typingPromptEl = document.getElementById('typing-prompt'), typingInputEl = document.getElementById('typing-input'), typingCounterEl = document.getElementById('typing-counter');

function loadTypingSpiel() {
  const idx = typingIndex % TYPING_SPIELS_EN.length;
  typingPromptEl.textContent = TYPING_SPIELS_EN[idx];
  typingCounterEl.textContent = `Spiel ${idx + 1} of ${TYPING_SPIELS_EN.length} (English)`;
  typingInputEl.value = ''; typingStart = null; clearInterval(typingTimer);
  document.getElementById('typing-wpm').textContent = '0 WPM'; document.getElementById('typing-acc').textContent = '100%';
  document.getElementById('typing-time').textContent = '0s'; document.getElementById('typing-status').textContent = 'Ready';
}
function updateTypingStats() {
  const target = typingPromptEl.textContent, typed = typingInputEl.value;
  if (!typingStart && typed.length > 0) { typingStart = Date.now(); typingTimer = setInterval(updateTypingStats, 300); }
  if (!typingStart) return;
  const elapsedSec = Math.max(1, (Date.now() - typingStart) / 1000);
  let correct = 0; for (let i = 0; i < typed.length; i++) if (typed[i] === target[i]) correct++;
  const acc = typed.length > 0 ? Math.round((correct / typed.length) * 100) : 100;
  const wpm = Math.round((correct / 5) / (elapsedSec / 60));
  document.getElementById('typing-wpm').textContent = `${wpm} WPM`; document.getElementById('typing-acc').textContent = `${acc}%`;
  document.getElementById('typing-time').textContent = `${Math.floor(elapsedSec)}s`;
  if (typed.length >= target.length) {
    clearInterval(typingTimer);
    document.getElementById('typing-status').textContent = (wpm >= 30 && acc >= 90) ? 'PASSED' : 'Keep Practicing';
  }
}
typingInputEl.addEventListener('input', updateTypingStats);
document.getElementById('btn-typing-reset').addEventListener('click', loadTypingSpiel);
document.getElementById('btn-typing-next').addEventListener('click', () => { typingIndex++; loadTypingSpiel(); });
loadTypingSpiel();

// --- MIC & SPEECH RECOGNITION TEST ---
let micStream = null, audioCtx = null, meterAnim = null;
const btnMicStart = document.getElementById('btn-test-mic-start'), btnMicStop = document.getElementById('btn-test-mic-stop'), micFill = document.getElementById('mic-meter-fill'), micStatus = document.getElementById('mic-test-status');
btnMicStart.addEventListener('click', async () => {
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioCtx.createAnalyser(); analyser.fftSize = 256;
    audioCtx.createMediaStreamSource(micStream).connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    btnMicStart.classList.add('hidden'); btnMicStop.classList.remove('hidden'); micStatus.textContent = 'Speak to see the green bar move.';
    const draw = () => { analyser.getByteFrequencyData(data); micFill.style.width = Math.min(100, Math.round((data.reduce((a, b) => a + b, 0) / data.length / 80) * 100)) + '%'; meterAnim = requestAnimationFrame(draw); };
    draw();
  } catch (e) { micStatus.textContent = `Mic error: ${e.message}`; }
});
btnMicStop.addEventListener('click', () => {
  cancelAnimationFrame(meterAnim); if (micStream) micStream.getTracks().forEach(t => t.stop()); if (audioCtx) audioCtx.close();
  micFill.style.width = '0%'; btnMicStart.classList.remove('hidden'); btnMicStop.classList.add('hidden'); micStatus.textContent = 'Stopped.';
});

const btnTestSpeech = document.getElementById('btn-test-speech'), speechOutput = document.getElementById('speech-test-output');
let speechTesting = false;

if (btnTestSpeech) {
  btnTestSpeech.addEventListener('click', () => {
    if (speechTesting) return;

    if (!SpeechRecognition) {
      speechOutput.innerHTML = '<span style="color:var(--danger)">⚠️ Speech-to-text requires <strong>Google Chrome</strong> or <strong>Microsoft Edge</strong>.</span>';
      return;
    }
    if (!navigator.onLine) {
      speechOutput.innerHTML = '<span style="color:var(--warning)">⚠️ Offline Mode: Web Speech-to-Text requires internet access to reach Google Speech servers. When offline, students type their agent spiels into the CRM chat.</span>';
      return;
    }

    try {
      speechTesting = true;
      const rec = new SpeechRecognition();
      rec.lang = document.getElementById('speech-test-lang').value;
      rec.interimResults = false;
      rec.maxAlternatives = 1;

      btnTestSpeech.textContent = '🎙️ Listening... Speak now';
      speechOutput.textContent = 'Listening to your microphone... Say a customer service greeting!';

      rec.onresult = e => {
        speechTesting = false;
        const transcriptText = e.results[0][0].transcript;
        speechOutput.innerHTML = `<strong>Recognized:</strong> <span style="color:var(--success);font-weight:600;">"${escapeHtml(transcriptText)}"</span>`;
        btnTestSpeech.textContent = 'Test Voice-to-Text';
      };

      rec.onerror = e => {
        speechTesting = false;
        btnTestSpeech.textContent = 'Test Voice-to-Text';
        let detail = `Error (${e.error})`;
        if (e.error === 'network') {
          detail = '⚠️ Network Notice: Google Speech API could not be reached. (Common in school firewalls or offline labs). In the mock call simulator, students can seamlessly type their responses in the agent chat!';
        } else if (e.error === 'not-allowed') {
          detail = '⚠️ Mic Blocked: Please allow microphone permission in your browser address bar.';
        } else if (e.error === 'no-speech') {
          detail = '⚠️ No speech detected. Please speak closer to your microphone and click Test again.';
        }
        speechOutput.innerHTML = `<span style="color:var(--danger)">${detail}</span>`;
      };

      rec.onend = () => {
        speechTesting = false;
        btnTestSpeech.textContent = 'Test Voice-to-Text';
      };

      rec.start();
    } catch (err) {
      speechTesting = false;
      btnTestSpeech.textContent = 'Test Voice-to-Text';
      speechOutput.innerHTML = `<span style="color:var(--danger)">Microphone error: ${err.message}</span>`;
    }
  });
}

const btnTestSpeaker = document.getElementById('btn-test-speaker');
if (btnTestSpeaker) {
  btnTestSpeaker.addEventListener('click', () => {
    const isFil = document.getElementById('speech-test-lang').value === 'fil-PH';
    const text = isFil
      ? 'Magandang araw po! Gumagana na ang audio at AI customer voice ng system.'
      : 'Hello! Your speaker and AI customer voice are working properly.';

    btnTestSpeaker.textContent = '🔊 Playing AI Voice...';
    btnTestSpeaker.disabled = true;

    speakText(text, isFil ? 'fil' : 'en', () => {
      btnTestSpeaker.textContent = 'Play Sample AI Customer Voice';
      btnTestSpeaker.disabled = false;
    });

    setTimeout(() => {
      btnTestSpeaker.textContent = 'Play Sample AI Customer Voice';
      btnTestSpeaker.disabled = false;
    }, 4500);
  });
}

document.getElementById('btn-force-sync').addEventListener('click', async () => { await updateSyncStatus(); await renderCallLogs(); });
document.getElementById('search-crm-logs').addEventListener('input', renderCallLogs);

async function renderCallLogs() {
  const q = document.getElementById('search-crm-logs').value.trim().toLowerCase();
  const all = await getLocalCalls(currentUser.email);
  const list = q ? all.filter(c => c.scenarioTitle.toLowerCase().includes(q) || (c.crmTicket.accountNo || '').toLowerCase().includes(q)) : all;
  const tbody = document.getElementById('crm-records-tbody');
  tbody.innerHTML = list.length ? '' : '<tr><td colspan="8">No mock calls recorded yet.</td></tr>';
  list.forEach(c => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${new Date(c.timestamp).toLocaleString()}</td><td>${c.scenarioTitle}</td><td>${c.languageLabel}</td><td>${c.crmTicket.customerName || '—'} (${c.crmTicket.accountNo || '—'})</td><td>${c.metrics.durationSec}s / ${c.metrics.holdSec || 0}s</td><td><strong>${c.metrics.autoOverall}%</strong></td><td><span class="badge ${c.synced ? 'badge-online' : 'badge-offline'}">${c.synced ? 'Synced' : 'Offline Queue'}</span></td><td><button class="btn btn-danger" onclick="removeStudentCall('${c.clientCallId}', ${Boolean(c.synced)})">Delete</button></td>`;
    tbody.appendChild(tr);
  });
}

window.removeStudentCall = async function(id, isSynced) {
  if (!confirm('Remove this call record?')) return;
  await deleteLocalCall(id);
  if (isSynced && navigator.onLine) await fetch(`${getServerBase()}/api/calls/${id}`, { method: 'DELETE', headers: getAuthHeaders() }).catch(() => {});
  await updateSyncStatus(); await renderCallLogs();
};

document.getElementById('btn-student-clear-pending').addEventListener('click', async () => {
  if (!confirm('Delete all unsynced pending calls?')) return;
  alert(`Cleared ${await clearPendingLocalCalls(currentUser.email)} pending call(s).`);
  await updateSyncStatus(); await renderCallLogs();
});

async function renderGrades() {
  const box = document.getElementById('student-grades-list');
  if (!navigator.onLine) return (box.innerHTML = '<p>Reconnect to Wi-Fi to load grades.</p>');
  const token = localStorage.getItem('ccs_token') || '';
  const res = await fetch(`${getServerBase()}/api/calls`, { headers: getAuthHeaders() });
  if (res.status === 401) { localStorage.clear(); return (window.location.href = '/index.html'); }
  const graded = (await res.json()).filter(c => c.status === 'graded' && c.grade);
  box.innerHTML = graded.length ? graded.map(c => `
    <div class="card" style="border-left:4px solid var(--success);">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <h4 style="margin:0;">${c.scenarioTitle} — <strong>${c.grade.totalScore}/100</strong></h4>
        <a class="btn btn-primary" href="${getServerBase()}/api/calls/${c.clientCallId}/pdf?token=${encodeURIComponent(token)}" target="_blank">Download PDF Report</a>
      </div>
      <p><b>Did Well:</b> ${c.metrics.strengths.join('; ')}</p>
      <p><b>Improve:</b> ${c.metrics.weaknesses.join('; ')}</p>
      <p><b>Feedback:</b> ${c.grade.teacherFeedback}</p>
    </div>`).join('') : '<p style="color:var(--muted);">No graded mock calls yet.</p>';
}
