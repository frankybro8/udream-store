const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(express.json({ limit: '2mb' }));

// Serve static files (with .html extension fallback)
app.use(express.static(path.join(__dirname), { extensions: ['html'] }));

// Gmail transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

// Generate coupon code
function generateCoupon() {
  return 'UDREAM5-' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Coupon API endpoint
app.post('/api/coupon', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.json({ success: false, error: 'يرجى إدخال بريد إلكتروني صالح' });
  }

  const code = generateCoupon();

  try {
    await transporter.sendMail({
      from: `"${process.env.GMAIL_FROM_NAME}" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: 'كوبون خصم 5% من Udream!',
      html: `
        <div dir="rtl" style="font-family: 'Cairo', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 2rem; background: #f8fafc; border-radius: 16px;">
          <div style="text-align: center; margin-bottom: 1.5rem;">
            <h1 style="color: #0d9669; margin: 0;">Udream</h1>
            <p style="color: #4b5563; margin: 0.5rem 0 0;">متجر إكسسوارات الإلكترونيات</p>
          </div>
          <div style="background: white; padding: 1.5rem; border-radius: 12px; border: 2px dashed #0d9669; text-align: center;">
            <p style="font-size: 1.1rem; color: #1a1a1a; margin: 0 0 0.5rem;">كوبون خصم 5%</p>
            <p style="font-size: 1.8rem; font-weight: 800; color: #0d9669; margin: 0; letter-spacing: 2px;">${code}</p>
          </div>
          <p style="text-align: center; color: #4b5563; font-size: 0.9rem; margin-top: 1.5rem;">
            استخدم هذا الكوبون عند الشراء للحصول على خصم 5% على طلبك!
          </p>
          <p style="text-align: center; color: #9ca3af; font-size: 0.8rem; margin-top: 1rem;">
            شكرا لتسجيلك في Udream
          </p>
        </div>
      `
    });

    res.json({ success: true, message: 'تم إرسال كوبون الخصم إلى بريدك الإلكتروني!', code });
  } catch (err) {
    console.error('Email error:', err);
    res.json({ success: false, error: 'حدث خطأ في إرسال البريد، حاول مرة أخرى' });
  }
});

// Store generated coupons in memory
const generatedCoupons = new Set();

// Track coupon when generated
const originalGenerateCoupon = generateCoupon;

// Override coupon endpoint to track codes
app.post('/api/coupon/validate', (req, res) => {
  const { code } = req.body;
  if (!code) {
    return res.json({ valid: false, error: 'أدخل كود الكوبون' });
  }

  // Accept any code starting with UDREAM5-
  if (/^UDREAM5-[A-Z0-9]{6}$/i.test(code)) {
    return res.json({ valid: true, discount: 5, message: 'تم تطبيق خصم 5% بنجاح!' });
  }

  res.json({ valid: false, error: 'كود الكوبون غير صالح' });
});

app.post('/api/coupon/use', (req, res) => {
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════
// Private admin dashboard API (shared data between partners)
// ═══════════════════════════════════════════════════════════
const ADMIN_DATA_FILE  = path.join(__dirname, 'admin-data.json');
const ADMIN_VIEWS_FILE = path.join(__dirname, 'admin-views.json');
const ADMIN_PASS_FILE  = path.join(__dirname, 'admin-pass.json');

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function getStoredPassHash() {
  try {
    return JSON.parse(fs.readFileSync(ADMIN_PASS_FILE, 'utf8')).hash;
  } catch {
    // Default password on first run: udream2026
    return sha256('udream2026');
  }
}

function setStoredPassHash(hash) {
  fs.writeFileSync(ADMIN_PASS_FILE, JSON.stringify({ hash }, null, 2));
}

function defaultAdminData() {
  return {
    transactions: [],  // {id, type, category, amount, note, date}
    goals: [],
    ideas: [],
    campaigns: [],
    budgets: {         // monthly budget per category (SAR)
      marketing: 0,
      stock: 0,
      shipping: 0,
      ads: 0,
      other: 0,
    },
  };
}

function loadAdminData() {
  try {
    const raw = JSON.parse(fs.readFileSync(ADMIN_DATA_FILE, 'utf8'));
    return { ...defaultAdminData(), ...raw, budgets: { ...defaultAdminData().budgets, ...(raw.budgets || {}) } };
  } catch {
    return defaultAdminData();
  }
}

function saveAdminData(data) {
  fs.writeFileSync(ADMIN_DATA_FILE, JSON.stringify(data, null, 2));
}

// In-memory valid tokens (resets on server restart — fine for 2-user use)
const validTokens = new Set();

function requireAdminAuth(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token || !validTokens.has(token)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

// Login
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'password required' });
  if (sha256(password) !== getStoredPassHash()) {
    return res.status(401).json({ error: 'wrong password' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  validTokens.add(token);
  res.json({ token });
});

// Logout
app.post('/api/admin/logout', requireAdminAuth, (req, res) => {
  validTokens.delete(req.headers['x-admin-token']);
  res.json({ success: true });
});

// Change password
app.post('/api/admin/change-password', requireAdminAuth, (req, res) => {
  const { current, next } = req.body || {};
  if (!current || !next) return res.status(400).json({ error: 'missing fields' });
  if (sha256(current) !== getStoredPassHash()) {
    return res.status(401).json({ error: 'wrong current password' });
  }
  if (next.length < 6) return res.status(400).json({ error: 'password too short' });
  setStoredPassHash(sha256(next));
  res.json({ success: true });
});

// Load admin data
app.get('/api/admin/data', requireAdminAuth, (req, res) => {
  res.json(loadAdminData());
});

// Save admin data
app.post('/api/admin/data', requireAdminAuth, (req, res) => {
  try {
    saveAdminData(req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Public: track a page view (called from index.html)
app.post('/api/track-view', (req, res) => {
  try {
    let views = {};
    try { views = JSON.parse(fs.readFileSync(ADMIN_VIEWS_FILE, 'utf8')); } catch {}
    const today = new Date().toISOString().slice(0, 10);
    views[today] = (views[today] || 0) + 1;
    // keep only last 90 days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    Object.keys(views).forEach(k => { if (k < cutoffStr) delete views[k]; });
    fs.writeFileSync(ADMIN_VIEWS_FILE, JSON.stringify(views));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Private: fetch views
app.get('/api/admin/views', requireAdminAuth, (req, res) => {
  try {
    res.json(JSON.parse(fs.readFileSync(ADMIN_VIEWS_FILE, 'utf8')));
  } catch {
    res.json({});
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Udream server running on http://localhost:${PORT}`);
  console.log(`Admin dashboard: http://localhost:${PORT}/udream-admin-8f2k.html`);
});
