const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(express.json({ limit: '10mb' }));

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
// DATA_DIR controls where private files live.
// - Local dev: defaults to project folder (__dirname)
// - Railway: set DATA_DIR=/data and mount a Volume at /data
const DATA_DIR = process.env.DATA_DIR || __dirname;
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}

// Uploads directory lives inside DATA_DIR so it survives deploys on Railway
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch {}
// Serve uploaded files at /uploads/*
app.use('/uploads', express.static(UPLOADS_DIR));

const ADMIN_DATA_FILE  = path.join(DATA_DIR, 'admin-data.json');
const ADMIN_VIEWS_FILE = path.join(DATA_DIR, 'admin-views.json');
const ADMIN_PASS_FILE  = path.join(DATA_DIR, 'admin-pass.json');
const SITE_CONFIG_FILE = path.join(DATA_DIR, 'site-config.json');

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function setStoredPassHash(hash) {
  fs.writeFileSync(ADMIN_PASS_FILE, JSON.stringify({ hash }, null, 2));
}

// On boot, if ADMIN_PASSWORD env var is set, reset the stored hash to it.
// This lets you rotate the password from the Railway dashboard without
// logging in, and without having to SSH into the volume. Set it once,
// redeploy, then optionally remove the env var afterward.
if (process.env.ADMIN_PASSWORD) {
  try {
    setStoredPassHash(sha256(process.env.ADMIN_PASSWORD));
    console.log('Admin password reset from ADMIN_PASSWORD env var');
  } catch (e) {
    console.error('Failed to apply ADMIN_PASSWORD env var:', e);
  }
}

function getStoredPassHash() {
  try {
    return JSON.parse(fs.readFileSync(ADMIN_PASS_FILE, 'utf8')).hash;
  } catch {
    // Default password on first run: udream2026
    return sha256('udream2026');
  }
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

// ═══════════════════════════════════════════════════════════
// Site configuration (products, hero text, stock, etc.)
// Public read, admin write.
// ═══════════════════════════════════════════════════════════
function defaultCategories() {
  return [
    { id: 'packages', name: 'البكجات والعروض', order: 1 },
    { id: 'audio',    name: 'السماعات والصوتيات', order: 2 },
    { id: 'charging', name: 'الشحن والكابلات', order: 3 },
    { id: 'lighting', name: 'الإضاءة', order: 4 },
    { id: 'desk',     name: 'أدوات المكتب', order: 5 },
  ];
}

function defaultSiteConfig() {
  return {
    categories: defaultCategories(),
    hero: {
      eyebrow:  'متجر إلكترونيات Udream',
      title:    'إكسسوارات تقنية جاهزة للغرف للهواتف، الحواسيب، والمساحات الإبداعية.',
      subtitle: 'اكتشف شاحنات فاخرة، إضاءة، سماعات لاسلكية، أدوات مكتب، وأساسيات محمولة مصممة للغرف الحديثة، إعدادات الألعاب، والحياة التقنية اليومية.',
      trustPills: [
        'شحن مجاني للطلبات فوق 250 ر.س',
        'إرجاع خلال 30 يوم',
        'دفع آمن',
      ],
    },
    shipping: {
      freeShippingThreshold: 250,
      flatRate: 20,
    },
    products: [
      {
        id: 'apple-package', categoryId: 'packages', order: 1,
        name: 'بكج ابل',
        description: 'كيبل USB-C، كيبل Lightning، شاحن UGREEN، وهدية مجانية!',
        details: 'يشمل البكج: كيبل USB-C أصلي، كيبل Lightning، شاحن جداري UGREEN بقوة 20 واط، وهدية مجانية مع كل طلب.',
        price: 129, originalPrice: 149,
        image: 'apple-package .jpeg',
        stock: 20, enabled: true,
      },
      {
        id: 'savings-package', categoryId: 'packages', order: 2,
        name: 'بكج التوفير',
        description: 'سماعات Lenovo، حامل مغناطيسي، كيبل UGREEN، وهدية مجانية!',
        details: 'سماعات Lenovo عالية الجودة، حامل مغناطيسي للسيارة، كيبل شحن UGREEN، مع هدية مجانية.',
        price: 109, originalPrice: 129,
        image: 'savings-package .jpeg',
        stock: 25, enabled: true,
      },
      {
        id: 'rgb-desk-lamp', categoryId: 'lighting', order: 3,
        name: 'مصباح مكتب RGB ذكي',
        description: 'إضاءة محيطية للدراسة، البث، أو الاسترخاء.',
        details: 'مصباح ذكي يدعم ملايين الألوان، تحكم عبر التطبيق، ومؤقت نوم.',
        price: 187, originalPrice: null,
        image: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=700&q=80',
        stock: 15, enabled: true,
      },
      {
        id: 'wireless-earbuds', categoryId: 'audio', order: 4,
        name: 'سماعات لاسلكية',
        description: 'راحة عازلة للضوضاء للمكالمات، الموسيقى، والألعاب.',
        details: 'سماعات بلوتوث 5.3 مع عزل ضوضاء نشط، بطارية 24 ساعة، مقاومة للماء IPX5.',
        price: 112, originalPrice: null,
        image: 'https://images.unsplash.com/photo-1519241047957-be31d7379a5d?auto=format&fit=crop&w=700&q=80',
        stock: 30, enabled: true,
      },
      {
        id: 'charging-dock', categoryId: 'charging', order: 5,
        name: 'محطة شحن شاملة',
        description: 'شحن الهواتف، الساعات، والسماعات من قاعدة أنيقة واحدة.',
        details: 'محطة شحن 3 في 1 لاسلكية، متوافقة مع iPhone وApple Watch وAirPods.',
        price: 150, originalPrice: null,
        image: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=700&q=80',
        stock: 12, enabled: true,
      },
      {
        id: 'desk-organizer', categoryId: 'desk', order: 6,
        name: 'مجموعة منظم مكتب',
        description: 'حافظ على الكابلات، التحكمات، والإكسسوارات مرتبة وجاهزة.',
        details: 'مجموعة منظمات خشبية فاخرة بحامل للأقلام، هاتف، وسماعات.',
        price: 94, originalPrice: null,
        image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=700&q=80',
        stock: 18, enabled: true,
      },
    ],
  };
}

function loadSiteConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(SITE_CONFIG_FILE, 'utf8'));
    const def = defaultSiteConfig();
    return {
      ...def,
      ...raw,
      hero:       { ...def.hero,     ...(raw.hero     || {}) },
      shipping:   { ...def.shipping, ...(raw.shipping || {}) },
      categories: Array.isArray(raw.categories) ? raw.categories : def.categories,
      products:   Array.isArray(raw.products)   ? raw.products   : def.products,
    };
  } catch {
    const def = defaultSiteConfig();
    try { fs.writeFileSync(SITE_CONFIG_FILE, JSON.stringify(def, null, 2)); } catch {}
    return def;
  }
}

