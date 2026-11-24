const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');

const AUTH_SECRET = process.env.AUTH_SECRET || 'ccs-grade11-capstone-secret-2026';
const TEACHER_PASSKEY = process.env.TEACHER_PASSKEY || 'CCS-FACULTY';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@ccs.edu.ph').toLowerCase();
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';

function startServer(port = process.env.PORT || 3000, dataDir = process.env.DATA_DIR || __dirname) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '15mb' }));
  app.use(express.static(path.join(__dirname, 'public')));

  const DB_FILE = path.join(dataDir, 'database.json');
  const readDB = () => {
    if (!fs.existsSync(DB_FILE)) {
      const seedFile = path.join(__dirname, 'database.json');
      if (dataDir !== __dirname && fs.existsSync(seedFile)) {
        try {
          fs.copyFileSync(seedFile, DB_FILE);
        } catch {
          fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], calls: [], smtp: {} }, null, 2));
        }
      } else {
        fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], calls: [], smtp: {} }, null, 2));
      }
    }
    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    if (!data.smtp) data.smtp = {};
    return data;
  };
  const writeDB = data => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

  function hashPassword(pw) {
    const salt = crypto.randomBytes(16).toString('hex');
    return `${salt}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
  }

  function verifyPassword(pw, stored) {
    if (!stored) return false;
    if (stored.includes(':')) {
      const [salt, hash] = stored.split(':');
      const derived = crypto.scryptSync(pw, salt, 64);
      const hashBuf = Buffer.from(hash, 'hex');
      return hashBuf.length === derived.length && crypto.timingSafeEqual(hashBuf, derived);
    }
    const legacyHash = crypto.createHash('sha256').update(pw).digest('hex');
    const storedBuf = Buffer.from(stored, 'utf-8');
    const legacyBuf = Buffer.from(legacyHash, 'utf-8');
    return storedBuf.length === legacyBuf.length && crypto.timingSafeEqual(storedBuf, legacyBuf);
  }

  function signToken(user) {
    const payload = { id: user.id, email: user.email, role: user.role, name: user.name, exp: Date.now() + 7 * 86400000 };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', AUTH_SECRET).update(encoded).digest('base64url');
    return `${encoded}.${sig}`;
  }

  function verifyToken(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encoded, sig] = parts;
    const expected = crypto.createHmac('sha256', AUTH_SECRET).update(encoded).digest('base64url');
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    try {
      const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8'));
      return payload && payload.exp > Date.now() ? payload : null;
    } catch {
      return null;
    }
  }

  function requireAuth(req, res, next) {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : (req.query.token || '');
    const user = verifyToken(token);
    if (!user) return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    req.user = user;
    next();
  }

  function requireTeacher(req, res, next) {
    requireAuth(req, res, () => {
      if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Teacher access required.' });
      next();
    });
  }

  function requireAdmin(req, res, next) {
    requireAuth(req, res, () => {
      if (req.user.role !== 'admin') return res.status(403).json({ error: 'Platform Admin access required.' });
      next();
    });
  }

  function getMailer() {
    const db = readDB();
    const user = process.env.SMTP_USER || db.smtp?.user || '';
    const pass = process.env.SMTP_PASS || db.smtp?.pass || '';
    if (!user || !pass) return { transporter: null, user: '' };
    return {
      user,
      transporter: nodemailer.createTransport({ service: 'gmail', auth: { user, pass } })
    };
  }

  function buildPerformancePdfBuffer(call) {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.rect(0, 0, doc.page.width, 85).fill('#1e3a8a');
      doc.fillColor('#ffffff').fontSize(20).text('Grade 11 CCS Crosstrack', 50, 22);
      doc.fontSize(12).text('Contact Center CRM & Mock Call Performance Report', 50, 48);

      const metrics = call.metrics || {};
      const strengths = Array.isArray(metrics.strengths) && metrics.strengths.length ? metrics.strengths.join('; ') : 'Good effort on call handling';
      const weaknesses = Array.isArray(metrics.weaknesses) && metrics.weaknesses.length ? metrics.weaknesses.join('; ') : 'None documented';

      doc.fillColor('#0f172a').moveDown(3);
      doc.fontSize(11);
      doc.text(`Student Name: ${call.studentName || 'Student'}`, 50, 105);
      doc.text(`Email Address: ${call.studentEmail || '-'}`);
      doc.text(`Section: ${call.studentSection || 'Grade 11 CCS Crosstrack'}`);
      doc.text(`Scenario: ${call.scenarioTitle || 'Customer Scenario'} (${call.languageLabel || 'EN'})`);
      doc.text(`Call Date: ${new Date(call.timestamp || Date.now()).toLocaleString()}`);

      doc.moveDown(0.8);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cbd5e1').stroke();
      doc.moveDown(0.8);

      // Score Box
      if (call.grade) {
        doc.fontSize(14).fillColor('#16a34a').text(`Final Teacher Score: ${call.grade.totalScore} / 100`);
        doc.fontSize(10).fillColor('#334155').text(
          `Rubric Breakdown — Communication: ${call.grade.rubric?.comm ?? 0}/25 | Empathy: ${call.grade.rubric?.empathy ?? 0}/25 | CRM Accuracy: ${call.grade.rubric?.crm ?? 0}/25 | Resolution: ${call.grade.rubric?.res ?? 0}/25`
        );
        doc.text(`Evaluated By: ${call.grade.gradedBy || 'Instructor'} on ${new Date(call.grade.gradedAt || Date.now()).toLocaleString()}`);
      } else {
        doc.fontSize(13).fillColor('#d97706').text(`Status: Pending Teacher Grade (Auto QA Score: ${metrics.autoOverall ?? 0}%)`);
      }

      doc.moveDown(1);
      doc.fontSize(12).fillColor('#1e3a8a').text('CRM Ticket Logged by Student');
      doc.fontSize(10).fillColor('#0f172a');
      doc.text(`Customer Name: ${call.crmTicket?.customerName || 'Not entered'}`);
      doc.text(`Account / Order #: ${call.crmTicket?.accountNo || 'Not entered'}`);
      doc.text(`Category: ${call.crmTicket?.category || '-'} | Disposition: ${call.crmTicket?.disposition || '-'}`);
      doc.text(`Resolution Notes: ${call.crmTicket?.notes || 'None'}`);

      doc.moveDown(1);
      doc.fontSize(12).fillColor('#1e3a8a').text('Automated QA Metrics');
      doc.fontSize(10).fillColor('#0f172a');
      doc.text(`Average Handle Time (AHT): ${metrics.durationSec ?? 0}s | Hold Time: ${metrics.holdSec || 0}s | Dead Air Events: ${metrics.deadAirEvents || 0}`);
      doc.text(`Pace: ${metrics.wpm ?? 0} WPM | Empathy Score: ${metrics.empathyScore ?? 0}% | Script Adherence: ${metrics.adherenceScore ?? 0}%`);

      doc.moveDown(0.8);
      doc.fillColor('#15803d').text(`Did Well On: ${strengths}`);
      doc.moveDown(0.3);
      doc.fillColor('#b91c1c').text(`Areas to Improve: ${weaknesses}`);

      if (call.grade?.teacherFeedback) {
        doc.moveDown(1);
        doc.fontSize(12).fillColor('#1e3a8a').text('Teacher Feedback');
        doc.fontSize(10).fillColor('#0f172a').text(call.grade.teacherFeedback);
      }

      doc.end();
    });
  }

  // --- AUTHENTICATION ROUTES ---
  app.post('/api/auth/signup', (req, res) => {
    const { name, email, password, role, section, passkey } = req.body;
    if (!name || !email || !password || !role) return res.status(400).json({ error: 'All fields are required.' });
    if (!['student', 'teacher'].includes(role)) return res.status(400).json({ error: 'Invalid role for registration.' });
    if (role === 'teacher' && (passkey || '').trim() !== TEACHER_PASSKEY) {
      return res.status(403).json({ error: 'Invalid Teacher Passkey.' });
    }
    if (password.length < 5) return res.status(400).json({ error: 'Password must be at least 5 characters.' });

    const db = readDB();
    if (db.users.find(u => u.email.toLowerCase() === email.toLowerCase()) || email.toLowerCase() === ADMIN_EMAIL) {
      return res.status(409).json({ error: 'Email already exists.' });
    }
    const newUser = {
      id: 'USR-' + Date.now(), name: name.trim(), email: email.trim().toLowerCase(),
      passwordHash: hashPassword(password), role,
      section: section ? section.trim() : (role === 'student' ? 'Grade 11 CCS Crosstrack' : 'CCS Faculty'),
      createdAt: new Date().toISOString()
    };
    db.users.push(newUser);
    writeDB(db);
    const { passwordHash, ...safeUser } = newUser;
    res.status(201).json({ user: safeUser, token: signToken(safeUser) });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password, role } = req.body;
    const cleanEmail = (email || '').trim().toLowerCase();

    if (role === 'admin') {
      if (cleanEmail === ADMIN_EMAIL && password === ADMIN_PASS) {
        const adminUser = { id: 'ADMIN-01', name: 'Platform Administrator', email: ADMIN_EMAIL, role: 'admin', section: 'System Admin' };
        return res.json({ user: adminUser, token: signToken(adminUser) });
      }
      return res.status(401).json({ error: 'Invalid Admin credentials.' });
    }

    const db = readDB();
    const user = db.users.find(u => u.email.toLowerCase() === cleanEmail && u.role === role);
    if (!user || !verifyPassword(password || '', user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email, password, or role.' });
    }
    const { passwordHash, ...safeUser } = user;
    res.json({ user: safeUser, token: signToken(safeUser) });
  });

  // --- ADMIN ROUTES (END-OF-SEMESTER CLEANUP & SMTP) ---
  app.get('/api/admin/teachers', requireAdmin, (req, res) => {
    const teachers = readDB().users.filter(u => u.role === 'teacher').map(({ passwordHash, ...r }) => r);
    res.json(teachers);
  });

  app.delete('/api/admin/teachers/:id', requireAdmin, (req, res) => {
    const db = readDB();
    const t = db.users.find(u => u.id === req.params.id && u.role === 'teacher');
    if (!t) return res.status(404).json({ error: 'Teacher not found.' });
    db.users = db.users.filter(u => u.id !== req.params.id);
    writeDB(db);
    res.json({ message: `Deleted teacher account: ${t.name}` });
  });

  app.get('/api/admin/students', requireAdmin, (req, res) => {
    const students = readDB().users.filter(u => u.role === 'student').map(({ passwordHash, ...r }) => r);
    res.json(students);
  });

  app.delete('/api/admin/students/:id', requireAdmin, (req, res) => {
    const db = readDB();
    const s = db.users.find(u => u.id === req.params.id && u.role === 'student');
    if (!s) return res.status(404).json({ error: 'Student not found.' });
    db.users = db.users.filter(u => u.id !== req.params.id);
    db.calls = db.calls.filter(c => c.studentEmail.toLowerCase() !== s.email.toLowerCase());
    writeDB(db);
    res.json({ message: `Deleted student ${s.name} and their records.` });
  });

  app.post('/api/admin/end-semester', requireAdmin, (req, res) => {
    const { mode } = req.body;
    const db = readDB();
    if (mode === 'calls_only') {
      db.calls = [];
      writeDB(db);
      return res.json({ message: 'Cleared all mock call submissions for the new semester.' });
    }
    if (mode === 'students_and_calls') {
      db.users = db.users.filter(u => u.role === 'teacher');
      db.calls = [];
      writeDB(db);
      return res.json({ message: 'Cleared all student accounts and submissions (teachers kept).' });
    }
    if (mode === 'full_reset') {
      db.users = [];
      db.calls = [];
      writeDB(db);
      return res.json({ message: 'Cleared all teachers, students, and submissions.' });
    }
    res.status(400).json({ error: 'Invalid cleanup mode.' });
  });

  app.get('/api/admin/smtp', requireAdmin, (req, res) => {
    const db = readDB();
    res.json({ user: process.env.SMTP_USER || db.smtp?.user || '', configured: Boolean((process.env.SMTP_USER || db.smtp?.user) && (process.env.SMTP_PASS || db.smtp?.pass)) });
  });

  app.post('/api/admin/smtp', requireAdmin, (req, res) => {
    const { user, pass } = req.body;
    if (!user || !pass) return res.status(400).json({ error: 'Gmail address and App Password are required.' });
    const db = readDB();
    db.smtp = { user: user.trim(), pass: pass.trim() };
    writeDB(db);
    res.json({ message: 'Gmail SMTP settings saved permanently!' });
  });

  app.post('/api/admin/smtp/test', requireAdmin, async (req, res) => {
    const { testEmail } = req.body;
    const { transporter, user } = getMailer();
    if (!transporter) return res.status(400).json({ error: 'SMTP not configured yet.' });
    try {
      await transporter.sendMail({
        from: `"CCS ProCRM" <${user}>`,
        to: testEmail || user,
        subject: 'CCS ProCRM - Email Test Successful',
        text: 'Your Grade 11 CCS Crosstrack CRM platform is ready to email PDF performance reports!'
      });
      res.json({ message: `Test email sent to ${testEmail || user}!` });
    } catch (err) {
      res.status(500).json({ error: `Email failed: ${err.message}` });
    }
  });

  // --- TEACHER DIRECTORY ROUTES ---
  app.get('/api/students', requireTeacher, (req, res) => {
    res.json(readDB().users.filter(u => u.role === 'student').map(({ passwordHash, ...r }) => r));
  });

  app.delete('/api/students/:id', requireTeacher, (req, res) => {
    const db = readDB();
    const student = db.users.find(u => u.id === req.params.id && u.role === 'student');
    if (!student) return res.status(404).json({ error: 'Student not found.' });
    db.users = db.users.filter(u => u.id !== req.params.id);
    db.calls = db.calls.filter(c => c.studentEmail.toLowerCase() !== student.email.toLowerCase());
    writeDB(db);
    res.json({ message: `Removed ${student.name} and their submissions.` });
  });

  // --- CALL & OFFLINE SYNC ROUTES ---
  app.post('/api/calls/sync', requireAuth, (req, res) => {
    const incoming = Array.isArray(req.body.calls) ? req.body.calls : [req.body];
    const db = readDB();
    const syncedIds = [];
    incoming.forEach(call => {
      if (!call || !call.clientCallId) return;
      const safeEmail = req.user.role === 'student' ? req.user.email : call.studentEmail;
      const idx = db.calls.findIndex(c => c.clientCallId === call.clientCallId);
      const record = { ...call, studentEmail: safeEmail, syncedAt: new Date().toISOString() };
      if (idx >= 0) {
        const existing = db.calls[idx];
        db.calls[idx] = {
          ...existing,
          ...record,
          // Preserve teacher evaluation and graded status if already graded
          status: existing.status === 'graded' ? 'graded' : (record.status || existing.status || 'pending_grade'),
          grade: existing.grade || record.grade
        };
      } else {
        db.calls.push({ ...record, status: record.status || 'pending_grade' });
      }
      syncedIds.push(call.clientCallId);
    });
    writeDB(db);
    res.json({ message: 'Synced successfully', syncedIds });
  });

  app.get('/api/calls', requireAuth, (req, res) => {
    let calls = readDB().calls;
    if (req.user.role === 'student') calls = calls.filter(c => c.studentEmail.toLowerCase() === req.user.email.toLowerCase());
    else if (req.query.studentEmail) calls = calls.filter(c => c.studentEmail.toLowerCase() === req.query.studentEmail.toLowerCase());
    res.json(calls.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
  });

  app.get('/api/calls/:clientCallId/pdf', requireAuth, async (req, res) => {
    try {
      const call = readDB().calls.find(c => c.clientCallId === req.params.clientCallId);
      if (!call) return res.status(404).send('Call record not found.');
      if (req.user.role === 'student' && call.studentEmail.toLowerCase() !== req.user.email.toLowerCase()) {
        return res.status(403).send('Forbidden.');
      }
      const pdfBuffer = await buildPerformancePdfBuffer(call);
      const safeName = (call.studentName || 'Student').replace(/[^a-z0-9]/gi, '_');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="CCS_Performance_${safeName}.pdf"`);
      res.send(pdfBuffer);
    } catch (err) {
      res.status(500).send(`Failed to generate PDF: ${err.message}`);
    }
  });

  app.delete('/api/calls/clear-pending', requireTeacher, (req, res) => {
    const db = readDB();
    const before = db.calls.length;
    db.calls = db.calls.filter(c => c.status === 'graded');
    writeDB(db);
    res.json({ message: `Cleared ${before - db.calls.length} pending call(s).` });
  });

  app.delete('/api/calls/:clientCallId', requireAuth, (req, res) => {
    const db = readDB();
    const target = db.calls.find(c => c.clientCallId === req.params.clientCallId);
    if (!target) return res.status(404).json({ error: 'Call not found.' });
    if (req.user.role === 'student') {
      if (target.studentEmail.toLowerCase() !== req.user.email.toLowerCase()) {
        return res.status(403).json({ error: 'Forbidden.' });
      }
      if (target.status === 'graded') {
        return res.status(400).json({ error: 'Cannot delete call record that has already been graded by instructor.' });
      }
    }
    db.calls = db.calls.filter(c => c.clientCallId !== req.params.clientCallId);
    writeDB(db);
    res.json({ message: 'Call deleted.' });
  });

  // --- TEACHER GRADING & PDF EMAIL DISPATCH ---
  app.post('/api/calls/:clientCallId/grade', requireTeacher, async (req, res) => {
    const { rubric, totalScore, teacherFeedback } = req.body;
    const db = readDB();
    const idx = db.calls.findIndex(c => c.clientCallId === req.params.clientCallId);
    if (idx === -1) return res.status(404).json({ error: 'Call not found.' });

    db.calls[idx].grade = { rubric, totalScore, teacherFeedback, gradedBy: req.user.name, gradedAt: new Date().toISOString() };
    db.calls[idx].status = 'graded';
    writeDB(db);

    const call = db.calls[idx];
    const pdfBuffer = await buildPerformancePdfBuffer(call);
    const safeName = call.studentName.replace(/[^a-z0-9]/gi, '_');

    const { transporter, user } = getMailer();
    let emailStatus = 'Grade & PDF generated! (Configure Gmail SMTP in Admin Dashboard to email live PDFs.)';

    if (transporter) {
      try {
        await transporter.sendMail({
          from: `"CCS ProCRM Evaluator" <${user}>`,
          to: call.studentEmail,
          subject: `[CCS Grade Report PDF] ${call.scenarioTitle} - Score: ${totalScore}/100`,
          html: `<p>Hello <b>${call.studentName}</b>,</p><p>Attached is your official <b>PDF Performance Report</b> for <b>${call.scenarioTitle}</b>.</p><p><b>Final Score:</b> ${totalScore} / 100<br/><b>Evaluated By:</b> ${req.user.name}</p><p><b>Feedback:</b> ${teacherFeedback}</p>`,
          attachments: [{ filename: `CCS_Performance_${safeName}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }]
        });
        emailStatus = `Official PDF Performance Report emailed to ${call.studentEmail}!`;
      } catch (err) {
        emailStatus = `Grade saved & PDF ready, but email failed: ${err.message}`;
      }
    }
    res.json({ call, emailStatus });
  });

  app.post('/api/ai/chat', requireAuth, async (req, res) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.json({ fallback: true });
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: req.body.systemPrompt }, ...req.body.history], max_tokens: 120 })
      });
      const d = await r.json();
      res.json(d.choices?.[0]?.message?.content ? { reply: d.choices[0].message.content } : { fallback: true });
    } catch { res.json({ fallback: true }); }
  });

  return app.listen(port, () => console.log(`CCS CRM Platform running at http://localhost:${port}`));
}

if (require.main === module) startServer();
module.exports = { startServer };
