const SCENARIOS = {
  telco: {
    title: 'Telco Fiber Internet Outage', customerName: 'Maria Santos', accountNo: 'ACC-884210', category: 'Technical Support',
    en: { opening: 'Hello? Yes, good day. My fiber internet has been blinking red since this morning!', verifyReply: 'My name is Maria Santos and my account number is ACC-884210.', needVerify: 'Wait, should you verify my name or account number first?', troubleshoot: 'Yes, I already restarted the router twice, still blinking red.', needAction: 'How are we going to fix this? Will you schedule a technician?', closing: 'Thank you for scheduling the technician and assisting me today!' },
    fil: { opening: 'Hello? Magandang araw po. Kanina pang umaga nagbi-blink ng pula yung fiber modem namin!', verifyReply: 'Ako si Maria Santos at ang account number ko ay ACC-884210.', needVerify: 'Teka po, hindi niyo po ba muna i-ve-verify yung pangalan o account ko?', troubleshoot: 'Opo, na-restart ko na nang dalawang beses pero pula pa rin.', needAction: 'Ano pong solusyon? Magpapadala po ba kayo ng technician?', closing: 'Sige po, maraming salamat sa pag-schedule ng technician!' }
  },
  billing: {
    title: 'Mobile Plan Overcharge Dispute', customerName: 'Carlo Mendoza', accountNo: 'ACC-552901', category: 'Billing & Dispute',
    en: { opening: 'Hi, my monthly bill is 1,500 pesos higher than usual! Why did this happen?', verifyReply: 'I am Carlo Mendoza, account number ACC-552901.', needVerify: 'Hold on, do you need to verify my name and account first?', troubleshoot: 'I never traveled abroad or turned on roaming.', needAction: 'Can you file a billing dispute ticket for this extra charge?', closing: 'Thank you for resolving my billing dispute clearly!' },
    fil: { opening: 'Hello po, bakit tumaas ng 1,500 pesos yung monthly bill ko?', verifyReply: 'Ako si Carlo Mendoza, account number ACC-552901.', needVerify: 'Sandali lang po, hindi niyo po ba muna hihingin pangalan at account ko?', troubleshoot: 'Hindi po ako nag-roaming o nag-upgrade ng plan.', needAction: 'Pwede po bang mag-file ng billing dispute ticket?', closing: 'Sige po, maraming salamat sa malinaw na paliwanag!' }
  },
  ecommerce: {
    title: 'Missing E-Commerce Parcel Refund', customerName: 'Angela Reyes', accountNo: 'ORD-993104', category: 'Order & Logistics',
    en: { opening: 'Hello, my order says delivered on the app, but I never received my parcel!', verifyReply: 'My name is Angela Reyes and my order number is ORD-993104.', needVerify: 'Excuse me, shouldn’t you verify my order number or name first?', troubleshoot: 'I asked our guard and neighbors, nobody got it.', needAction: 'Please process a full refund to my e-wallet.', closing: 'Thank you so much for processing my refund quickly!' },
    fil: { opening: 'Hello po, nakalagay delivered na yung parcel ko pero wala namang dumating!', verifyReply: 'Ako si Angela Reyes at ang order number ay ORD-993104.', needVerify: 'Sandali po, hindi niyo po ba muna i-ve-verify order number ko?', troubleshoot: 'Nagtanong na ako sa guard at kapitbahay, wala talaga.', needAction: 'Paki-process na lang po ng full refund sa e-wallet ko.', closing: 'Maraming salamat po sa mabilis na pag-process ng refund!' }
  },
  banking: {
    title: 'Online Banking Password Lockout', customerName: 'Rafael Bautista', accountNo: 'BNK-771209', category: 'Account Security',
    en: { opening: 'Excuse me, I got locked out of my mobile banking app and need to pay tuition!', verifyReply: 'My name is Rafael Bautista, account BNK-771209, birthday May 14, 2000.', needVerify: 'Shouldn’t we verify my identity and account first for security?', troubleshoot: 'Yes, I have my registered phone for the OTP code.', needAction: 'Can you unlock my account or send a password reset link?', closing: 'Got it! I can log back in now. Thank you so much!' },
    fil: { opening: 'Hello po, na-lock yung mobile banking app ko at magbabayad ako ng tuition!', verifyReply: 'Ako si Rafael Bautista, account BNK-771209, birthday May 14, 2000.', needVerify: 'Para sa security, hindi po ba dapat i-verify muna account ko?', troubleshoot: 'Opo, hawak ko po yung registered mobile number para sa OTP.', needAction: 'Pwede niyo po bang i-unlock o magpadala ng password reset link?', closing: 'Ayos! Nakapag-login na po ako ulit. Maraming salamat po!' }
  }
};

