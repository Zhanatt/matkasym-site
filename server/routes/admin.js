const router       = require('express').Router();
const path         = require('path');
const Product      = require('../models/Product');
const Brand        = require('../models/Brand');
const User         = require('../models/User');
const ChangeLog    = require('../models/ChangeLog');
const CategorySpec = require('../models/CategorySpec');
const Frontman     = require('../models/Frontman');
const cloudinary   = require('../lib/cloudinary');
const { protect, admin, editor, viewer } = require('../middleware/auth');

const FONTS_DIR = path.join(__dirname, '../fonts');

const TRACKED_FIELDS = [
  'name','fullName','sku','price','priceWholesale','priceDealer','priceCost',
  'inStock','stock','stockStatus','productStatus','description','dimensions',
  'category','set','color','isNew','developmentStage',
];

const FIELD_LABELS = {
  name: 'Название', fullName: 'Полное название', sku: 'SKU',
  price: 'Розничная цена', priceWholesale: 'Оптовая цена',
  priceDealer: 'Дилерская цена', priceCost: 'Себестоимость',
  inStock: 'В наличии', stock: 'Количество', stockStatus: 'Статус склада',
  productStatus: 'Статус продукта', description: 'Описание',
  dimensions: 'Габариты', category: 'Категория', set: 'Сет',
  color: 'Цвет', isNew: 'Новинка', developmentStage: 'Стадия разработки',
  specs: 'Характеристики',
};

// All admin routes require valid JWT + at least viewer role
router.use(protect, viewer);

// ── Dashboard stats ──────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const onlineThreshold = new Date(Date.now() - 3 * 60 * 1000);
    const adminRoles = ['owner', 'editor', 'viewer', 'banned'];
    const [products, outOfStock, brands, users, usersOnline, pending] = await Promise.all([
      Product.countDocuments(),
      Product.countDocuments({ inStock: false }),
      Brand.countDocuments(),
      User.countDocuments({ role: { $in: adminRoles } }),
      User.countDocuments({ role: { $in: adminRoles }, lastSeen: { $gte: onlineThreshold } }),
      User.countDocuments({ isPending: true }),
    ]);
    res.json({ products, outOfStock, brands, users, usersOnline, pending });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Products ─────────────────────────────────────

