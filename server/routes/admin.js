const router       = require('express').Router();
const Product      = require('../models/Product');
const Brand        = require('../models/Brand');
const User         = require('../models/User');
const ChangeLog    = require('../models/ChangeLog');
const CategorySpec = require('../models/CategorySpec');
const cloudinary   = require('../lib/cloudinary');
const { protect, admin, editor, viewer } = require('../middleware/auth');

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

module.exports = router;