const EMPATHY_EN = ['sorry', 'apologize', 'understand', 'happy to help', 'assist', 'certainly', 'please', 'thank you', 'appreciate'];
const EMPATHY_FIL = ['pasensya', 'paumanhin', 'naiintindihan', 'tutulungan', 'maasikaso', 'po', 'opo', 'salamat', 'ikinalulungkot'];

let currentUtterance = null;

function playAudioChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.38);
  } catch {}
}

function speakText(text, lang = 'en', onDone = null) {
  playAudioChime();
  if (!('speechSynthesis' in window)) {
    if (typeof onDone === 'function') onDone();
    return;
  }

  try {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }

    const u = new SpeechSynthesisUtterance(text);
    currentUtterance = u; // Keep reference to prevent garbage collection

    const voices = window.speechSynthesis.getVoices() || [];
    if (lang === 'fil') {
      const filVoice = voices.find(v => v.lang && (v.lang.includes('fil') || v.lang.includes('tl')));
      if (filVoice) {
        u.voice = filVoice;
        u.lang = filVoice.lang;
      } else {
        u.lang = 'en-US';
        const fallback = voices.find(v => v.default) || voices[0];
        if (fallback) u.voice = fallback;
      }
    } else {
      u.lang = 'en-US';
      const enVoice = voices.find(v => v.lang && v.lang.startsWith('en')) || voices[0];
      if (enVoice) u.voice = enVoice;
    }

    u.rate = 1.0;
    u.pitch = 1.0;

    u.onend = () => {
      currentUtterance = null;
      if (typeof onDone === 'function') onDone();
    };

    u.onerror = () => {
      currentUtterance = null;
      if (typeof onDone === 'function') onDone();
    };

    window.speechSynthesis.speak(u);
  } catch {
    if (typeof onDone === 'function') onDone();
  }
}

if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    try { window.speechSynthesis.getVoices(); } catch {}
  };
}

