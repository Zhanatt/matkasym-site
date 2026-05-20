const router       = require('express').Router();
const path         = require('path');
const fs           = require('fs');
const Product      = require('../models/Product');
const Brand        = require('../models/Brand');
const User         = require('../models/User');
const ChangeLog    = require('../models/ChangeLog');
const StockLog     = require('../models/StockLog');
const PriceLog     = require('../models/PriceLog');
const ProductLog   = require('../models/ProductLog');
const CategorySpec = require('../models/CategorySpec');
const Frontman     = require('../models/Frontman');
const cloudinary   = require('../lib/cloudinary');
const { protect, admin, editor, viewer } = require('../middleware/auth');

const FONTS_DIR = path.join(__dirname, '../fonts');

// Upload a buffer to Cloudinary as a raw file, returns secure_url
function uploadRawBuffer(buffer, folder, filename) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'raw', public_id: filename, overwrite: true },
      (err, result) => err ? reject(err) : resolve(result.secure_url)
    );
    stream.end(buffer);
  });
}

const PRICE_FIELDS = { retail: 'price', wholesale: 'priceWholesale', dealer: 'priceDealer', cost: 'priceCost' };
const PRICE_FIELD_TO_TYPE = Object.fromEntries(Object.entries(PRICE_FIELDS).map(([t, f]) => [f, t]));

const TRACKED_FIELDS = [
  'name','fullName','sku','price','priceWholesale','priceDealer','priceCost',
  'inStock','stock','stockStatus','productStatus','description','dimensions',
  'category','set','color','isNew','developmentStage',
  'developmentTZ','improvementTZ',
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

    const [products, outOfStock, brands, users, usersOnline, pending, liquidation, illiquid, frontmen] = await Promise.all([
      Product.countDocuments(),
      Product.countDocuments({ inStock: false }),
      Brand.countDocuments(),
      User.countDocuments({ role: { $in: adminRoles } }),
      User.countDocuments({ role: { $in: adminRoles }, lastSeen: { $gte: onlineThreshold } }),
      User.countDocuments({ isPending: true }),
      Product.countDocuments({ productStatus: 'liquidation' }),
      Product.countDocuments({ category: 'Неликвид' }),
      Frontman.countDocuments(),
    ]);
    res.json({ products, outOfStock, brands, users, usersOnline, pending, liquidation, illiquid, frontmen });
  } catch (e) {
    res.status(500).json({ error: mongoErr(e) });
  }
});

// ── Products ─────────────────────────────────────

router.get('/products', async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', brand, set, category, inStock, productStatus, stockStatus, sort } = req.query;
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

    const sortMap = { stock_desc: { stock: -1, createdAt: -1 }, stock_asc: { stock: 1, createdAt: -1 }, newest: { createdAt: -1 } };
    const sortObj = sortMap[sort] || { stock: -1, createdAt: -1 };

    const [products, total] = await Promise.all([
      Product.find(filter).sort(sortObj).skip((page - 1) * limit).limit(Number(limit)),
      Product.countDocuments(filter),
    ]);
    res.json({ products, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (e) {
    res.status(500).json({ error: mongoErr(e) });
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
    res.status(500).json({ error: mongoErr(e) });
  }
});

router.get('/products/:id', async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Неверный идентификатор товара' });
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Товар не найден' });
    res.json(product);
  } catch (e) {
    res.status(500).json({ error: mongoErr(e) });
  }
});

// Editor+ required for mutations
router.post('/products', editor, async (req, res) => {
  try {
    const p = await Product.create(req.body);
    await ProductLog.create({
      action: 'added',
      productId: p._id,
      productName: p.fullName || p.name,
      sku: p.sku || '',
      brand: p.brand || '',
      source: 'manual',
      changedBy: req.user ? { id: req.user._id, name: req.user.name, email: req.user.email } : {},
    });
    res.status(201).json(p);
  } catch (e) { res.status(400).json({ error: mongoErr(e) }); }
});

router.patch('/products/:id', editor, async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Неверный идентификатор товара' });
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

      const stockChange = changes.find(c => c.field === (FIELD_LABELS.stock || 'Количество'));
      if (stockChange) {
        const fromStock = Number(stockChange.from) || 0;
        const toStock   = Number(stockChange.to)   || 0;
        await StockLog.create({
          productId:   p._id,
          productName: p.fullName || p.name,
          sku:         p.sku || '',
          delta:       toStock - fromStock,
          fromStock,
          toStock,
          source:      'manual',
          changedBy:   { id: req.user._id, name: req.user.name, email: req.user.email },
        });
      }

      const priceChanges = changes.filter(c => {
        const field = Object.keys(FIELD_LABELS).find(k => FIELD_LABELS[k] === c.field);
        return field && PRICE_FIELD_TO_TYPE[field];
      });
      if (priceChanges.length > 0) {
        const priceLogs = priceChanges.map(c => {
          const field = Object.keys(FIELD_LABELS).find(k => FIELD_LABELS[k] === c.field);
          return {
            productId:   p._id,
            productName: p.fullName || p.name,
            sku:         p.sku || '',
            priceType:   PRICE_FIELD_TO_TYPE[field],
            fromPrice:   Number(c.from) || 0,
            toPrice:     Number(c.to)   || 0,
            source:      'manual',
            changedBy:   { id: req.user._id, name: req.user.name, email: req.user.email },
          };
        });
        await PriceLog.insertMany(priceLogs);
      }
    }

    res.json(p);
  } catch (e) { res.status(400).json({ error: mongoErr(e) }); }
});