router.get('/products', async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', brand, set, category, inStock, productStatus, stockStatus } = req.query;
    const filter = {};
    if (search) filter.$or = [
      { name: new RegExp(search, 'i') },
      { fullName: new RegExp(search, 'i') },
      { sku: new RegExp(search, 'i') },
    ];
    if (brand)         filter.brand         = brand;
    if (set)           filter.set           = set;
    if (category)      filter.category      = category;
    if (inStock !== undefined) filter.inStock = inStock === 'true';
    if (productStatus) filter.productStatus = productStatus;
    if (stockStatus)   filter.stockStatus   = stockStatus;

    const [products, total] = await Promise.all([
      Product.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(Number(limit)),
      Product.countDocuments(filter),
    ]);
    res.json({ products, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/products/facets', async (req, res) => {
  try {
    const { brand, set, category, search } = req.query;
    const base = {};
    if (brand)    base.brand    = brand;
    if (set)      base.set      = set;
    if (category) base.category = category;
    if (search)   base.$or = [
      { name: new RegExp(search, 'i') },
      { fullName: new RegExp(search, 'i') },
      { sku: new RegExp(search, 'i') },
    ];
    const filterForSets = { ...base }; delete filterForSets.set;
    const filterForCats = { ...base }; delete filterForCats.category;
    const [sets, categories] = await Promise.all([
      Product.distinct('set', filterForSets),
      Product.distinct('category', filterForCats),
    ]);
    res.json({ sets: sets.filter(Boolean).sort(), categories: categories.filter(Boolean).sort() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/products/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Не найден' });
    res.json(product);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Editor+ required for mutations
router.post('/products',       editor, async (req, res) => {
  try { res.status(201).json(await Product.create(req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.patch('/products/:id',  editor, async (req, res) => {
  try {
    const old = await Product.findById(req.params.id);
    if (!old) return res.status(404).json({ error: 'Не найден' });

    // Detect changed fields
    const changes = [];
    for (const field of TRACKED_FIELDS) {
      if (req.body[field] !== undefined && String(old[field]) !== String(req.body[field])) {
        changes.push({ field: FIELD_LABELS[field] || field, from: old[field], to: req.body[field] });
      }
    }
    if (req.body.specs !== undefined && JSON.stringify(old.specs) !== JSON.stringify(req.body.specs)) {
      changes.push({ field: FIELD_LABELS.specs, from: old.specs, to: req.body.specs });
    }
    if (req.body.images !== undefined && JSON.stringify(old.images) !== JSON.stringify(req.body.images)) {
      changes.push({ field: 'Фото', from: old.images || [], to: req.body.images || [] });
    }

    const p = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });

    if (changes.length > 0) {
      await ChangeLog.create({
        productId:   p._id,
        productName: p.fullName || p.name,
        changedBy:   { id: req.user._id, name: req.user.name, email: req.user.email },
        changes,
      });
    }

    res.json(p);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/products/:id', editor, async (req, res) => {
  try { await Product.findByIdAndDelete(req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Cloudinary ───────────────────────────────────
router.delete('/images', editor, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || !url.includes('cloudinary.com'))
      return res.status(400).json({ error: 'Не Cloudinary URL' });
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(\.[^.]+)?$/);
    if (!match) return res.status(400).json({ error: 'Не удалось извлечь public_id' });
    res.json({ ok: true, result: await cloudinary.uploader.destroy(match[1]) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Brands ───────────────────────────────────────
router.get('/brands', async (req, res) => {
  try { res.json(await Brand.find().sort('order')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/brands/:key', editor, async (req, res) => {
  try {
    const brand = await Brand.findOneAndUpdate({ key: req.params.key }, req.body, { new: true, runValidators: true });
    if (!brand) return res.status(404).json({ error: 'Не найден' });
    res.json(brand);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Changelog (admin only) ───────────────────────
router.get('/changelog', admin, async (req, res) => {
  try {
    const { productId, userId, limit = 100, page = 1 } = req.query;
    const filter = {};
    if (productId) filter.productId = productId;
    if (userId)    filter['changedBy.id'] = userId;
    const logs = await ChangeLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    const total = await ChangeLog.countDocuments(filter);
    res.json({ logs, total });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Users (admin+ only) ──────────────────────────
router.get('/users', viewer, async (req, res) => {
  try {
    res.json(await User.find({}).select('-password -resetPasswordToken -resetPasswordExpires').sort({ createdAt: -1 }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/users/:id', admin, async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'Не найден' });
    // Nobody can change owner's role
    if (target.role === 'owner')
      return res.status(403).json({ error: 'Нельзя изменить роль владельца' });
    // Only owner can assign owner role
    if (req.body.role === 'owner' && req.user.role !== 'owner')
      return res.status(403).json({ error: 'Только владелец может назначить другого владельца' });
    const { role, isPending } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { ...(role !== undefined && { role }), ...(isPending !== undefined && { isPending }) },
      { new: true }
    ).select('-password');
    res.json(user);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/users/:id', admin, async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString())
      return res.status(400).json({ error: 'Нельзя удалить себя' });
    const target = await User.findById(req.params.id);
    if (target?.role === 'owner')
      return res.status(403).json({ error: 'Нельзя удалить владельца' });
    await User.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Custom categories (user-created) ─────────────────────────────────────

// GET /api/admin/custom-categories — list user-created categories
router.get('/custom-categories', async (req, res) => {
  try {
    const specs = await CategorySpec.find({ label: { $ne: '' } }, 'category label').lean();
    res.json(specs.map(s => ({ value: s.category, label: s.label })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/custom-categories — create a new category
router.post('/custom-categories', protect, editor, async (req, res) => {
  try {
    const { value, label } = req.body;
    if (!value || !label) return res.status(400).json({ error: 'value and label required' });
    await CategorySpec.findOneAndUpdate(
      { category: value },
      { $set: { label } },
      { upsert: true }
    );
    res.json({ value, label });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Category custom specs ──────────────────────────────────────────────────

// GET /api/admin/category-specs/:category — get custom specs for a category
router.get('/category-specs/:category', protect, viewer, async (req, res) => {
  try {
    const doc = await CategorySpec.findOne({ category: req.params.category });
    res.json(doc?.customSpecs || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/category-specs/:category — add or update a custom spec
router.post('/category-specs/:category', protect, editor, async (req, res) => {
  try {
    const { key, type, options } = req.body;
    if (!key) return res.status(400).json({ error: 'key required' });

    const doc = await CategorySpec.findOneAndUpdate(
      { category: req.params.category },
      { $pull: { customSpecs: { key } } },
      { new: true, upsert: true }
    );
    doc.customSpecs.push({ key, type: type || 'text', options: options || [] });
    await doc.save();
    res.json(doc.customSpecs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/admin/category-specs/:category/:key — remove a custom spec
router.delete('/category-specs/:category/:key', protect, editor, async (req, res) => {
  try {
    const doc = await CategorySpec.findOneAndUpdate(
      { category: req.params.category },
      { $pull: { customSpecs: { key: req.params.key } } },
      { new: true }
    );
    res.json(doc?.customSpecs || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Frontmen ──────────────────────────────────────────────────────────────────

// GET /api/admin/frontmen?brand=xxx
router.get('/frontmen', protect, viewer, async (req, res) => {
  try {
    const q = req.query.brand ? { brand: req.query.brand } : {};
    const list = await Frontman.find(q).sort({ order: 1, createdAt: 1 });
    res.json(list);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/frontmen
router.post('/frontmen', protect, editor, async (req, res) => {
  try {
    const fm = await Frontman.create(req.body);
    res.status(201).json(fm);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// PATCH /api/admin/frontmen/:id
router.patch('/frontmen/:id', protect, editor, async (req, res) => {
  try {
    const fm = await Frontman.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!fm) return res.status(404).json({ error: 'Не найден' });
    res.json(fm);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// DELETE /api/admin/frontmen/:id
router.delete('/frontmen/:id', protect, editor, async (req, res) => {
  try {
    await Frontman.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Catalog PDF (server-side, Cyrillic support) ───────────────────────────────
// POST /api/admin/pdf/catalog
router.post('/pdf/catalog', protect, viewer, async (req, res) => {
  try {
    const PDFDocument = require('pdfkit');
    const { products, priceMode, setTitle, brandLabel, accent } = req.body;

    const fontReg  = path.join(FONTS_DIR, 'Roboto-Regular.ttf');
    const fontBold = path.join(FONTS_DIR, 'Roboto-Bold.ttf');
    const fontMed  = path.join(FONTS_DIR, 'Roboto-Medium.ttf');

    const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `${brandLabel} · ${setTitle}` } });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(brandLabel)}_${encodeURIComponent(setTitle)}.pdf"`);
    doc.pipe(res);

    // Parse accent hex → r,g,b
    const hex = (accent || '#333333').replace('#', '');
    const aR = parseInt(hex.substring(0,2),16), aG = parseInt(hex.substring(2,4),16), aB = parseInt(hex.substring(4,6),16);

    const PAGE_W = 595.28, PAGE_H = 841.89;
    const MARGIN = 30;
    const COL_W  = PAGE_W - MARGIN * 2;

    // ── Header bar ──
    doc.rect(0, 0, PAGE_W, 46).fill([aR, aG, aB]);
    doc.font(fontBold).fontSize(15).fillColor('white')
       .text(`${brandLabel} · ${setTitle}`, MARGIN, 16, { lineBreak: false });
    if (priceMode !== 'none') {
      const modeLabel = { retail:'Розничные цены', wholesale:'Оптовые цены', dealer:'Дилерские цены' }[priceMode] || '';
      doc.font(fontReg).fontSize(9).fillColor('rgba(255,255,255,0.85)')
         .text(modeLabel, 0, 18, { width: PAGE_W - MARGIN, align: 'right', lineBreak: false });
    }

    // ── Column headers ──
    const COL = buildCols(priceMode, COL_W);
    let y = 60;
    doc.rect(MARGIN, y, COL_W, 22).fill([aR, aG, aB]);
    doc.fillColor('white').font(fontMed).fontSize(8);
    drawRow(doc, MARGIN, y + 7, COL, ['#', 'Название', 'SKU', 'Характеристики', ...(priceMode !== 'none' ? ['Цена'] : []), 'Наличие']);
    y += 22;

    // ── Rows ──
    let rowIdx = 0;
    for (const p of products) {
      const price = getPrice(p, priceMode);
      const specs = (p.specs || []).slice(0, 4).map(s => `${s.key}: ${s.value}`).join('\n');
      const stock = p.stock > 0 ? `${p.stock} шт.` : (p.inStock ? 'Есть' : 'Нет');
      const cells = [
        String(rowIdx + 1),
        p.fullName || p.name || '—',
        p.sku || '—',
        specs || '—',
        ...(priceMode !== 'none' ? [price > 0 ? `${price.toLocaleString('ru')} сом` : '—'] : []),
        stock,
      ];

      // measure row height
      const rowH = measureRowHeight(doc, fontReg, COL, cells, 8, 5);

      if (y + rowH > PAGE_H - 30) {
        doc.addPage({ size: 'A4', margin: 0 });
        y = 30;
        // repeat header
        doc.rect(MARGIN, y, COL_W, 20).fill([aR, aG, aB]);
        doc.fillColor('white').font(fontMed).fontSize(8);
        drawRow(doc, MARGIN, y + 6, COL, ['#', 'Название', 'SKU', 'Характеристики', ...(priceMode !== 'none' ? ['Цена'] : []), 'Наличие']);
        y += 20;
      }

      const bg = rowIdx % 2 === 0 ? [255,255,255] : [248,249,252];
      doc.rect(MARGIN, y, COL_W, rowH).fill(bg);

      // subtle border
      doc.rect(MARGIN, y, COL_W, rowH).stroke([220,220,228]);

      doc.fillColor([30,30,30]).font(fontReg).fontSize(8);
      drawRow(doc, MARGIN, y + 5, COL, cells);

      y += rowH;
      rowIdx++;
    }

    // ── Footer ──
    doc.font(fontReg).fontSize(7).fillColor([180,180,180])
       .text(`MATKASYM · ${brandLabel} · ${setTitle}`, MARGIN, PAGE_H - 20, { width: COL_W, align: 'center' });

    doc.end();
  } catch (e) {
    console.error('PDF error:', e);
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

function buildCols(priceMode, totalW) {
  // [key, width, align]
  const base = [
    { w: 18,  align: 'center' },  // #
    { w: 130, align: 'left'   },  // Название
    { w: 65,  align: 'left'   },  // SKU
  ];
  if (priceMode !== 'none') {
    base.push({ w: totalW - 18 - 130 - 65 - 55 - 38, align: 'left'  }); // specs
    base.push({ w: 55, align: 'right'  }); // price
  } else {
    base.push({ w: totalW - 18 - 130 - 65 - 38, align: 'left' }); // specs
  }
  base.push({ w: 38, align: 'center' }); // наличие
  return base;
}

function drawRow(doc, startX, y, cols, cells) {
  let x = startX + 4;
  for (let i = 0; i < cols.length; i++) {
    const col  = cols[i];
    const text = String(cells[i] || '');
    doc.text(text, x, y, { width: col.w - 6, align: col.align, lineBreak: false, ellipsis: true });
    x += col.w;
  }
}

function measureRowHeight(doc, font, cols, cells, fontSize, padding) {
  doc.font(font).fontSize(fontSize);
  let maxH = 0;
  for (let i = 0; i < cols.length; i++) {
    const h = doc.heightOfString(String(cells[i] || ''), { width: cols[i].w - 6 });
    if (h > maxH) maxH = h;
  }
  return Math.max(maxH + padding * 2, 20);
}

function getPrice(p, mode) {
  if (mode === 'retail')    return p.price;
  if (mode === 'wholesale') return p.priceWholesale;
  if (mode === 'dealer')    return p.priceDealer;
  return null;
}

module.exports = router;