async function generateAIReply(scenarioKey, lang, turnIndex, history) {
  const scenario = SCENARIOS[scenarioKey];
  if (navigator.onLine) {
    try {
      const token = localStorage.getItem('ccs_token') || '';
      const base = (localStorage.getItem('ccs_server_url') || '').replace(/\/+$/, '');
      const res = await fetch(`${base}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          systemPrompt: `You are ${scenario.customerName} (Account/Order: ${scenario.accountNo}), calling a Philippine BPO about ${scenario.title}. Speak strictly in ${lang === 'fil' ? 'Filipino' : 'English'} under 2 sentences. Only share your name and account number when asked.`,
          history: history.map(m => ({ role: m.sender === 'agent' ? 'user' : 'assistant', content: m.text }))
        })
      });
      const data = await res.json();
      if (data.reply) return data.reply;
    } catch {}
  }

  const s = scenario[lang];
  const agentMsgs = history.filter(m => m.sender === 'agent').map(m => m.text.toLowerCase());
  const latest = agentMsgs[agentMsgs.length - 1] || '';
  const allText = agentMsgs.join(' ');
  const askedVerify = /name|account|order|number|verify|confirm|pangalan|numero/.test(allText);
  const gaveAction = /ticket|technician|schedule|refund|waive|dispute|reset|unlock|link|process|ayusin/.test(allText);

  if (/anything else|have a great|thank you for calling|iba pa|salamat sa pagtawag/.test(latest)) {
    if (!askedVerify) return s.needVerify;
    if (!gaveAction) return s.needAction;
    return s.closing;
  }
  if (/name|account|order|number|verify|confirm|pangalan|numero/.test(latest) && turnIndex <= 2) return s.verifyReply;
  if (!askedVerify && turnIndex >= 1) return s.needVerify;
  if (/ticket|technician|schedule|refund|waive|dispute|reset|unlock|link|process|ayusin/.test(latest)) return s.closing;
  if (turnIndex === 1) return s.troubleshoot;
  if (turnIndex >= 2 && !gaveAction) return s.needAction;
  return s.closing;
}

function evaluateCallMetrics(transcript, durationSec, lang, crmNotes, holdSec = 0, crmTicket = null, expected = null) {
  const fullText = transcript.filter(t => t.sender === 'agent').map(t => t.text.toLowerCase()).join(' ');
  const words = fullText.trim() ? fullText.trim().split(/\s+/).length : 0;
  const wpm = Math.round((words / Math.max(1, durationSec - holdSec)) * 60);
  const kw = lang === 'fil' ? EMPATHY_FIL : EMPATHY_EN;
  const empathyScore = Math.min(100, Math.round((kw.filter(k => fullText.includes(k)).length / 4) * 100));

  let checks = 0;
  if (/hello|good|magandang|thank you for calling|salamat sa pagtawag/.test(fullText)) checks++;
  if (/name|account|order|verify|pangalan|numero|confirm/.test(fullText)) checks++;
  if (/check|ticket|refund|schedule|reset|unlock|dispute|assist|ayusin|tulong|process/.test(fullText)) checks++;
  if (/anything else|have a great|thank you|salamat|ingat|paalam/.test(fullText)) checks++;
  const adherenceScore = Math.round((checks / 4) * 100);

  const strengths = [], weaknesses = [];
  if (empathyScore >= 75) strengths.push('Strong empathy & courteous tone'); else weaknesses.push('Low empathy markers');
  if (adherenceScore >= 75) strengths.push('Followed proper BPO call flow'); else weaknesses.push('Missed key call flow steps');
  if (wpm >= 70 && wpm <= 165) strengths.push(`Well-paced speed (${wpm} WPM)`); else weaknesses.push(`Response pace (${wpm} WPM)`);
  if (holdSec > 45) weaknesses.push(`Long hold time (${holdSec}s > 45s)`); else if (holdSec > 0) strengths.push(`Good hold handling (${holdSec}s)`);
  if (crmNotes && crmNotes.trim().length >= 15) strengths.push('Complete CRM resolution notes'); else weaknesses.push('Incomplete CRM notes');

  let crmAccurate = true;
  if (expected && crmTicket) {
    const nameOk = (crmTicket.customerName || '').toLowerCase().includes(expected.customerName.split(' ')[0].toLowerCase());
    const accOk = (crmTicket.accountNo || '').toUpperCase().includes(expected.accountNo.toUpperCase());
    crmAccurate = nameOk && accOk;
    if (crmAccurate) strengths.push('Accurately verified & encoded Customer Name and Account #');
    else weaknesses.push(`Incorrect or missing CRM Customer Name / Account # (Expected: ${expected.customerName} / ${expected.accountNo})`);
  }

  let autoOverall = Math.round((empathyScore * 0.30) + (adherenceScore * 0.40) + (((crmNotes || '').trim().length >= 15 ? 15 : 5)) + (crmAccurate ? 15 : 0));
  if (holdSec > 45) autoOverall = Math.max(0, autoOverall - 10);
  return { durationSec, holdSec, wpm, empathyScore, adherenceScore, autoOverall, strengths, weaknesses };
}