router.delete('/products/:id', editor, async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Неверный идентификатор товара' });
  try {
    const p = await Product.findByIdAndDelete(req.params.id);
    if (p) {
      await ProductLog.create({
        action: 'deleted',
        productId: p._id,
        productName: p.fullName || p.name,
        sku: p.sku || '',
        brand: p.brand || '',
        source: 'manual',
        changedBy: req.user ? { id: req.user._id, name: req.user.name, email: req.user.email } : {},
      });
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: mongoErr(e) }); }
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
  } catch (e) { res.status(500).json({ error: mongoErr(e) }); }
});

// ── Brands ───────────────────────────────────────
router.get('/brands', async (req, res) => {
  try { res.json(await Brand.find().sort('order')); }
  catch (e) { res.status(500).json({ error: mongoErr(e) }); }
});

router.patch('/brands/:key', editor, async (req, res) => {
  try {
    const brand = await Brand.findOneAndUpdate({ key: req.params.key }, req.body, { new: true, runValidators: true });
    if (!brand) return res.status(404).json({ error: 'Не найден' });
    res.json(brand);
  } catch (e) { res.status(400).json({ error: mongoErr(e) }); }
});

// Add a custom set to a brand (upserts the brand document if missing)
router.post('/brands/:key/sets', editor, async (req, res) => {
  try {
    const { slug, label } = req.body;
    if (!slug || !label) return res.status(400).json({ error: 'slug и label обязательны' });
    const defaultLabel = req.params.key.replace('matkasym-', '').toUpperCase();
    const brand = await Brand.findOneAndUpdate(
      { key: req.params.key },
      { $push: { sets: { key: slug, label } }, $setOnInsert: { label: defaultLabel } },
      { new: true, upsert: true }
    );
    res.json(brand);
  } catch (e) { res.status(400).json({ error: mongoErr(e) }); }
});

// Remove a custom set from a brand
router.delete('/brands/:key/sets/:slug', editor, async (req, res) => {
  try {
    const brand = await Brand.findOneAndUpdate(
      { key: req.params.key },
      { $pull: { sets: { key: req.params.slug } } },
      { new: true }
    );
    if (!brand) return res.status(404).json({ error: 'Бренд не найден' });
    res.json(brand);
  } catch (e) { res.status(400).json({ error: mongoErr(e) }); }
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
  } catch (e) { res.status(500).json({ error: mongoErr(e) }); }
});

// ── Users (admin+ only) ──────────────────────────
router.get('/users', viewer, async (req, res) => {
  try {
    res.json(await User.find({}).select('-password -resetPasswordToken -resetPasswordExpires').sort({ createdAt: -1 }));
  } catch (e) { res.status(500).json({ error: mongoErr(e) }); }
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
  } catch (e) { res.status(500).json({ error: mongoErr(e) }); }
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
  } catch (e) { res.status(500).json({ error: mongoErr(e) }); }
});

// ── Custom categories (user-created) ─────────────────────────────────────

// GET /api/admin/custom-categories — list user-created categories
router.get('/custom-categories', async (req, res) => {
  try {
    const specs = await CategorySpec.find({ label: { $ne: '' } }, 'category label').lean();
    res.json(specs.map(s => ({ value: s.category, label: s.label })));
  } catch (e) { res.status(500).json({ error: mongoErr(e) }); }
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
  } catch (e) { res.status(500).json({ error: mongoErr(e) }); }
});

// ── Category custom specs ──────────────────────────────────────────────────

// GET /api/admin/category-specs/:category — get custom specs for a category
router.get('/category-specs/:category', protect, viewer, async (req, res) => {
  try {
    const doc = await CategorySpec.findOne({ category: req.params.category });
    res.json(doc?.customSpecs || []);
  } catch (e) { res.status(500).json({ error: mongoErr(e) }); }
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
  } catch (e) { res.status(500).json({ error: mongoErr(e) }); }
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
  } catch (e) { res.status(500).json({ error: mongoErr(e) }); }
});

// ── Frontmen ──────────────────────────────────────────────────────────────────

// GET /api/admin/frontmen?brand=xxx
router.get('/frontmen', protect, viewer, async (req, res) => {
  try {
    const q = req.query.brand ? { brand: req.query.brand } : {};
    const list = await Frontman.find(q).populate('userId', 'name email').sort({ order: 1, createdAt: 1 });
    res.json(list);
  } catch (e) { res.status(500).json({ error: mongoErr(e) }); }
});

// POST /api/admin/frontmen
router.post('/frontmen', protect, editor, async (req, res) => {
  try {
    const fm = await Frontman.create(req.body);
    res.status(201).json(fm);
  } catch (e) { res.status(400).json({ error: mongoErr(e) }); }
});

// PATCH /api/admin/frontmen/:id
router.patch('/frontmen/:id', protect, editor, async (req, res) => {
  try {
    const fm = await Frontman.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!fm) return res.status(404).json({ error: 'Не найден' });
    res.json(fm);
  } catch (e) { res.status(400).json({ error: mongoErr(e) }); }
});

// DELETE /api/admin/frontmen/:id
router.delete('/frontmen/:id', protect, editor, async (req, res) => {
  try {
    await Frontman.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: mongoErr(e) }); }
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
      const stock = p.inStock ? 'Есть' : 'Нет';
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
    if (!res.headersSent) res.status(500).json({ error: mongoErr(e) });
  }
});

// ── helpers ──────────────────────────────────────────────────────────────────
function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? require('https') : require('http');
    lib.get(url, (r) => {
      const chunks = [];
      r.on('data', c => chunks.push(c));
      r.on('end',  () => resolve(Buffer.concat(chunks)));
      r.on('error', reject);
    }).on('error', reject);
  });
}

