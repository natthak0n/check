const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const { getDb, queryOne, queryAll, run } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting for report submission
const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: { error: 'รายงานได้สูงสุด 10 ครั้งต่อชั่วโมง' }
});

const scamTypeLabels = {
  call_center: 'แก๊งคอลเซ็นเตอร์',
  investment: 'หลอกลงทุน',
  romance: 'แก๊งหัวใจ / โรแมนซ์สแกม',
  parcel: 'พัสดุ/ภาษีหลอกลวง',
  loan: 'สินเชื่อปลอม',
  impersonation: 'แอบอ้างเป็นเจ้าหน้าที่',
  prize: 'หลอกว่าถูกรางวัล',
  other: 'ประเภทอื่นๆ',
  unknown: 'ไม่ระบุประเภท',
};

function formatPhone(phone) {
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');
  // Format as XXX-XXX-XXXX or 0XX-XXX-XXXX
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return digits;
}

function cleanPhone(phone) {
  return phone.replace(/\D/g, '').slice(0, 10);
}

// ─── HOMEPAGE ────────────────────────────────────────────────────────────────
app.get('/', async (req, res) => {
  await getDb();
  const stats = queryOne('SELECT COUNT(*) as total, SUM(report_count) as reports FROM phones');
  const recent = queryAll('SELECT phone, scam_type, report_count FROM phones ORDER BY last_reported DESC LIMIT 10');
  const topScam = queryAll('SELECT phone, scam_type, report_count FROM phones ORDER BY report_count DESC LIMIT 5');
  res.render('index', {
    stats,
    recent,
    topScam,
    scamTypeLabels,
    formatPhone,
  });
});

// ─── SEARCH API ──────────────────────────────────────────────────────────────
app.get('/api/search', async (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.json({ found: false });
  const clean = cleanPhone(phone);
  await getDb();
  const result = queryOne('SELECT * FROM phones WHERE phone = ?', [clean]);
  if (result) {
    res.json({ found: true, phone: clean, url: `/${clean}` });
  } else {
    res.json({ found: false, phone: clean, url: `/${clean}` });
  }
});

// ─── REPORT API ──────────────────────────────────────────────────────────────
app.post('/api/report', reportLimiter, async (req, res) => {
  let { phone, scam_type, description } = req.body;
  if (!phone || !scam_type) {
    return res.status(400).json({ error: 'กรุณาระบุเบอร์โทรและประเภทการหลอกลวง' });
  }
  const clean = cleanPhone(phone);
  if (clean.length < 9) {
    return res.status(400).json({ error: 'เบอร์โทรไม่ถูกต้อง' });
  }
  await getDb();
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const existing = queryOne('SELECT * FROM phones WHERE phone = ?', [clean]);
  if (existing) {
    run('UPDATE phones SET report_count = report_count + 1, last_reported = CURRENT_TIMESTAMP WHERE phone = ?', [clean]);
  } else {
    run('INSERT INTO phones (phone, scam_type, description) VALUES (?, ?, ?)', [clean, scam_type, description || '']);
  }
  run('INSERT INTO reports (phone, scam_type, description, reporter_ip) VALUES (?, ?, ?, ?)',
    [clean, scam_type, description || '', ip]);
  res.json({ success: true, url: `/${clean}` });
});

// ─── STATS PAGE ──────────────────────────────────────────────────────────────
app.get('/stats', async (req, res) => {
  await getDb();
  const stats = queryOne('SELECT COUNT(*) as total, SUM(report_count) as reports FROM phones');
  const byType = queryAll(`SELECT scam_type, COUNT(*) as count, SUM(report_count) as total_reports 
    FROM phones GROUP BY scam_type ORDER BY total_reports DESC`);
  res.render('stats', { stats, byType, scamTypeLabels });
});

// ─── SITEMAP.XML for Google ───────────────────────────────────────────────────
app.get('/sitemap.xml', async (req, res) => {
  await getDb();
  const phones = queryAll('SELECT phone, last_reported FROM phones ORDER BY last_reported DESC');
  const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`;
  for (const p of phones) {
    xml += `
  <url>
    <loc>${baseUrl}/${p.phone}</loc>
    <lastmod>${new Date(p.last_reported).toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
  }
  xml += '\n</urlset>';
  res.type('application/xml').send(xml);
});

// ─── ROBOTS.TXT ──────────────────────────────────────────────────────────────
app.get('/robots.txt', (req, res) => {
  const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
  res.type('text/plain').send(`User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml`);
});

// ─── PHONE PAGE (SEO DYNAMIC) ─────────────────────────────────────────────────
app.get('/:phone', async (req, res, next) => {
  const raw = req.params.phone;
  // Only handle phone-like patterns
  if (!/^\d{9,12}$/.test(raw.replace(/[-\s]/g, ''))) return next();
  const clean = cleanPhone(raw);

  await getDb();
  let phone = queryOne('SELECT * FROM phones WHERE phone = ?', [clean]);
  const recentReports = queryAll(
    'SELECT scam_type, description, created_at FROM reports WHERE phone = ? ORDER BY created_at DESC LIMIT 20',
    [clean]
  );
  // If not in DB, still render the page (allows reporting)
  res.render('phone', {
    phone,
    phoneNumber: clean,
    formatted: formatPhone(clean),
    recentReports,
    scamTypeLabels,
    isScam: !!phone,
  });
});

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).render('404'));

// ─── START ────────────────────────────────────────────────────────────────────
(async () => {
  await getDb();
  app.listen(PORT, () => {
    console.log(`✅ Scam Checker running at http://localhost:${PORT}`);
  });
})();