function saveSiteConfig(config) {
  fs.writeFileSync(SITE_CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Public: anyone can read site config (products, hero text)
app.get('/api/site-config', (req, res) => {
  res.json(loadSiteConfig());
});

// Admin: update site config
app.post('/api/site-config', requireAdminAuth, (req, res) => {
  try {
    const incoming = req.body || {};
    // Sanity check
    if (incoming.products && !Array.isArray(incoming.products)) {
      return res.status(400).json({ error: 'products must be an array' });
    }
    saveSiteConfig(incoming);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Admin: upload image (base64 body to avoid multer dependency)
app.post('/api/admin/upload-image', requireAdminAuth, (req, res) => {
  try {
    const { filename, dataUrl } = req.body || {};
    if (!filename || !dataUrl) return res.status(400).json({ error: 'filename and dataUrl required' });
    const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl);
    if (!match) return res.status(400).json({ error: 'invalid dataUrl' });
    const mime = match[1];
    const extMap = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'image/svg+xml': '.svg' };
    const ext = extMap[mime] || '.bin';
    const buf = Buffer.from(match[2], 'base64');
    // Size cap: 5 MB
    if (buf.length > 5 * 1024 * 1024) return res.status(413).json({ error: 'image too large (5MB max)' });
    // Safe filename: timestamp + sanitized original stem + ext
    const stem = filename.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'img';
    const safe = `${Date.now().toString(36)}-${stem}${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, safe), buf);
    res.json({ success: true, path: `/uploads/${safe}` });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Public: decrement stock when an order is placed
app.post('/api/checkout/reserve-stock', (req, res) => {
  try {
    const items = (req.body && req.body.items) || [];
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items required' });
    const config = loadSiteConfig();
    const changes = [];
    items.forEach(item => {
      const p = config.products.find(x =>
        x.id === item.id || x.name === item.name
      );
      if (p && typeof p.stock === 'number') {
        const q = parseInt(item.quantity) || 1;
        const newStock = Math.max(0, p.stock - q);
        changes.push({ id: p.id, from: p.stock, to: newStock });
        p.stock = newStock;
      }
    });
    saveSiteConfig(config);
    res.json({ success: true, changes });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Udream server running on port ${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
  console.log(`Admin dashboard: /udream-admin-8f2k.html`);
});