// ── TZ PDF ───────────────────────────────────────────────────────────────────
// GET /api/admin/pdf/tz/:id/:type  (type = 'development' | 'improvement')
router.get('/pdf/tz/:id/:type', protect, viewer, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Не найден' });

    const type = req.params.type;
    if (type !== 'development' && type !== 'improvement')
      return res.status(400).json({ error: 'Неверный тип ТЗ' });

    const PDFDocument = require('pdfkit');
    const QRCode     = require('qrcode');
    const fontReg  = path.join(FONTS_DIR, 'Roboto-Regular.ttf');
    const fontBold = path.join(FONTS_DIR, 'Roboto-Bold.ttf');
    const fontMed  = path.join(FONTS_DIR, 'Roboto-Medium.ttf');
    const logoPath = path.join(__dirname, '../../client/public/logos/logo-main.png');

    const isdev    = type === 'development';
    const tzData   = isdev ? (product.developmentTZ || {}) : (product.improvementTZ || {});
    const title    = isdev ? 'ТЕХНИЧЕСКОЕ ЗАДАНИЕ' : 'УЛУЧШЕНИЕ ПРОДУКТА';
    const accent   = isdev ? [124, 58, 237] : [196, 122, 0];
    const statusLb = isdev ? 'В разработке' : 'На улучшении';
    const filename = `${isdev ? 'ТЗ_разработка' : 'ТЗ_улучшение'}_${(product.name || product._id).replace(/[^a-zA-Zа-яА-Я0-9]/g, '_')}.pdf`;

    // Pre-fetch: product image + QR + attached image files (parallel)
    const productImgUrl = (product.images || [])[0];
    const qrText = `matkasym-site — ${product.fullName || product.name} — ${product._id}`;

    const isImageUrl = (url) => /\.(jpe?g|png|webp|gif|bmp|tiff?)(\?|$)/i.test(url) || url.includes('cloudinary.com');

    const attachedFiles = tzData.files || [];
    const attachedImgUrls = attachedFiles.filter(f => isImageUrl(f.url));
    const attachedOtherFiles = attachedFiles.filter(f => !isImageUrl(f.url));

    const [imgBuf, qrBuf, ...attachedImgBufs] = await Promise.all([
      productImgUrl ? fetchBuffer(productImgUrl).catch(() => null) : Promise.resolve(null),
      QRCode.toBuffer(qrText, { errorCorrectionLevel: 'M', margin: 1, width: 80,
        color: { dark: '#546e7a', light: '#ffffff' } }).catch(() => null),
      ...attachedImgUrls.map(f => fetchBuffer(f.url).catch(() => null)),
    ]);

    const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: filename.replace('.pdf', '') } });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    doc.pipe(res);

    const PAGE_W = 595.28, PAGE_H = 841.89;
    const BX = 22, BY = 22;
    const BW = PAGE_W - BX * 2, BH = PAGE_H - BY * 2;
    const CX = BX + 20;
    const fullCW = BW - 40;
    const PHOTO_SIZE = 90;

    // Border
    doc.roundedRect(BX, BY, BW, BH, 14).strokeColor('#b0bec5').lineWidth(0.8).stroke();

    // Logo top-left
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, CX, BY + 14, { height: 26 });
    } else {
      doc.font(fontBold).fontSize(13).fillColor([225, 5, 35]).text('MATKASYM', CX, BY + 18);
    }

    // Header separator (full width — drawn BEFORE photo so photo is on top)
    doc.moveTo(BX + 1, BY + 52).lineTo(BX + BW - 1, BY + 52).strokeColor('#dde3ea').lineWidth(0.5).stroke();

    // Product photo top-right — drawn AFTER separator so it covers the line
    if (imgBuf) {
      const photoX = BX + BW - PHOTO_SIZE - 16;
      const photoY = BY + 8;
      try { doc.image(imgBuf, photoX, photoY, { fit: [PHOTO_SIZE, PHOTO_SIZE] }); } catch (_) {}
    }

    // Title block (text column narrowed to avoid photo)
    const CW = imgBuf ? fullCW - PHOTO_SIZE - 16 : fullCW;
    let y = BY + 68;
    doc.font(fontBold).fontSize(15).fillColor(accent).text(title, CX, y, { width: CW });
    y += 22;

    doc.font(fontBold).fontSize(12).fillColor('#111111')
      .text(product.fullName || product.name, CX, y, { width: CW });
    y += 18;

    const meta = [
      `Статус: ${statusLb}`,
      product.sku ? `SKU: ${product.sku}` : null,
      product.category ? `Категория: ${product.category}` : null,
      `Дата: ${new Date().toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: 'numeric' })}`,
    ].filter(Boolean).join('   ·   ');

    doc.font(fontReg).fontSize(8.5).fillColor('#607080').text(meta, CX, y, { width: CW });

    // Move y below the photo if it's taller than the text block
    const photoBottom = imgBuf ? (BY + 8 + PHOTO_SIZE + 10) : 0;
    y = Math.max(BY + 68 + 22 + 18 + 20, photoBottom);

    doc.moveTo(CX, y).lineTo(CX + fullCW, y).strokeColor('#dde3ea').lineWidth(0.5).stroke();
    y += 16;

    if (isdev && product.developmentStage) {
      doc.font(fontMed).fontSize(8.5).fillColor(accent)
        .text(`ЭТАП: ${product.developmentStage.toUpperCase()}`, CX, y, { width: fullCW });
      y += 18;
    }

    const drawSection = (label, text) => {
      doc.font(fontMed).fontSize(9).fillColor('#333333').text(label, CX, y, { width: fullCW });
      y += 14;
      const t = text || '—';
      doc.font(fontReg).fontSize(10).fillColor('#1a1a1a')
        .text(t, CX + 4, y, { width: fullCW - 4, lineGap: 2 });
      y += doc.heightOfString(t, { width: fullCW - 4, lineGap: 2 }) + 18;
    };

    if (isdev) {
      drawSection('ОПИСАНИЕ ТЕХНИЧЕСКОГО ЗАДАНИЯ:', tzData.description);
    } else {
      drawSection('В ЧЕМ ПРОБЛЕМА?', tzData.problem);
      drawSection('ВОЗМОЖНОЕ РЕШЕНИЕ:', tzData.solution);
    }

    // Attached files section
    if (attachedFiles.length > 0) {
      doc.moveTo(CX, y).lineTo(CX + fullCW, y).strokeColor('#dde3ea').lineWidth(0.5).stroke();
      y += 14;
      doc.font(fontMed).fontSize(9).fillColor('#333333').text('ПРИКРЕПЛЁННЫЕ ФАЙЛЫ:', CX, y);
      y += 16;

      // Non-image files — text list
      for (const f of attachedOtherFiles) {
        doc.font(fontReg).fontSize(9).fillColor('#3b5bdb')
          .text(`• ${f.name}`, CX + 8, y, { width: fullCW - 8, lineBreak: false, ellipsis: true });
        y += 13;
      }

      // Image files — rendered as thumbnails in a row
      if (attachedImgBufs.length > 0) {
        const THUMB = 110;
        const GAP   = 10;
        let imgX = CX + 8;
        let rowStartY = y + (attachedOtherFiles.length > 0 ? 8 : 0);

        for (let i = 0; i < attachedImgBufs.length; i++) {
          const buf = attachedImgBufs[i];
          if (!buf) continue;

          // New row if needed
          if (imgX + THUMB > CX + fullCW - 8) {
            imgX = CX + 8;
            rowStartY += THUMB + GAP + 14;
          }

          try {
            doc.image(buf, imgX, rowStartY, { fit: [THUMB, THUMB] });
            // filename caption
            doc.font(fontReg).fontSize(7).fillColor('#607080')
              .text(attachedImgUrls[i]?.name || '', imgX, rowStartY + THUMB + 2, { width: THUMB, align: 'center', lineBreak: false, ellipsis: true });
          } catch (_) {}

          imgX += THUMB + GAP;
        }
        y = rowStartY + THUMB + 20;
      }
    }

    // Footer: "20>27" + QR code bottom-right
    const QR_SIZE = 52;
    const footerY = PAGE_H - BY - QR_SIZE - 10;
    const footerX = PAGE_W - BX - QR_SIZE - 16;

    // QR code
    if (qrBuf) {
      try { doc.image(qrBuf, footerX, footerY + 6, { width: QR_SIZE, height: QR_SIZE }); } catch (_) {}
    }

    // "20>27" text above QR
    doc.font(fontBold).fontSize(16).fillColor('#90a4ae')
      .text('20', footerX, footerY - 22, { lineBreak: false });
    doc.fillColor([225, 5, 35]).text('›', footerX + 24, footerY - 23, { lineBreak: false });
    doc.fillColor('#1a1a1a').text('27', footerX + 34, footerY - 22, { lineBreak: false });

    doc.end();
  } catch (e) {
    console.error('TZ PDF error:', e);
    if (!res.headersSent) res.status(500).json({ error: mongoErr(e) });
  }
});

