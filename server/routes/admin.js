const router     = require('express').Router();
const Product    = require('../models/Product');
const Brand      = require('../models/Brand');
const User       = require('../models/User');
const cloudinary = require('../lib/cloudinary');
const { protect, admin } = require('../middleware/auth');

// All admin routes require auth + admin role
router.use(protect, admin);

// ── Dashboard stats ──────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const [products, outOfStock, brands, users] = await Promise.all([
      Product.countDocuments(),
      Product.countDocuments({ inStock: false }),
      Brand.countDocuments(),
      User.countDocuments({ role: 'user' }),
    ]);
    res.json({ products, outOfStock, brands, users });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Products ─────────────────────────────────────

// GET /api/admin/products?page=1&limit=20&search=&brand=&set=
router.get('/products', async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', brand, set, inStock } = req.query;
    const filter = {};
    if (search) filter.$or = [
      { name: new RegExp(search, 'i') },
      { fullName: new RegExp(search, 'i') },
      { sku: new RegExp(search, 'i') },
    ];
    if (brand) filter.brand = brand;
    if (set)   filter.set   = set;
    if (inStock !== undefined) filter.inStock = inStock === 'true';

    const [products, total] = await Promise.all([
      Product.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit)),
      Product.countDocuments(filter),
    ]);
    res.json({ products, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/admin/products/facets?brand=&set=&category=
// Returns distinct sets and categories that actually exist in products
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

    // Distinct sets when brand (+ optionally category) selected
    const filterForSets = { ...base };
    delete filterForSets.set;

    // Distinct categories when brand (+ optionally set) selected
    const filterForCats = { ...base };
    delete filterForCats.category;

    const [sets, categories] = await Promise.all([
      Product.distinct('set', filterForSets),
      Product.distinct('category', filterForCats),
    ]);

    res.json({
      sets:       sets.filter(Boolean).sort(),
      categories: categories.filter(Boolean).sort(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/admin/products/:id
router.get('/products/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Не найден' });
    res.json(product);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/products
router.post('/products', async (req, res) => {
  try {
    const product = await Product.create(req.body);
    res.status(201).json(product);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// PATCH /api/admin/products/:id
router.patch('/products/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id, req.body, { new: true, runValidators: true }
    );
    if (!product) return res.status(404).json({ error: 'Не найден' });
    res.json(product);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// DELETE /api/admin/products/:id
router.delete('/products/:id', async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Cloudinary ───────────────────────────────────

// DELETE /api/admin/images  { url: "https://res.cloudinary.com/..." }
router.delete('/images', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || !url.includes('cloudinary.com')) {
      return res.status(400).json({ error: 'Не Cloudinary URL' });
    }

    // Extract public_id from URL
    // e.g. .../upload/v1234/folder/filename.jpg  →  folder/filename
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(\.[^.]+)?$/);
    if (!match) return res.status(400).json({ error: 'Не удалось извлечь public_id' });

    const publicId = match[1];
    const result   = await cloudinary.uploader.destroy(publicId);

    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Brands / Sets ────────────────────────────────

// GET /api/admin/brands
router.get('/brands', async (req, res) => {
  try {
    const brands = await Brand.find().sort('order');
    res.json(brands);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/admin/brands/:key
router.patch('/brands/:key', async (req, res) => {
  try {
    const brand = await Brand.findOneAndUpdate(
      { key: req.params.key }, req.body, { new: true, runValidators: true }
    );
    if (!brand) return res.status(404).json({ error: 'Не найден' });
    res.json(brand);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Users ────────────────────────────────────────────

// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const users = await User.find({})
      .select('-password -resetPasswordToken -resetPasswordExpires')
      .sort({ createdAt: -1 });
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/admin/users/:id  — change role or isPending
router.patch('/users/:id', async (req, res) => {
  try {
    const { role, isPending } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { ...(role !== undefined && { role }), ...(isPending !== undefined && { isPending }) },
      { new: true }
    ).select('-password');
    if (!user) return res.status(404).json({ error: 'Не найден' });
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', async (req, res) => {
  try {
    // Prevent deleting yourself
    if (req.params.id === req.user._id.toString())
      return res.status(400).json({ error: 'Нельзя удалить себя' });
    await User.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