const mongoose = require('mongoose');
function isValidId(id) {
  return id && id !== 'undefined' && id !== 'null' && mongoose.Types.ObjectId.isValid(id);
}

function mongoErr(e) {
  const m = e.message || '';
  if (m.includes('Cast to ObjectId failed'))
    return 'Неверный идентификатор записи';
  if (m.includes('E11000') || m.includes('duplicate key'))
    return 'Запись с таким значением уже существует';
  if (/validation failed/i.test(m)) {
    const fields = Object.values(e.errors || {}).map(v => v.message).filter(Boolean);
    return fields.length ? `Ошибка заполнения: ${fields.join('; ')}` : 'Ошибка валидации данных';
  }
  if (m.includes('required'))
    return 'Не заполнено обязательное поле';
  if (m.includes('ENOENT') || m.includes('EACCES'))
    return 'Ошибка доступа к файлу на сервере';
  return 'Внутренняя ошибка сервера';
}

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

// ── UPLOAD STOCK EXCEL FROM ADMIN PANEL ─────────────────────────────────────
const multer = require('multer');
const xlsx   = require('xlsx');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function normName(s = '') {
  return s.toLowerCase().replace(/[«»"""''`]/g, '').replace(/\s+/g, ' ').trim();
}
function toInt(v) {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : Math.max(0, Math.floor(n));
}

// POST /api/admin/upload-stock  (multipart: field "file")
router.post('/upload-stock', editor, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

  try {
    const wb   = xlsx.read(req.file.buffer, { type: 'buffer' });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // Auto-detect: scan rows 5-10 for warehouse headers, then find sub-header row
    let colOsn = 4, colKomm = 19, dataStart = 7;
    for (let ri = 5; ri <= 10; ri++) {
      const hr = rows[ri] || [];
      for (let c = 0; c < hr.length; c++) {
        const cell = String(hr[c] || '').toLowerCase();
        if (cell.includes('основной'))     colOsn  = c;
        if (cell.includes('коммерческий')) colKomm = c;
      }
    }
    for (let ri = 6; ri <= 12; ri++) {
      if (String((rows[ri] || [])[colOsn] || '').toLowerCase().includes('остаток')) {
        dataStart = ri + 1;
        break;
      }
    }

    const stockMap = new Map();
    for (let i = dataStart; i < rows.length; i++) {
      const row  = rows[i];
      const name = String(row[0] || '').trim();
      if (!name) continue;

      const osnNum  = toInt(row[colOsn]);
      const kommRaw = Number(row[colKomm]);
      const kommNum = (!isNaN(kommRaw) && Number.isInteger(kommRaw)) ? Math.max(0, kommRaw) : 0;
      stockMap.set(normName(name), osnNum + kommNum);
    }

    const products = await Product.find({}, '_id fullName name sku category price priceWholesale stock');
    let matched = 0, zeroed = 0;
    const notFoundRows = [];
    const stockLogDocs = [];
    const ops = products.map(p => {
      const key      = normName(p.fullName || p.name || '');
      const newStock = stockMap.has(key) ? stockMap.get(key) : 0;
      const inStock  = newStock > 0;
      const oldStock = p.stock || 0;
      if (stockMap.has(key)) {
        matched++;
      } else {
        zeroed++;
        notFoundRows.push({
          'Название':    p.fullName || p.name || '',
          'Артикул':     p.sku || '',
          'Категория':   p.category || '',
          'Цена розн.':  p.price || 0,
          'Цена опт.':   p.priceWholesale || 0,
        });
      }
      if (newStock !== oldStock) {
        stockLogDocs.push({
          productId:   p._id,
          productName: p.fullName || p.name || '',
          sku:         p.sku || '',
          delta:       newStock - oldStock,
          fromStock:   oldStock,
          toStock:     newStock,
          source:      'excel',
          changedBy:   req.user ? { id: req.user._id, name: req.user.name, email: req.user.email } : {},
        });
      }
      return { updateOne: { filter: { _id: p._id }, update: { $set: { stock: newStock, inStock, stockStatus: inStock ? 'in_stock' : 'out_of_stock' } } } };
    });
    if (ops.length) await Product.bulkWrite(ops, { ordered: false });

    // Upload Excel to Cloudinary for source link, then save logs
    let excelSourceUrl = '';
    try {
      const ts = Date.now();
      excelSourceUrl = await uploadRawBuffer(req.file.buffer, 'matkasym/stock-uploads', `stock_${ts}`);
    } catch (_) {}
    if (stockLogDocs.length) {
      const docsWithUrl = stockLogDocs.map(d => ({ ...d, sourceUrl: excelSourceUrl }));
      await StockLog.insertMany(docsWithUrl, { ordered: false });
    }

    let excelBase64 = null;
    if (notFoundRows.length > 0) {
      const wb2 = xlsx.utils.book_new();
      const ws2 = xlsx.utils.json_to_sheet(notFoundRows);
      xlsx.utils.book_append_sheet(wb2, ws2, 'Пропущенные');
      excelBase64 = xlsx.write(wb2, { type: 'base64', bookType: 'xlsx' });
    }

    console.log(`[upload-stock] ${new Date().toISOString()} colOsn=${colOsn} colKomm=${colKomm} dataStart=${dataStart} matched=${matched} zeroed=${zeroed}`);
    res.json({ success: true, matched, zeroed, total: matched + zeroed, excelBase64 });
  } catch (e) {
    res.status(500).json({ error: 'Ошибка обработки файла: ' + e.message });
  }
});

// ── IMPORT NOMENCLATURE FROM 1С ─────────────────────────────────────────────
// POST /api/admin/import-nomenclature  (multipart: field "file")
router.post('/import-nomenclature', editor, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
  try {
    const wb   = xlsx.read(req.file.buffer, { type: 'buffer' });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // Same auto-detection as upload-stock
    let colOsn = 4, colKomm = 19, dataStart = 7;
    for (let ri = 5; ri <= 10; ri++) {
      const hr = rows[ri] || [];
      for (let c = 0; c < hr.length; c++) {
        const cell = String(hr[c] || '').toLowerCase();
        if (cell.includes('основной'))     colOsn  = c;
        if (cell.includes('коммерческий')) colKomm = c;
      }
    }
    for (let ri = 6; ri <= 12; ri++) {
      if (String((rows[ri] || [])[colOsn] || '').toLowerCase().includes('остаток')) {
        dataStart = ri + 1;
        break;
      }
    }

    // Build Excel name→stock map
    const excelMap = new Map();
    for (let i = dataStart; i < rows.length; i++) {
      const row  = rows[i];
      const name = String(row[0] || '').trim();
      if (!name) continue;
      const osn  = toInt(row[colOsn]);
      const kommRaw = Number(row[colKomm]);
      const komm = (!isNaN(kommRaw) && Number.isInteger(kommRaw)) ? Math.max(0, kommRaw) : 0;
      excelMap.set(normName(name), { originalName: name, stock: osn + komm });
    }

    // Build set of existing product normNames
    const existing = await Product.find({}, 'fullName name').lean();
    const existingSet = new Set(existing.map(p => normName(p.fullName || p.name || '')));

    // Find new nomenclatures
    const toAdd = [];
    for (const [normed, data] of excelMap) {
      if (!existingSet.has(normed)) {
        toAdd.push(data);
      }
    }

    if (toAdd.length === 0) {
      return res.json({ added: 0, skipped: excelMap.size, products: [] });
    }

    // Detect brand from name
    function detectBrand(name) {
      const n = name.toLowerCase();
      if (n.includes('shaar') || n.includes('шаар')) return 'matkasym-shaar';
      if (n.includes('kyzmat') || n.includes('кызмат')) return 'matkasym-kyzmat';
      return 'matkasym-home';
    }

    // Create new products
    const created = [];
    const logDocs = [];
    for (const item of toAdd) {
      const stock = item.stock;
      const inStock = stock > 0;
      const brand = detectBrand(item.originalName);
      try {
        const p = await Product.create({
          name:          item.originalName,
          fullName:      item.originalName,
          brand,
          price:         0,
          category:      'other',
          stock,
          inStock,
          stockStatus:   inStock ? 'in_stock' : 'out_of_stock',
          productStatus: 'for_sale',
        });
        created.push(p);
        logDocs.push({
          action:      'added',
          productId:   p._id,
          productName: p.fullName,
          sku:         '',
          brand,
          source:      'sync_1c',
          changedBy:   req.user ? { id: req.user._id, name: req.user.name, email: req.user.email } : {},
        });
      } catch (_) {}
    }

    if (logDocs.length) await ProductLog.insertMany(logDocs, { ordered: false });

    res.json({
      added:    created.length,
      skipped:  excelMap.size - created.length,
      products: created.map(p => p.fullName),
    });
  } catch (e) { res.status(500).json({ error: 'Ошибка обработки файла: ' + e.message }); }
});

// ── UPLOAD PRICE LIST ────────────────────────────────────────────────────────
// POST /api/admin/upload-prices?type=retail|wholesale|dealer|cost
router.post('/upload-prices', editor, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

  const type = req.query.type || 'retail';
  const fieldMap = { retail: 'price', wholesale: 'priceWholesale', dealer: 'priceDealer', cost: 'priceCost' };
  const field = fieldMap[type];
  if (!field) return res.status(400).json({ error: 'Неверный тип цены' });

  try {
    const wb   = xlsx.read(req.file.buffer, { type: 'buffer' });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // col 3 = name, col 32 = price, data from row 6
    const priceMap = new Map();
    for (let i = 6; i < rows.length; i++) {
      const row   = rows[i];
      const name  = String(row[3] || '').trim();
      const price = Number(row[32]);
      if (!name || isNaN(price) || price <= 0) continue;
      priceMap.set(normName(name), Math.round(price));
    }

    const products = await Product.find({}, `_id fullName name sku ${field}`);
    let matched = 0, skipped = 0;
    const ops = [];
    const priceLogDocs = [];
    for (const p of products) {
      const key      = normName(p.fullName || p.name || '');
      const newPrice = priceMap.get(key);
      if (newPrice === undefined) { skipped++; continue; }
      const oldPrice = Number(p[field]) || 0;
      ops.push({ updateOne: { filter: { _id: p._id }, update: { $set: { [field]: newPrice } } } });
      if (newPrice !== oldPrice) {
        priceLogDocs.push({
          productId:   p._id,
          productName: p.fullName || p.name || '',
          sku:         p.sku || '',
          priceType:   type,
          fromPrice:   oldPrice,
          toPrice:     newPrice,
          source:      'excel',
          changedBy:   req.user ? { id: req.user._id, name: req.user.name, email: req.user.email } : {},
        });
      }
      matched++;
    }
    if (ops.length) await Product.bulkWrite(ops, { ordered: false });

    // Upload Excel to Cloudinary and attach URL to log entries
    let sourceUrl = '';
    try {
      sourceUrl = await uploadRawBuffer(req.file.buffer, 'matkasym/price-uploads', `price_${type}_${Date.now()}`);
    } catch (_) {}
    if (priceLogDocs.length) {
      await PriceLog.insertMany(priceLogDocs.map(d => ({ ...d, sourceUrl })), { ordered: false });
    }

    console.log(`[upload-prices] type=${type} field=${field} matched=${matched} skipped=${skipped}`);
    res.json({ success: true, type, field, matched, skipped });
  } catch (e) {
    res.status(500).json({ error: 'Ошибка обработки файла: ' + e.message });
  }
});

// ── BULK PHOTO UPLOAD ────────────────────────────────────────────────────────
// POST /api/admin/upload-photos  (multipart: field "files", multiple images)
router.post('/upload-photos', editor, upload.array('files', 500), async (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Файлы не загружены' });

  try {
    const products = await Product.find({}, '_id name fullName sku images');

    const bySkuMap  = new Map();
    const byNameMap = new Map();
    for (const p of products) {
      if (p.sku) bySkuMap.set(p.sku.trim().toLowerCase(), p);
      const key = normName(p.fullName || p.name || '');
      if (key) byNameMap.set(key, p);
    }

    const uploadOne = (buf, mime, publicId) => new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'matkasym', public_id: publicId, overwrite: true, resource_type: 'image' },
        (err, r) => err ? reject(err) : resolve(r)
      );
      stream.end(buf);
    });

    let matched = 0;
    const notFoundRows = [];
    const ops = [];

    // Process in batches of 5 to avoid Cloudinary rate limits
    const BATCH = 5;
    for (let i = 0; i < req.files.length; i += BATCH) {
      const batch = req.files.slice(i, i + BATCH);
      await Promise.all(batch.map(async file => {
        const baseName = path.basename(file.originalname, path.extname(file.originalname)).trim();
        const product  = bySkuMap.get(baseName.toLowerCase()) || byNameMap.get(normName(baseName));

        if (!product) {
          notFoundRows.push({ 'Файл': file.originalname, 'Причина': 'Товар не найден в БД' });
          return;
        }

        try {
          const result = await uploadOne(file.buffer, file.mimetype, `product_${product._id}`);
          ops.push({ updateOne: { filter: { _id: product._id }, update: { $set: { images: [result.secure_url] } } } });
          matched++;
        } catch (e) {
          notFoundRows.push({ 'Файл': file.originalname, 'Причина': 'Ошибка Cloudinary: ' + e.message });
        }
      }));
    }

    if (ops.length) await Product.bulkWrite(ops, { ordered: false });

    let excelBase64 = null;
    if (notFoundRows.length > 0) {
      const wb2 = xlsx.utils.book_new();
      const ws2 = xlsx.utils.json_to_sheet(notFoundRows);
      xlsx.utils.book_append_sheet(wb2, ws2, 'Не найдены');
      excelBase64 = xlsx.write(wb2, { type: 'base64', bookType: 'xlsx' });
    }

    console.log(`[upload-photos] matched=${matched} notFound=${notFoundRows.length} total=${req.files.length}`);
    res.json({ success: true, matched, notFound: notFoundRows.length, total: req.files.length, excelBase64 });
  } catch (e) {
    res.status(500).json({ error: 'Ошибка: ' + e.message });
  }
});

// ── SYNC STOCK FROM 1C (PowerShell на wins1 отправляет сюда данные) ──────────
const SYNC_KEY = process.env.SYNC_API_KEY || 'matkasym-sync-2026';

function normName(s = '') {
  return s.toLowerCase().replace(/[«»"""''`]/g, '').replace(/\s+/g, ' ').trim();
}
function toInt(v) {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : Math.max(0, Math.floor(n));
}

// POST /api/admin/sync-stock
// Body: { apiKey?, stocks: [{name, osnovnoy, kommercheskiy}] }
// Header: x-api-key: <SYNC_KEY>
router.post('/sync-stock', async (req, res) => {
  const key = req.headers['x-api-key'] || req.body.apiKey;
  if (key !== SYNC_KEY) return res.status(401).json({ error: 'Неверный API ключ' });

  const { stocks } = req.body;
  if (!Array.isArray(stocks) || stocks.length === 0) {
    return res.status(400).json({ error: 'stocks должен быть непустым массивом' });
  }

  // Build map: norm(name) → stock
  const stockMap = new Map();
  for (const item of stocks) {
    const name = String(item.name || '').trim();
    if (!name) continue;
    const osnNum  = toInt(item.osnovnoy);
    const kommRaw = Number(item.kommercheskiy);
    const kommNum = (!isNaN(kommRaw) && Number.isInteger(kommRaw)) ? Math.max(0, kommRaw) : 0;
    stockMap.set(normName(name), osnNum + kommNum);
  }

  const products = await Product.find({});
  let matched = 0, zeroed = 0;
  const stockLogDocs = [];

  for (const p of products) {
    const key2     = normName(p.fullName || p.name || '');
    const newStock = stockMap.has(key2) ? stockMap.get(key2) : 0;
    const inStock  = newStock > 0;
    const oldStock = p.stock || 0;
    await Product.updateOne({ _id: p._id }, {
      $set: { stock: newStock, inStock, stockStatus: inStock ? 'in_stock' : 'out_of_stock' }
    });
    if (stockMap.has(key2)) matched++; else zeroed++;
    if (newStock !== oldStock) {
      stockLogDocs.push({
        productId:   p._id,
        productName: p.fullName || p.name || '',
        sku:         p.sku || '',
        delta:       newStock - oldStock,
        fromStock:   oldStock,
        toStock:     newStock,
        source:      'sync_1c',
        changedBy:   {},
      });
    }
  }
  if (stockLogDocs.length) await StockLog.insertMany(stockLogDocs, { ordered: false });

  console.log(`[sync-stock] ${new Date().toISOString()} matched=${matched} zeroed=${zeroed}`);
  res.json({ success: true, matched, zeroed, total: matched + zeroed, date: new Date().toISOString() });
});

// ── Stock Log ────────────────────────────────────────────────────────────────
// GET /api/admin/stock-log?productId=&source=&page=1&limit=50&dateFrom=&dateTo=
router.get('/stock-log', editor, async (req, res) => {
  try {
    const { productId, source, page = 1, limit = 50, dateFrom, dateTo, search } = req.query;
    const filter = {};
    if (productId) filter.productId = productId;
    if (source)    filter.source = source;
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   filter.createdAt.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
    }
    if (search) filter.productName = { $regex: search, $options: 'i' };

    const skip  = (Number(page) - 1) * Number(limit);
    const [logs, total] = await Promise.all([
      StockLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      StockLog.countDocuments(filter),
    ]);
    res.json({ logs, total, pages: Math.ceil(total / Number(limit)) });
  } catch (e) { res.status(500).json({ error: mongoErr(e) }); }
});

// ── Price Log ────────────────────────────────────────────────────────────────
// GET /api/admin/price-log?priceType=&source=&page=1&limit=50&dateFrom=&dateTo=&search=
router.get('/price-log', editor, async (req, res) => {
  try {
    const { priceType, source, page = 1, limit = 50, dateFrom, dateTo, search } = req.query;
    const filter = {};
    if (priceType) filter.priceType = priceType;
    if (source)    filter.source    = source;
    if (search)    filter.productName = { $regex: search, $options: 'i' };
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   filter.createdAt.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [logs, total] = await Promise.all([
      PriceLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      PriceLog.countDocuments(filter),
    ]);
    res.json({ logs, total, pages: Math.ceil(total / Number(limit)) });
  } catch (e) { res.status(500).json({ error: mongoErr(e) }); }
});

// ── Product Log ──────────────────────────────────────────────────────────────
// GET /api/admin/product-log?action=&source=&page=1&limit=50&dateFrom=&dateTo=&search=&brand=
router.get('/product-log', editor, async (req, res) => {
  try {
    const { action, source, page = 1, limit = 50, dateFrom, dateTo, search, brand } = req.query;
    const filter = {};
    if (action)  filter.action  = action;
    if (source)  filter.source  = source;
    if (brand)   filter.brand   = brand;
    if (search)  filter.productName = { $regex: search, $options: 'i' };
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   filter.createdAt.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [logs, total] = await Promise.all([
      ProductLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      ProductLog.countDocuments(filter),
    ]);
    res.json({ logs, total, pages: Math.ceil(total / Number(limit)) });
  } catch (e) { res.status(500).json({ error: mongoErr(e) }); }
});

// GET /api/admin/sales-chart?period=day|week|month&dateFrom=&dateTo=&brand=&set=&groupBy=set|product
router.get('/sales-chart', editor, async (req, res) => {
  try {
    const { period = 'day', dateFrom, dateTo, brand, set, groupBy = 'set' } = req.query;

    const match = { delta: { $lt: 0 } };
    if (dateFrom || dateTo) {
      match.createdAt = {};
      if (dateFrom) match.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   match.createdAt.$lte = new Date(dateTo + 'T23:59:59Z');
    }

    const fmtMap = { day: '%Y-%m-%d', week: '%Y-%V', month: '%Y-%m' };
    const fmt    = fmtMap[period] || fmtMap.day;

    const pipeline = [
      { $match: match },
      { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'prod' } },
      { $unwind: '$prod' },
    ];

    if (brand) pipeline.push({ $match: { 'prod.brand': brand } });
    if (set)   pipeline.push({ $match: { 'prod.set': set } });

    const groupKey = groupBy === 'product'
      ? { $ifNull: ['$prod.name', '__none__'] }
      : { $ifNull: ['$prod.set',  '__none__'] };

    pipeline.push(
      { $group: {
        _id: {
          period: { $dateToString: { format: fmt, date: '$createdAt', timezone: '+06:00' } },
          key:    groupKey,
        },
        sales:   { $sum: { $abs: '$delta' } },
        revenue: { $sum: { $multiply: [{ $abs: '$delta' }, { $ifNull: ['$prod.price', 0] }] } },
      }},
      { $sort: { '_id.period': 1 } },
    );

    const rows = await StockLog.aggregate(pipeline);

    const labelSet = [...new Set(rows.map(r => r._id.period))].sort();
    const keys     = [...new Set(rows.map(r => r._id.key))].filter(k => k !== '__none__').sort();

    const byKey = {};
    const revByKey = {};
    let grandRevenue = 0;
    rows.forEach(r => {
      const k = r._id.key;
      if (k === '__none__') return;
      if (!byKey[k]) byKey[k] = {};
      byKey[k][r._id.period] = r.sales;
      revByKey[k] = (revByKey[k] || 0) + (r.revenue || 0);
      grandRevenue += r.revenue || 0;
    });

    const datasets = keys.map(k => ({
      set:     k,
      data:    labelSet.map(l => byKey[k]?.[l] || 0),
      revenue: Math.round(revByKey[k] || 0),
    }));

    res.json({ labels: labelSet, datasets, grandRevenue: Math.round(grandRevenue) });
  } catch (e) { res.status(500).json({ error: mongoErr(e) }); }
});

// ── Tenders ──────────────────────────────────────────────────────────────────
// GET /api/admin/tenders?status=&brand=&search=&completed=true
router.get('/tenders', editor, async (req, res) => {
  try {
    const { status, brand, search, completed } = req.query;
    let filter;
    if (completed === 'true') {
      filter = { tenderCompleted: true };
    } else {
      filter = { productStatus: { $in: ['improvement', 'in_development'] }, tenderCompleted: { $ne: true } };
      if (status && ['improvement', 'in_development'].includes(status)) filter.productStatus = status;
    }
    if (brand)  filter.brand = brand;
    if (search) filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { fullName: { $regex: search, $options: 'i' } },
    ];
    const products = await Product.find(filter)
      .select('name fullName sku brand set productStatus developmentStage developmentTZ improvementTZ tenderAssignee tenderCompleted tenderCompletedAt images driveImages')
      .sort(completed === 'true' ? { tenderCompletedAt: -1 } : { productStatus: 1, fullName: 1 })
      .lean();
    res.json(products);
  } catch (e) { res.status(500).json({ error: mongoErr(e) }); }
});

// PATCH /api/admin/tenders/:id/complete
router.patch('/tenders/:id/complete', editor, async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: { productStatus: 'for_sale', tenderCompleted: true, tenderCompletedAt: new Date() } },
      { new: true, select: 'productStatus tenderCompleted tenderCompletedAt' }
    );
    if (!product) return res.status(404).json({ error: 'Товар не найден' });
    res.json(product);
  } catch (e) { res.status(500).json({ error: mongoErr(e) }); }
});

// PATCH /api/admin/tenders/:id/assign  { userId } or { userId: null } to unassign
router.patch('/tenders/:id/assign', editor, async (req, res) => {
  try {
    const { userId } = req.body;
    let assignee = { userId: null, userName: '', userEmail: '', assignedAt: null };
    if (userId) {
      const User = require('../models/User');
      const user = await User.findById(userId).lean();
      if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
      assignee = { userId: user._id, userName: user.name, userEmail: user.email, assignedAt: new Date() };
    }
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: { tenderAssignee: assignee } },
      { new: true, select: 'tenderAssignee' }
    );
    if (!product) return res.status(404).json({ error: 'Товар не найден' });
    res.json(product.tenderAssignee);
  } catch (e) { res.status(500).json({ error: mongoErr(e) }); }
});

module.exports = router;
