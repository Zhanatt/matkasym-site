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
const Supplier     = require('../models/Supplier');
const PhotoLog     = require('../models/PhotoLog');
const ReceiveAlert = require('../models/ReceiveAlert');
const Feedback     = require('../models/Feedback');
const TechRequest  = require('../models/TechRequest');
const { COMPANY_REQUIRED } = require('../models/TechRequest');
const VideoSchedule = require('../models/VideoSchedule');
const LoginLog     = require('../models/LoginLog');
const ProductRequest = require('../models/ProductRequest');
const cloudinary   = require('../lib/cloudinary');
const { sendBufferStockAlerts, sendTelegramMessage, sendTelegramPhoto, publishToChannel } = require('../lib/telegram');
const { ZONES, zoneOf, zoneFilter } = require('../lib/bufferZones');
const { protect, admin, editor, viewer, warehouse, canReceiveStock, canViewBufferStock } = require('../middleware/auth');

// Остаток пересёк буферный запас сверху вниз → нужен алерт
const crossedBuffer = (oldStock, newStock, bufferStock) =>
  bufferStock > 0 && newStock < bufferStock && oldStock >= bufferStock;

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
  'developmentTZ','improvementTZ','pauseNote',
];

const FIELD_LABELS = {
  name: 'Название', fullName: 'Полное название', sku: 'SKU',
  price: 'Розничная цена', priceWholesale: 'Оптовая цена',
  priceDealer: 'Дилерская цена', priceCost: 'Себестоимость',
  inStock: 'В наличии', stock: 'Количество', stockStatus: 'Статус склада',
  productStatus: 'Статус продукта', description: 'Описание',
  dimensions: 'Габариты', category: 'Категория', set: 'Сет',
  color: 'Цвет', isNew: 'Новинка', developmentStage: 'Стадия разработки',
  pauseNote: 'Причина паузы',
  specs: 'Характеристики',
};

// ── SYNC STOCK FROM 1C (PowerShell на wins1 отправляет сюда данные) ──────────
// Объявлен ДО router.use(protect, ...): у скрипта нет JWT, он авторизуется по x-api-key.
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
  const bufferAlerts = [];

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
        notInFile:   !stockMap.has(key2),
        changedBy:   {},
      });
      // Алерт только если товар реально есть в выгрузке (обнуление "не найден" — не продажа)
      if (stockMap.has(key2) && crossedBuffer(oldStock, newStock, p.bufferStock)) {
        bufferAlerts.push({ name: p.fullName || p.name, sku: p.sku, stock: newStock, bufferStock: p.bufferStock, zone: zoneOf(p) });
      }
    }
  }
  if (stockLogDocs.length) await StockLog.insertMany(stockLogDocs, { ordered: false });
  if (bufferAlerts.length) sendBufferStockAlerts(bufferAlerts).catch(e => console.error('[BufferAlert]', e.message));

  console.log(`[sync-stock] ${new Date().toISOString()} matched=${matched} zeroed=${zeroed}`);
  res.json({ success: true, matched, zeroed, total: matched + zeroed, date: new Date().toISOString() });
});

// All admin routes require valid JWT + at least warehouse role
router.use(protect, warehouse);

// ── Dashboard stats ──────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const onlineThreshold = new Date(Date.now() - 3 * 60 * 1000);
    const adminRoles = ['owner', 'editor', 'viewer', 'navigator', 'warehouse', 'banned'];

    const [products, outOfStock, brands, users, usersOnline, pending, discontinued, illiquid, frontmen] = await Promise.all([
      Product.countDocuments(),
      Product.countDocuments({ inStock: false }),
      Brand.countDocuments(),
      User.countDocuments({ role: { $in: adminRoles } }),
      User.countDocuments({ role: { $in: adminRoles }, lastSeen: { $gte: onlineThreshold } }),
      User.countDocuments({ isPending: true }),
      Product.countDocuments({ productStatus: 'discontinued' }),
      Product.countDocuments({ category: 'Неликвид' }),
      Frontman.countDocuments(),
    ]);
    res.json({ products, outOfStock, brands, users, usersOnline, pending, discontinued, illiquid, frontmen });
  } catch (e) {
    res.status(500).json({ error: mongoErr(e) });
  }
});

// ── Products ─────────────────────────────────────

router.get('/products', async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', brand, set, category, inStock, productStatus, stockStatus, sort, pendingReceive, inTransit, includePending } = req.query;
    const filter = {};

    // Если запрашиваем товары для приёмки
    if (pendingReceive === 'true') {
      filter.$or = [{ pendingReceive: true }, { inTransit: true }];
    } else if (includePending !== 'true') {
      // По умолчанию скрываем товары, ожидающие приёмки (не показываем в каталоге)
      filter.pendingReceive = { $ne: true };
    }
    if (inTransit === 'true') filter.inTransit = true;
    if (search) filter.$or = [
      { name: new RegExp(search, 'i') },
      { fullName: new RegExp(search, 'i') },
      { sku: new RegExp(search, 'i') },
    ];
    if (brand)         filter.brand         = brand;
    if (set)           filter.set           = set;
    if (set === 'zhashyl-omur') console.log('[DEBUG] zhashyl-omur query, filter:', filter);
    if (category)      filter.category      = category;
    if (inStock !== undefined) filter.inStock = inStock === 'true';
    if (productStatus) filter.productStatus = productStatus;
    if (stockStatus)   filter.stockStatus   = stockStatus;

    const sortMap = { stock_desc: { stock: -1, createdAt: -1 }, stock_asc: { stock: 1, createdAt: -1 }, newest: { createdAt: -1 } };
    const sortObj = sortMap[sort] || { stock: -1, createdAt: -1 };

    const [products, total] = await Promise.all([
      Product.find(filter).sort(sortObj).skip((page - 1) * limit).limit(Number(limit))
        .populate('kitParts.product', 'name fullName price priceWholesale stock images'),
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
    const [sets, categories, productCount] = await Promise.all([
      Product.distinct('set', filterForSets),
      Product.distinct('category', filterForCats),
      brand ? Product.countDocuments({ brand, productStatus: { $nin: ['kit_part'] } }) : null,
    ]);
    res.json({ sets: sets.filter(Boolean).sort(), categories: categories.filter(Boolean).sort(), productCount });
  } catch (e) {
    res.status(500).json({ error: mongoErr(e) });
  }
});

router.get('/products/:id', async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Неверный идентификатор товара' });
  try {
    const product = await Product.findById(req.params.id)
      .populate('kitParts.product', 'name fullName price priceWholesale stock images');
    if (!product) return res.status(404).json({ error: 'Товар не найден' });
    res.json(product);
  } catch (e) {
    res.status(500).json({ error: mongoErr(e) });
  }
});

// PATCH /admin/products/:id/buffer-stock — установить буферный запас
// Доступ: owner или пользователи с флагом canSetBufferStock
router.patch('/products/:id/buffer-stock', async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Неверный идентификатор товара' });
  if (req.user.role !== 'owner' && !req.user.canSetBufferStock) {
    return res.status(403).json({ error: 'Нет прав менять буферный запас' });
  }
  try {
    const bufferStock = Math.max(0, Math.floor(Number(req.body.bufferStock) || 0));
    const old = await Product.findById(req.params.id);
    if (!old) return res.status(404).json({ error: 'Товар не найден' });
    if ((old.bufferStock || 0) !== bufferStock) {
      await ChangeLog.create({
        productId:   old._id,
        productName: old.fullName || old.name,
        changedBy:   { id: req.user._id, name: req.user.name, email: req.user.email },
        changes:     [{ field: 'Буферный запас', from: old.bufferStock || 0, to: bufferStock }],
      });
    }
    old.bufferStock = bufferStock;
    await old.save();
    res.json(old);
  } catch (e) { res.status(500).json({ error: mongoErr(e) }); }
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

    // Автопубликация новости о новом товаре
    autoPublishNews({
      type: 'new_product',
      product: p,
      changedBy: { id: req.user._id, name: req.user.name, email: req.user.email },
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
        if (crossedBuffer(fromStock, toStock, p.bufferStock)) {
          sendBufferStockAlerts([{ name: p.fullName || p.name, sku: p.sku, stock: toStock, bufferStock: p.bufferStock, zone: zoneOf(p) }])
            .catch(e => console.error('[BufferAlert]', e.message));
        }
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

        // Автопубликация новости об изменении цены (розничной или оптовой)
        const retailOrWholesale = priceChanges.find(c =>
          c.field === FIELD_LABELS.price || c.field === FIELD_LABELS.priceWholesale
        );
        if (retailOrWholesale) {
          const priceMsg = priceChanges.map(c => `${c.field}: ${c.from} → ${c.to} тг`).join('\n');
          autoPublishNews({
            type: 'price_change',
            product: p,
            changedBy: { id: req.user._id, name: req.user.name, email: req.user.email },
            message: priceMsg,
          });
        }
      }

      // Автопубликация при изменении productStatus
      const statusChange = changes.find(c => c.field === FIELD_LABELS.productStatus);
      if (statusChange && STATUS_TO_NEWS_TYPE[statusChange.to]) {
        autoPublishNews({
          type: STATUS_TO_NEWS_TYPE[statusChange.to],
          product: p,
          changedBy: { id: req.user._id, name: req.user.name, email: req.user.email },
        });
      }

      // Установка liquidatedAt при смене статуса на liquidation
      if (statusChange && statusChange.to === 'liquidation' && !old.liquidatedAt) {
        p.liquidatedAt = new Date();
        await p.save();
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

// Update a set's label in a brand (upsert - creates if not exists)
router.put('/brands/:key/sets/:slug', editor, async (req, res) => {
  try {
    const { label, labelRu } = req.body;
    if (!label) return res.status(400).json({ error: 'label обязателен' });
    // Try to update existing
    let brand = await Brand.findOneAndUpdate(
      { key: req.params.key, 'sets.key': req.params.slug },
      { $set: { 'sets.$.label': label, 'sets.$.labelRu': labelRu || '' } },
      { new: true }
    );
    // If set doesn't exist, create it
    if (!brand) {
      const defaultLabel = req.params.key.replace('matkasym-', '').toUpperCase();
      brand = await Brand.findOneAndUpdate(
        { key: req.params.key },
        {
          $push: { sets: { key: req.params.slug, label, labelRu: labelRu || '' } },
          $setOnInsert: { label: defaultLabel }
        },
        { new: true, upsert: true }
      );
    }
    res.json(brand);
  } catch (e) { res.status(400).json({ error: mongoErr(e) }); }
});

// Reorder sets in a brand (creates set entries for static sets if needed)
router.put('/brands/:key/sets-reorder', editor, async (req, res) => {
  try {
    const { orderedKeys } = req.body;
    if (!Array.isArray(orderedKeys)) return res.status(400).json({ error: 'orderedKeys должен быть массивом' });
    let brand = await Brand.findOne({ key: req.params.key });
    if (!brand) {
      const defaultLabel = req.params.key.replace('matkasym-', '').toUpperCase();
      brand = new Brand({ key: req.params.key, label: defaultLabel, sets: [] });
    }
    const setMap = new Map(brand.sets.map(s => [s.key, s]));
    const reordered = orderedKeys.map((k, i) => {
      if (setMap.has(k)) {
        const s = setMap.get(k);
        s.order = i;
        return s;
      }
      // Create new entry for static set
      const label = k.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      return { key: k, label, order: i };
    });
    brand.sets.forEach(s => { if (!orderedKeys.includes(s.key)) reordered.push(s); });
    brand.sets = reordered;
    await brand.save();
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

// GET /admin/users/:id/activity — статистика времени пользователя
router.get('/users/:id/activity', viewer, async (req, res) => {
  try {
    const userId = req.params.id;
    const now = new Date();
    const date7 = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const date30 = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const logs = await LoginLog.find({ userId }).sort({ date: -1 }).limit(90);
    const totalMinutes = logs.reduce((sum, l) => sum + (l.minutes || 0), 0);
    const last7DaysMin = logs.filter(l => l.date >= date7).reduce((sum, l) => sum + (l.minutes || 0), 0);
    const last30DaysMin = logs.filter(l => l.date >= date30).reduce((sum, l) => sum + (l.minutes || 0), 0);

    res.json({
      totalMinutes,
      last7DaysMin,
      last30DaysMin,
      days: logs.map(l => ({ date: l.date, minutes: l.minutes || 0 })),
    });
  } catch (e) { res.status(500).json({ error: mongoErr(e) }); }
});

// GET /admin/telegram-link — ссылка для привязки Telegram
router.get('/telegram-link', async (req, res) => {
  const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'MatkasymBot';
  const link = `https://t.me/${botUsername}?start=${req.user._id}`;
  res.json({ link, connected: !!req.user.telegramChatId });
});

// DELETE /admin/telegram-unlink — отвязать Telegram
router.delete('/telegram-unlink', async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { telegramChatId: '' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
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

// ── Suppliers (индивидуальные поставщики) ─────────────────────────────────────

router.get('/suppliers', protect, warehouse, async (req, res) => {
  try {
    const list = await Supplier.find().populate('products', 'name fullName images brand set').sort({ createdAt: -1 });
    res.json(list);
  } catch (e) { res.status(500).json({ error: mongoErr(e) }); }
});

router.post('/suppliers', protect, editor, async (req, res) => {
  try {
    const supplier = await Supplier.create(req.body);
    res.status(201).json(supplier);
  } catch (e) { res.status(400).json({ error: mongoErr(e) }); }
});

router.patch('/suppliers/:id', protect, editor, async (req, res) => {
  try {
    const supplier = await Supplier.findByIdAndUpdate(req.params.id, req.body, { new: true }).populate('products', 'name fullName images brand set');
    if (!supplier) return res.status(404).json({ error: 'Не найден' });
    res.json(supplier);
  } catch (e) { res.status(400).json({ error: mongoErr(e) }); }
});

router.delete('/suppliers/:id', protect, editor, async (req, res) => {
  try {
    await Supplier.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: mongoErr(e) }); }
});

// ── Приём товара на склад (warehouse) ─────────────────────────────────────────
// POST /api/admin/products/:id/receive — принять товар "в пути" или "ожидает приёмки" на склад
router.post('/products/:id/receive', protect, canReceiveStock, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Товар не найден' });

    const needsReceive = product.inTransit || product.pendingReceive;
    if (!needsReceive && product.inTransitQty === 0 && product.pendingReceiveQty === 0) {
      return res.status(400).json({ error: 'Товар не требует приёмки' });
    }

    const expectedQty = product.inTransitQty || product.pendingReceiveQty || 0;
    const { receivedQty, alertType, comment } = req.body;
    const actualQty = receivedQty ?? expectedQty;

    // Добавляем к остаткам, убираем статусы "в пути" и "ожидает приёмки"
    product.stock = (product.stock || 0) + actualQty;
    product.inStock = actualQty > 0;
    product.stockStatus = actualQty > 0 ? 'in_stock' : 'out_of_stock';
    product.inTransit = false;
    product.inTransitQty = 0;
    product.pendingReceive = false;
    product.pendingReceiveQty = 0;

    await product.save();

    // Логируем приём
    let note = `Принято на склад: ${actualQty} шт. (ожидалось ${expectedQty})`;
    if (alertType) note += ` — ${alertType}`;
    if (comment) note += `: ${comment}`;

    await StockLog.create({
      product: product._id,
      productId: product._id,
      productName: product.fullName || product.name,
      action: 'receive',
      oldValue: 0,
      newValue: actualQty,
      source: 'warehouse',
      note,
      user: req.user._id,
    });

    // Если есть проблема — создаём алерт для админа
    if (alertType && alertType !== 'ok') {
      await ReceiveAlert.create({
        product: product._id,
        productName: product.fullName || product.name,
        productSku: product.sku,
        expectedQty,
        receivedQty: actualQty,
        alertType,
        comment: comment || '',
        receivedBy: req.user._id,
        receivedByName: req.user.name,
      });
    }

    res.json({
      ok: true,
      message: `Принято ${actualQty} шт.`,
      product
    });
  } catch (e) { res.status(500).json({ error: mongoErr(e) }); }
});

// GET /api/admin/receive-alerts — уведомления о проблемах при приёме (для owner/editor)
router.get('/receive-alerts', protect, editor, async (req, res) => {
  try {
    const { status = 'pending' } = req.query;
    const filter = status === 'all' ? {} : { status };
    const alerts = await ReceiveAlert.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json(alerts);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/receive-alerts/count — количество непросмотренных алертов
router.get('/receive-alerts/count', protect, editor, async (req, res) => {
  try {
    const count = await ReceiveAlert.countDocuments({ status: 'pending' });
    res.json({ count });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/admin/receive-alerts/:id — обновить статус алерта
router.put('/receive-alerts/:id', protect, editor, async (req, res) => {
  try {
    const { status, resolvedComment } = req.body;
    const alert = await ReceiveAlert.findByIdAndUpdate(
      req.params.id,
      {
        status,
        resolvedBy: req.user._id,
        resolvedAt: new Date(),
        resolvedComment: resolvedComment || '',
      },
      { new: true }
    );
    if (!alert) return res.status(404).json({ error: 'Не найдено' });
    res.json(alert);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/products/:id/add-stock — добавить остатки (для склада)
router.post('/products/:id/add-stock', protect, canReceiveStock, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Товар не найден' });

    const { qty, comment } = req.body;
    if (!qty || qty <= 0) return res.status(400).json({ error: 'Укажите количество' });

    const oldStock = product.stock || 0;
    product.stock = oldStock + qty;
    product.inStock = true;
    product.stockStatus = 'in_stock';

    await product.save();

    // Логируем добавление
    await StockLog.create({
      product: product._id,
      productId: product._id,
      productName: product.fullName || product.name,
      action: 'add',
      oldValue: oldStock,
      newValue: product.stock,
      source: 'warehouse',
      note: comment || `Добавлено ${qty} шт. пользователем ${req.user.name}`,
      user: req.user._id,
    });

    res.json({
      ok: true,
      message: `Добавлено ${qty} шт.`,
      product
    });
  } catch (e) { res.status(500).json({ error: mongoErr(e) }); }
});

// GET /api/admin/products/in-transit — товары в пути (для склада)
router.get('/products/in-transit', protect, warehouse, async (req, res) => {
  try {
    const products = await Product.find({
      $or: [
        { inTransit: true },
        { inTransitQty: { $gt: 0 } }
      ]
    }).select('name fullName sku images inTransitQty supplier set brand').sort({ updatedAt: -1 });
    res.json(products);
  } catch (e) { res.status(500).json({ error: mongoErr(e) }); }
});

// GET /api/admin/products/pending-receive-count — количество товаров, ожидающих приёмки
router.get('/products/pending-receive-count', protect, async (req, res) => {
  try {
    const count = await Product.countDocuments({
      $or: [{ pendingReceive: true }, { inTransit: true }]
    });
    res.json({ count });
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
const sharp  = require('sharp');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }); // 50 MB per batch

// GET /api/admin/telegram/channel — настроен ли канал (для предупреждения в UI)
router.get('/telegram/channel', editor, (req, res) => {
  res.json({ configured: !!process.env.TELEGRAM_CHANNEL_ID });
});

// POST /api/admin/telegram/publish — опубликовать пост о товаре в TG-канал
// body: { caption (HTML), imageUrl }
router.post('/telegram/publish', editor, async (req, res) => {
  try {
    const { caption, imageUrl } = req.body || {};
    if (!caption || !String(caption).trim()) {
      return res.status(400).json({ message: 'Пустой текст поста' });
    }
    const result = await publishToChannel({ photoUrl: imageUrl || null, caption: String(caption).trim() });
    if (!result.ok) return res.status(502).json({ message: `Telegram: ${result.error}` });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /api/admin/upload-image — загрузить одно изображение (для новостей и т.п.)
router.post('/upload-image', editor, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'matkasym/news', resource_type: 'image' },
        (err, result) => err ? reject(err) : resolve(result)
      );
      stream.end(req.file.buffer);
    });
    res.json({ url: result.secure_url });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Разбирает двухуровневую шапку выгрузки 1С:
//   строка N   — склады:     "Товар" | "1 Основной склад" | "Коммерческий склад" | "Итого"
//   строка N+1 — показатели: "Остаток" | "Минимальный остаток" | "Сумма" | …
// Показатель относится к ближайшему складу слева. Склады кроме основного и
// коммерческого (Итого, Виртуальный, Вен агент) игнорируются.
// В старых выгрузках колонок минимума нет — тогда minOsn/minKomm остаются null.
function detectStockColumns(rows) {
  const fallback = { colOsn: 4, colKomm: 19, minOsn: null, minKomm: null, dataStart: 7 };

  let headRow = -1;
  for (let ri = 0; ri <= 12; ri++) {
    if (String((rows[ri] || [])[0] || '').trim().toLowerCase() === 'товар') { headRow = ri; break; }
  }
  if (headRow < 0) return fallback;

  const groups = [];
  (rows[headRow] || []).forEach((cell, c) => {
    const t = String(cell || '').trim().toLowerCase();
    if (!t || c === 0) return;
    groups.push({ col: c, key: t.includes('основной') ? 'Osn' : t.includes('коммерческий') ? 'Komm' : null });
  });
  if (!groups.some(g => g.key)) return fallback;

  const out = { colOsn: null, colKomm: null, minOsn: null, minKomm: null, dataStart: headRow + 2 };
  (rows[headRow + 1] || []).forEach((cell, c) => {
    const t = String(cell || '').trim().toLowerCase();
    if (!t.includes('остаток')) return;
    const g = groups.filter(x => x.col <= c).pop();
    if (!g || !g.key) return;
    const field = (t.includes('минимальн') ? 'min' : 'col') + g.key;
    if (out[field] === null) out[field] = c;
  });
  if (out.colOsn === null && out.colKomm === null) return fallback;
  if (out.colOsn === null)  out.colOsn  = fallback.colOsn;
  if (out.colKomm === null) out.colKomm = fallback.colKomm;
  return out;
}

// Буферный запас товара: 1С ведёт минимум по каждому складу отдельно —
// берём больший, меньший игнорируем. 0 означает "в 1С не задан".
const bufferFromMins = (a, b) => Math.max(toInt(a), toInt(b));

// POST /api/admin/upload-stock  (multipart: field "file")
router.post('/upload-stock', editor, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

  try {
    const wb   = xlsx.read(req.file.buffer, { type: 'buffer' });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });

    const { colOsn, colKomm, minOsn, minKomm, dataStart } = detectStockColumns(rows);
    const hasBufferCols = minOsn !== null || minKomm !== null;

    const stockMap = new Map();
    for (let i = dataStart; i < rows.length; i++) {
      const row  = rows[i];
      const name = String(row[0] || '').trim();
      if (!name) continue;

      const osnNum  = toInt(row[colOsn]);
      const kommRaw = Number(row[colKomm]);
      const kommNum = (!isNaN(kommRaw) && Number.isInteger(kommRaw)) ? Math.max(0, kommRaw) : 0;
      const buffer  = hasBufferCols ? bufferFromMins(minOsn === null ? 0 : row[minOsn], minKomm === null ? 0 : row[minKomm]) : 0;
      stockMap.set(normName(name), { stock: osnNum + kommNum, buffer });
    }

    const products = await Product.find({}, '_id fullName name sku category price priceWholesale stock bufferStock brand supplier.company');
    let matched = 0, zeroed = 0, buffersUpdated = 0;
    const notFoundRows = [];
    const stockLogDocs = [];
    const bufferAlerts = [];
    const ops = products.map(p => {
      const key      = normName(p.fullName || p.name || '');
      const row      = stockMap.get(key);
      const newStock = row ? row.stock : 0;
      const inStock  = newStock > 0;
      const oldStock = p.stock || 0;
      if (row) {
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

      // Буфер из 1С перезаписывает ручной, но только если задан.
      // У товаров IKEA в 1С минимума нет — там буфер ведут вручную, его не затираем.
      const oldBuffer = p.bufferStock || 0;
      const newBuffer = (row && row.buffer > 0) ? row.buffer : oldBuffer;
      if (newBuffer !== oldBuffer) buffersUpdated++;

      if (newStock !== oldStock) {
        stockLogDocs.push({
          productId:   p._id,
          productName: p.fullName || p.name || '',
          sku:         p.sku || '',
          delta:       newStock - oldStock,
          fromStock:   oldStock,
          toStock:     newStock,
          source:      'excel',
          notInFile:   !row,
          changedBy:   req.user ? { id: req.user._id, name: req.user.name, email: req.user.email } : {},
        });
        // Алерт только если товар реально есть в выгрузке (обнуление "не найден" — не продажа)
        if (row && crossedBuffer(oldStock, newStock, newBuffer)) {
          bufferAlerts.push({ name: p.fullName || p.name, sku: p.sku, stock: newStock, bufferStock: newBuffer, zone: zoneOf(p) });
        }
      }
      return { updateOne: { filter: { _id: p._id }, update: { $set: { stock: newStock, inStock, stockStatus: inStock ? 'in_stock' : 'out_of_stock', bufferStock: newBuffer } } } };
    });
    if (ops.length) await Product.bulkWrite(ops, { ordered: false });
    if (bufferAlerts.length) sendBufferStockAlerts(bufferAlerts).catch(e => console.error('[BufferAlert]', e.message));

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

    console.log(`[upload-stock] ${new Date().toISOString()} colOsn=${colOsn} colKomm=${colKomm} minOsn=${minOsn} minKomm=${minKomm} dataStart=${dataStart} matched=${matched} zeroed=${zeroed} buffers=${buffersUpdated}`);
    res.json({ success: true, matched, zeroed, total: matched + zeroed, buffersUpdated, hasBufferCols, excelBase64 });
  } catch (e) {
    res.status(500).json({ error: 'Ошибка обработки файла: ' + e.message });
  }
});

// ── PREVIEW NOMENCLATURE FROM 1С (no DB writes) ──────────────────────────────
// POST /api/admin/preview-nomenclature  (multipart: field "file")
router.post('/preview-nomenclature', editor, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
  try {
    const wb   = xlsx.read(req.file.buffer, { type: 'buffer', cellStyles: true });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // Auto-detect columns
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

    function detectBrand(name) {
      const n = name.toLowerCase();
      if (n.includes('shaar') || n.includes('шаар')) return 'matkasym-shaar';
      if (n.includes('kyzmat') || n.includes('кызмат')) return 'matkasym-kyzmat';
      return 'matkasym-home';
    }

    // Check if row is a group by yellow background color (F8F2D8)
    // rows[i] corresponds to Excel A(i+2) because A1 is empty
    function isYellowRow(rowIndex) {
      const cellAddr = 'A' + (rowIndex + 2);
      const cell = ws[cellAddr];
      if (!cell || !cell.s) return false;
      const fgColor = cell.s.fgColor?.rgb || '';
      return fgColor === 'F8F2D8';
    }

    // Parse all non-empty rows (skip yellow rows = groups)
    const excelMap = new Map();
    for (let i = dataStart; i < rows.length; i++) {
      const row  = rows[i];
      const name = String(row[0] || '').trim();
      if (!name || isYellowRow(i)) continue;
      const osn     = toInt(row[colOsn]);
      const kommRaw = Number(row[colKomm]);
      const komm    = (!isNaN(kommRaw) && Number.isInteger(kommRaw)) ? Math.max(0, kommRaw) : 0;
      excelMap.set(normName(name), { name, stock: osn + komm, brand: detectBrand(name) });
    }

    // Find names not already in DB
    const existing    = await Product.find({}, 'fullName name').lean();
    const existingSet = new Set(existing.map(p => normName(p.fullName || p.name || '')));

    const items = [];
    for (const [normed, data] of excelMap) {
      if (!existingSet.has(normed)) items.push(data);
    }

    res.json({ items, total: excelMap.size });
  } catch (e) { res.status(500).json({ error: 'Ошибка обработки файла: ' + e.message }); }
});

// ── CONFIRM NOMENCLATURE (create selected items) ──────────────────────────────
// POST /api/admin/confirm-nomenclature  body: { items: [{name, stock, brand}] }
router.post('/confirm-nomenclature', editor, async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Нет товаров для добавления' });
  try {
    const created  = [];
    const logDocs  = [];
    for (const item of items) {
      const name    = String(item.name  || '').trim();
      const stock   = Number(item.stock || 0);
      const brand   = String(item.brand || 'matkasym-home');
      if (!name) continue;
      const inStock = stock > 0;
      try {
        const p = await Product.create({
          name, fullName: name, brand,
          price: 0, category: 'other',
          stock, inStock,
          stockStatus:   inStock ? 'in_stock' : 'out_of_stock',
          productStatus: 'for_sale',
        });
        created.push(p);
        logDocs.push({
          action: 'added', productId: p._id, productName: p.fullName,
          sku: '', brand, source: 'sync_1c',
          changedBy: req.user ? { id: req.user._id, name: req.user.name, email: req.user.email } : {},
        });
      } catch (_) {}
    }
    if (logDocs.length) await ProductLog.insertMany(logDocs, { ordered: false });
    res.json({ added: created.length });
  } catch (e) { res.status(500).json({ error: 'Ошибка создания товаров: ' + e.message }); }
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
// POST /api/admin/upload-photos  (multipart: field "files", multiple images OR single Excel with embedded photos)

// Helper: extract images from Excel file with embedded photos
async function extractImagesFromExcel(buffer) {
  const AdmZip = require('adm-zip');
  const xml2js = require('xml2js');

  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();

  // Fix case sensitivity issue with SharedStrings.xml
  for (const entry of entries) {
    if (entry.entryName === 'xl/SharedStrings.xml') {
      entry.entryName = 'xl/sharedStrings.xml';
    }
  }

  // 1. Read product names from sheet (column 18 = S, starting row ~87)
  const sharedStringsEntry = entries.find(e => e.entryName.toLowerCase() === 'xl/sharedstrings.xml');
  const sheetEntry = entries.find(e => e.entryName === 'xl/worksheets/sheet1.xml');

  if (!sheetEntry) throw new Error('Не найден лист Excel');

  // Parse shared strings
  const sharedStrings = [];
  if (sharedStringsEntry) {
    const ssXml = sharedStringsEntry.getData().toString('utf8');
    const ssResult = await xml2js.parseStringPromise(ssXml);
    const si = ssResult?.sst?.si || [];
    for (const item of si) {
      if (item.t) sharedStrings.push(item.t[0] || '');
      else if (item.r) sharedStrings.push(item.r.map(r => r.t?.[0] || '').join(''));
      else sharedStrings.push('');
    }
  }

  // Parse sheet to find product names by row
  const sheetXml = sheetEntry.getData().toString('utf8');
  const sheetResult = await xml2js.parseStringPromise(sheetXml);
  const rows = sheetResult?.worksheet?.sheetData?.[0]?.row || [];

  const productsByRow = new Map(); // row number -> product name
  for (const row of rows) {
    const rowNum = parseInt(row.$.r);
    if (rowNum < 80) continue;

    const cells = row.c || [];
    // Look for cell in column S (19th column) or column C (3rd column for item number)
    let itemNum = null, prodName = null;

    for (const cell of cells) {
      const ref = cell.$.r || '';
      const col = ref.replace(/[0-9]/g, '');
      const val = cell.v?.[0];

      if (col === 'C' && val) {
        const n = parseInt(val);
        if (!isNaN(n) && n > 0 && n < 10000) itemNum = n;
      }
      if (col === 'S' && val !== undefined) {
        // Check if it's a shared string reference
        if (cell.$.t === 's' && sharedStrings[parseInt(val)]) {
          prodName = sharedStrings[parseInt(val)];
        } else {
          prodName = val;
        }
      }
    }

    if (itemNum && prodName && !prodName.startsWith('Цена:')) {
      productsByRow.set(rowNum, prodName.trim());
    }
  }

  // 2. Parse drawing relationships to get image files
  const drawingRelsEntry = entries.find(e => e.entryName === 'xl/drawings/_rels/drawing1.xml.rels');
  const drawingEntry = entries.find(e => e.entryName === 'xl/drawings/drawing1.xml');

  if (!drawingEntry || !drawingRelsEntry) throw new Error('Не найдены встроенные изображения в Excel');

  // Parse rels to map rId -> image filename
  const relsXml = drawingRelsEntry.getData().toString('utf8');
  const relsResult = await xml2js.parseStringPromise(relsXml);
  const relationships = relsResult?.Relationships?.Relationship || [];

  const ridToFile = new Map();
  for (const rel of relationships) {
    const rid = rel.$.Id;
    const target = rel.$.Target || '';
    if (target.includes('media/')) {
      ridToFile.set(rid, target.replace('../media/', ''));
    }
  }

  // 3. Parse drawing.xml to get image positions (which row each image is on)
  const drawingXml = drawingEntry.getData().toString('utf8');
  const drawingResult = await xml2js.parseStringPromise(drawingXml);

  const ns = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
  const anchors = drawingResult?.['wsDr']?.['xdr:twoCellAnchor'] ||
                  drawingResult?.['xdr:wsDr']?.['xdr:twoCellAnchor'] ||
                  drawingResult?.wsDr?.twoCellAnchor || [];

  const imagePositions = []; // { row, imageFile }
  for (const anchor of anchors) {
    const from = anchor['xdr:from']?.[0] || anchor.from?.[0];
    const pic = anchor['xdr:pic']?.[0] || anchor.pic?.[0];

    if (!from || !pic) continue;

    const row = parseInt(from['xdr:row']?.[0] || from.row?.[0] || '-1');
    if (row < 80) continue;

    const blipFill = pic['xdr:blipFill']?.[0] || pic.blipFill?.[0];
    const blip = blipFill?.['a:blip']?.[0];
    if (!blip) continue;

    const rid = blip.$?.['r:embed'];
    if (rid && ridToFile.has(rid)) {
      imagePositions.push({ row, imageFile: ridToFile.get(rid) });
    }
  }

  // 4. Match images to products (find nearest product within 10 rows)
  const result = []; // { name, buffer, ext }
  const usedProducts = new Set();

  for (const { row, imageFile } of imagePositions) {
    let bestName = null, bestDist = 100;

    for (const [prodRow, name] of productsByRow) {
      const dist = Math.abs(prodRow - row);
      if (dist < bestDist && dist <= 10 && !usedProducts.has(name)) {
        bestDist = dist;
        bestName = name;
      }
    }

    if (bestName) {
      const mediaEntry = entries.find(e => e.entryName === `xl/media/${imageFile}`);
      if (mediaEntry) {
        usedProducts.add(bestName);
        const ext = path.extname(imageFile) || '.png';
        result.push({ name: bestName, buffer: mediaEntry.getData(), ext });
      }
    }
  }

  return result;
}

router.post('/upload-photos', editor, upload.array('files', 100), async (req, res) => {
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

    // Compress image to max 800px width, JPEG 80% quality
    const compressImage = async (buf) => {
      try {
        return await sharp(buf)
          .resize(800, null, { withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();
      } catch (e) {
        console.warn('[upload-photos] compression failed, using original:', e.message);
        return buf;
      }
    };

    const uploadOne = (buf, publicId) => new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'matkasym', public_id: publicId, overwrite: true, resource_type: 'image' },
        (err, r) => err ? reject(err) : resolve(r)
      );
      stream.end(buf);
    });

    let matched = 0;
    const notFoundRows = [];
    const ops = [];
    const photoLogs = [];

    // sourceFile comes from form data (set by client when extracting from Excel)
    const sourceFile = req.body.sourceFile || '';
    const source = sourceFile ? 'excel' : 'manual';
    const filesToProcess = req.files;

    // Process in batches of 5 to avoid Cloudinary rate limits
    const BATCH = 5;
    for (let i = 0; i < filesToProcess.length; i += BATCH) {
      const batch = filesToProcess.slice(i, i + BATCH);
      await Promise.all(batch.map(async file => {
        const baseName = path.basename(file.originalname, path.extname(file.originalname)).trim();
        const product  = bySkuMap.get(baseName.toLowerCase()) || byNameMap.get(normName(baseName));

        if (!product) {
          notFoundRows.push({ 'Файл': file.originalname, 'Причина': 'Товар не найден в БД' });
          return;
        }

        try {
          // Compress before upload
          const compressed = await compressImage(file.buffer);
          const result = await uploadOne(compressed, `product_${product._id}`);
          ops.push({ updateOne: { filter: { _id: product._id }, update: { $set: { images: [result.secure_url] } } } });

          // Log photo upload
          photoLogs.push({
            productId: product._id,
            productName: product.fullName || product.name,
            sku: product.sku || '',
            imageUrl: result.secure_url,
            source,
            sourceFile,
            changedBy: req.user ? { id: req.user._id, name: req.user.name, email: req.user.email } : {}
          });

          matched++;
        } catch (e) {
          notFoundRows.push({ 'Файл': file.originalname, 'Причина': 'Ошибка Cloudinary: ' + e.message });
        }
      }));
    }

    if (ops.length) await Product.bulkWrite(ops, { ordered: false });
    if (photoLogs.length) await PhotoLog.insertMany(photoLogs);

    let excelBase64 = null;
    if (notFoundRows.length > 0) {
      const wb2 = xlsx.utils.book_new();
      const ws2 = xlsx.utils.json_to_sheet(notFoundRows);
      xlsx.utils.book_append_sheet(wb2, ws2, 'Не найдены');
      excelBase64 = xlsx.write(wb2, { type: 'base64', bookType: 'xlsx' });
    }

    console.log(`[upload-photos] matched=${matched} notFound=${notFoundRows.length} total=${filesToProcess.length}`);
    res.json({ success: true, matched, notFound: notFoundRows.length, total: filesToProcess.length, excelBase64 });
  } catch (e) {
    res.status(500).json({ error: 'Ошибка: ' + e.message });
  }
});

// ── Buffer Stock ─────────────────────────────────────────────────────────────
// GET /api/admin/buffer-stock?zone=ikea|home|shaar
// Товары, у которых остаток упал ниже буферного запаса.
// Видят все, у кого есть доступ: зоны разделяют только адресатов алертов, не обзор.
router.get('/buffer-stock', canViewBufferStock, async (req, res) => {
  try {
    const zone = ZONES[req.query.zone] ? req.query.zone : '';

    const belowBuffer = { bufferStock: { $gt: 0 }, $expr: { $lt: ['$stock', '$bufferStock'] } };
    const filter      = zone ? { ...belowBuffer, ...zoneFilter(zone) } : belowBuffer;

    const products = await Product.find(filter)
      .select('_id fullName name sku brand set category images driveImages stock bufferStock price priceWholesale priceDealer supplier.company')
      .lean();

    // Сначала самый большой дефицит
    products.forEach(p => { p.deficit = (p.bufferStock || 0) - (p.stock || 0); p.zone = zoneOf(p); });
    products.sort((a, b) => b.deficit - a.deficit);

    const [totalCount, ...entries] = await Promise.all([
      Product.countDocuments(belowBuffer),
      ...Object.keys(ZONES).map(async z =>
        [z, await Product.countDocuments({ ...belowBuffer, ...zoneFilter(z) })]
      ),
    ]);

    res.json({
      products,
      zone,
      totalCount,
      ownZone: req.user.bufferZone || '',
      counts: Object.fromEntries(entries),
      zones: Object.entries(ZONES).map(([key, z]) => ({ key, label: z.label })),
    });
  } catch (e) { res.status(500).json({ error: mongoErr(e) }); }
});

// ── Stock Log ────────────────────────────────────────────────────────────────
// GET /api/admin/stock-log?productId=&source=&page=1&limit=50&dateFrom=&dateTo=
router.get('/stock-log', canReceiveStock, async (req, res) => {
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

// ── Photo Log ────────────────────────────────────────────────────────────────
// GET /api/admin/photo-log?source=&page=1&limit=50&dateFrom=&dateTo=&search=
router.get('/photo-log', editor, async (req, res) => {
  try {
    const { source, page = 1, limit = 50, dateFrom, dateTo, search } = req.query;
    const filter = {};
    if (source) filter.source = source;
    if (search) filter.productName = { $regex: search, $options: 'i' };
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   filter.createdAt.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [logs, total] = await Promise.all([
      PhotoLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      PhotoLog.countDocuments(filter),
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
router.get('/sales-chart', viewer, async (req, res) => {
  try {
    const { period = 'day', dateFrom, dateTo, brand, set, groupBy = 'set' } = req.query;

    // notInFile — обнуление товара, которого нет в выгрузке 1С; это не продажа
    const match = { delta: { $lt: 0 }, notInFile: { $ne: true } };
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
        sales:      { $sum: { $abs: '$delta' } },
        revenue:    { $sum: { $multiply: [{ $abs: '$delta' }, { $ifNull: ['$prod.price', 0] }] } },
        brand:      { $first: '$prod.brand' },
        images:     { $first: '$prod.images' },
        driveImages:{ $first: '$prod.driveImages' },
        productId:  { $first: '$prod._id' },
      }},
      { $sort: { '_id.period': 1 } },
    );

    const rows = await StockLog.aggregate(pipeline);

    const labelSet = [...new Set(rows.map(r => r._id.period))].sort();
    const keys     = [...new Set(rows.map(r => r._id.key))].filter(k => k !== '__none__').sort();

    const byKey = {};
    const revByKey = {};
    const brandByKey = {};
    const imagesByKey = {};
    const productIdByKey = {};
    let grandRevenue = 0;
    rows.forEach(r => {
      const k = r._id.key;
      if (k === '__none__') return;
      if (!byKey[k]) byKey[k] = {};
      byKey[k][r._id.period] = r.sales;
      revByKey[k] = (revByKey[k] || 0) + (r.revenue || 0);
      grandRevenue += r.revenue || 0;
      if (!brandByKey[k]) brandByKey[k] = r.brand || '';
      if (!imagesByKey[k]) imagesByKey[k] = { images: r.images || [], driveImages: r.driveImages || [] };
      if (!productIdByKey[k]) productIdByKey[k] = r.productId || null;
    });

    const datasets = keys.map(k => ({
      set:        k,
      data:       labelSet.map(l => byKey[k]?.[l] || 0),
      revenue:    Math.round(revByKey[k] || 0),
      brand:      brandByKey[k] || '',
      images:     imagesByKey[k]?.images || [],
      driveImages:imagesByKey[k]?.driveImages || [],
      productId:  productIdByKey[k] || null,
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

// ── News Feed ─────────────────────────────────────────────────────────────────

const News = require('../models/News');
const { sendNewsNotification } = require('../lib/mailer');
const { sendNewsNotificationTelegram } = require('../lib/telegram');

// Маппинг productStatus → news type
const STATUS_TO_NEWS_TYPE = {
  planned:        'status_planned',
  in_development: 'status_in_development',
  improvement:    'status_improvement',
  for_sale:       'status_for_sale',
  discontinued:   'discontinued',
  nelikvid:       'nelikvid',
};

const NEWS_TYPE_TITLES = {
  new_product:           (name) => `Новый товар: ${name}`,
  status_planned:        (name) => `${name} — добавлен в планы`,
  status_in_development: (name) => `${name} — в разработке`,
  status_improvement:    (name) => `${name} — на улучшении`,
  status_for_sale:       (name) => `${name} — в продаже`,
  discontinued:          (name) => `${name} — снят с производства`,
  nelikvid:              (name) => `${name} — неликвид`,
  price_change:          (name) => `Изменение цены: ${name}`,
};

async function autoPublishNews({ type, product, changedBy, message = '' }) {
  try {
    const users = await User.find({
      role: { $in: ['owner', 'editor', 'viewer'] },
      isPending: { $ne: true },
    }).lean();

    if (users.length === 0) return null;

    const productName = product.fullName || product.name;
    const title = NEWS_TYPE_TITLES[type]?.(productName) || productName;

    const recipients = users.map(u => ({
      userId: u._id,
      name:   u.name,
      email:  u.email,
      read:   u._id.toString() === changedBy.id?.toString(),
      readAt: u._id.toString() === changedBy.id?.toString() ? new Date() : null,
    }));

    const news = await News.create({
      type,
      title,
      message,
      product: {
        id:          product._id,
        name:        productName,
        brand:       product.brand || '',
        set:         product.set   || '',
        stock:       product.stock ?? 0,
        inTransit:   product.inTransit || false,
        images:      product.images      || [],
        driveImages: product.driveImages || [],
      },
      recipients,
      createdBy: changedBy,
    });

    // Отправляем уведомления (кроме автора)
    const notifyRecipients = users.filter(u => u._id.toString() !== changedBy.id?.toString());
    if (notifyRecipients.length > 0) {
      // Telegram (основной)
      sendNewsNotificationTelegram({ type, title, message, product }, notifyRecipients).catch(() => {});
      // Email (резерв)
      sendNewsNotification({ type, title, message, product }, notifyRecipients).catch(() => {});
    }

    return news;
  } catch (e) {
    console.error('Auto-publish news error:', e.message);
    return null;
  }
}

// GET /admin/news/unread-count — MUST be before /news/:id
router.get('/news/unread-count', async (req, res) => {
  try {
    const count = await News.countDocuments({
      $or: [
        { recipients: { $elemMatch: { userId: req.user._id, read: false } } },
        // созданные — всегда считаются прочитанными, не добавляем сюда
      ],
    });
    res.json({ count });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// POST /admin/news/read-all — MUST be before /news/:id
router.post('/news/read-all', async (req, res) => {
  try {
    await News.updateMany(
      { recipients: { $elemMatch: { userId: req.user._id, read: false } } },
      { $set: { 'recipients.$[r].read': true, 'recipients.$[r].readAt': new Date() } },
      { arrayFilters: [{ 'r.userId': req.user._id }] }
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// GET /admin/news — лента для текущего пользователя (viewer+)
router.get('/news', async (req, res) => {
  try {
    const uid = req.user._id.toString();
    const { page = 1, limit = 30 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const filter = { $or: [
      { 'recipients.userId': req.user._id },
      { 'createdBy.id': req.user._id },
    ]};

    const [news, total] = await Promise.all([
      News.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      News.countDocuments(filter),
    ]);

    const result = news.map(n => {
      const rec  = n.recipients.find(r => r.userId.toString() === uid);
      const isCreator = n.createdBy?.id?.toString() === uid;
      return { ...n, read: rec ? rec.read : isCreator };
    });

    res.json({ news: result, total, pages: Math.ceil(total / Number(limit)) });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// POST /admin/news — создать новость (editor+)
router.post('/news', editor, async (req, res) => {
  try {
    const { type, title, message, images, productId, recipientIds } = req.body;
    if (!type || !title) return res.status(400).json({ message: 'Тип и заголовок обязательны' });

    const product = productId ? await Product.findById(productId).lean() : null;

    // Автоматически обновляем статус товара по типу новости
    if (product) {
      const statusMap = {
        discontinued: { productStatus: 'discontinued' },
        nelikvid:     { productStatus: 'nelikvid'     },
        out_of_stock: { stockStatus: 'out_of_stock', inStock: false },
        restocked:    { stockStatus: 'in_stock',     inStock: true  },
      };
      const updates = statusMap[type];
      if (updates) {
        await Product.findByIdAndUpdate(product._id, { $set: updates });
      }
    }

    let users;
    if (Array.isArray(recipientIds) && recipientIds.length > 0) {
      users = await User.find({ _id: { $in: recipientIds }, role: { $in: ['owner', 'editor', 'viewer'] }, isPending: false }).lean();
    } else {
      users = await User.find({ role: { $in: ['owner', 'editor', 'viewer'] }, isPending: false }).lean();
    }

    const recipients = users.map(u => ({ userId: u._id, name: u.name, email: u.email, read: false }));

    // Создатель всегда видит свою новость (помечается как прочитанная)
    const creatorInList = recipients.some(r => r.userId.toString() === req.user._id.toString());
    if (!creatorInList) {
      recipients.push({ userId: req.user._id, name: req.user.name, email: req.user.email, read: true });
    }

    const news = await News.create({
      type,
      title,
      message: message || '',
      images: images || [],
      product: product ? {
        id:          product._id,
        name:        product.fullName || product.name,
        brand:       product.brand,
        set:         product.set,
        stock:       product.stock,
        images:      product.images || [],
        driveImages: product.driveImages || [],
      } : undefined,
      recipients,
      createdBy: { id: req.user._id, name: req.user.name, email: req.user.email },
    });

    // Send notifications async — don't block response (исключаем автора)
    const notifyRecipients = users.filter(u => u._id.toString() !== req.user._id.toString());
    console.log(`[News] Created news "${title}", sending to ${notifyRecipients.length} recipients`);
    if (notifyRecipients.length > 0) {
      const newsData = {
        type,
        title,
        message: message || '',
        product: product ? {
          name:        product.fullName || product.name,
          stock:       product.stock,
          images:      product.images || [],
          driveImages: product.driveImages || [],
        } : null,
      };
      // Telegram (основной)
      sendNewsNotificationTelegram(newsData, notifyRecipients).catch(e => console.error('[News] Telegram send error:', e.message));
      // Email (резерв)
      sendNewsNotification(newsData, notifyRecipients).catch(e => console.error('[News] Email send error:', e.message));
    } else {
      console.log('[News] No recipients to notify (only author)');
    }

    res.status(201).json({ news });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// PATCH /admin/news/:id/read — отметить прочитанной
router.patch('/news/:id/read', async (req, res) => {
  try {
    await News.updateOne(
      { _id: req.params.id, 'recipients.userId': req.user._id },
      { $set: { 'recipients.$[r].read': true, 'recipients.$[r].readAt': new Date() } },
      { arrayFilters: [{ 'r.userId': req.user._id }] }
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// POST /admin/news/:id/sync — применить статус новости к товару (editor+)
const NEWS_STATUS_MAP = {
  discontinued: { productStatus: 'discontinued' },
  nelikvid:     { productStatus: 'nelikvid'     },
  out_of_stock: { stockStatus: 'out_of_stock', inStock: false },
  restocked:    { stockStatus: 'in_stock',     inStock: true  },
};

router.post('/news/:id/sync', editor, async (req, res) => {
  try {
    const news = await News.findById(req.params.id).lean();
    if (!news) return res.status(404).json({ message: 'Новость не найдена' });

    const updates = NEWS_STATUS_MAP[news.type];
    if (!updates) return res.status(400).json({ message: 'Этот тип новости не влияет на статус товара' });

    const productId = news.product?.id;
    if (!productId) return res.status(400).json({ message: 'К новости не привязан товар' });

    const updated = await Product.findByIdAndUpdate(
      productId,
      { $set: updates },
      { new: true, select: 'productStatus stockStatus inStock name' }
    );
    if (!updated) return res.status(404).json({ message: 'Товар не найден' });

    res.json({ ok: true, product: updated });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// DELETE /admin/news/:id — удалить (editor+)
router.delete('/news/:id', editor, async (req, res) => {
  try {
    await News.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// ── Product Review (Аудит ассортимента) ───────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

const ProductReview = require('../models/ProductReview');
const Audit = require('../models/Audit');
const { sendAuditNotification } = require('../lib/mailer');
const { sendAuditNotificationTelegram } = require('../lib/telegram');

// ── Audits Management ─────────────────────────────────────────────────────────

// GET /api/admin/audits — список всех аудитов
router.get('/audits', async (req, res) => {
  try {
    const audits = await Audit.find()
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();
    res.json(audits);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/audits/active — активный аудит (или null)
router.get('/audits/active', async (req, res) => {
  try {
    const audit = await Audit.findOne({ status: 'active' })
      .populate('createdBy', 'name')
      .lean();
    res.json(audit);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/audits/:id — детали аудита
router.get('/audits/:id', async (req, res) => {
  try {
    const audit = await Audit.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('frontmenProgress.frontman', 'name color sets brand')
      .lean();
    if (!audit) return res.status(404).json({ error: 'Аудит не найден' });
    res.json(audit);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/audits — создать новый аудит (editor+)
router.post('/audits', editor, async (req, res) => {
  try {
    const { name, deadline } = req.body;

    if (!name || !deadline) {
      return res.status(400).json({ error: 'Укажите название и дедлайн' });
    }

    // Проверить, нет ли уже активного аудита
    const existingActive = await Audit.findOne({ status: 'active' });
    if (existingActive) {
      return res.status(400).json({ error: 'Уже есть активный аудит. Завершите его перед созданием нового.' });
    }

    // Получить всех фронтменов с их товарами
    const frontmen = await Frontman.find({ userId: { $ne: null } }).populate('userId', 'email name telegramChatId');

    const frontmenProgress = await Promise.all(
      frontmen.map(async (fm) => {
        const totalProducts = await Product.countDocuments({ set: { $in: fm.sets }, brand: fm.brand });
        return {
          frontman: fm._id,
          totalProducts,
          reviewedProducts: 0,
          completedAt: null,
        };
      })
    );

    const audit = await Audit.create({
      name,
      deadline: new Date(deadline),
      createdBy: req.user._id,
      frontmenProgress,
      stats: {
        frontmenTotal: frontmen.length,
      },
    });

    // Отправить уведомления фронтменам
    const recipients = frontmen
      .filter(fm => fm.userId)
      .map(fm => ({
        email: fm.userId.email,
        name: fm.userId.name || fm.name,
        telegramChatId: fm.userId.telegramChatId,
      }));

    // Отправляем асинхронно, не ждём
    Promise.all([
      sendAuditNotification({ auditName: name, deadline }, recipients),
      sendAuditNotificationTelegram({ auditName: name, deadline }, recipients),
    ]).catch(e => console.error('[Audit] Notification error:', e));

    res.status(201).json(audit);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/audits/:id/complete — завершить аудит вручную (editor+)
router.post('/audits/:id/complete', editor, async (req, res) => {
  try {
    const audit = await Audit.findById(req.params.id);
    if (!audit) return res.status(404).json({ error: 'Аудит не найден' });
    if (audit.status !== 'active') return res.status(400).json({ error: 'Аудит уже завершён' });

    // Подсчитать статистику
    const reviews = await ProductReview.find({ audit: audit._id });
    const stats = {
      totalProducts: reviews.length,
      keep: reviews.filter(r => r.status === 'keep').length,
      improve: reviews.filter(r => r.status === 'improve').length,
      discontinue: reviews.filter(r => r.status === 'discontinue').length,
      frontmenTotal: audit.frontmenProgress.length,
      frontmenCompleted: audit.frontmenProgress.filter(fp => fp.completedAt).length,
    };

    audit.status = 'completed';
    audit.completedAt = new Date();
    audit.stats = stats;
    await audit.save();

    res.json(audit);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/admin/audits/:id — удалить аудит (editor+)
router.delete('/audits/:id', editor, async (req, res) => {
  try {
    await ProductReview.deleteMany({ audit: req.params.id });
    await Audit.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Frontman Review Interface ─────────────────────────────────────────────────

// GET /api/admin/review/my-sets — сеты текущего фронтмена для активного аудита
router.get('/review/my-sets', async (req, res) => {
  try {
    // Ищем ВСЕХ фронтменов с этим userId (может быть в нескольких брендах)
    const frontmen = await Frontman.find({ userId: req.user._id });
    if (!frontmen.length) return res.json({ sets: [], frontman: null, activeAudit: null, overdueAudits: [] });

    // Используем первого для имени/цвета, но собираем сеты со всех
    const primaryFrontman = frontmen[0];

    // Найти активный аудит
    const activeAudit = await Audit.findOne({ status: 'active' }).lean();

    // Найти просроченные незавершённые аудиты для всех фронтменов этого пользователя
    const frontmanIds = frontmen.map(f => f._id);
    const overdueAudits = await Audit.find({
      status: 'active',
      deadline: { $lt: new Date() },
      'frontmenProgress.frontman': { $in: frontmanIds },
      'frontmenProgress.completedAt': null,
    }).lean();

    // Фильтруем только те, где этот фронтмен не завершил
    const reallyOverdue = overdueAudits.filter(a => {
      return frontmanIds.some(fid => {
        const fp = a.frontmenProgress.find(p => p.frontman.toString() === fid.toString());
        return fp && !fp.completedAt;
      });
    });

    if (!activeAudit) {
      return res.json({
        sets: [],
        frontman: { _id: primaryFrontman._id, name: primaryFrontman.name, brand: primaryFrontman.brand, color: primaryFrontman.color },
        activeAudit: null,
        overdueAudits: reallyOverdue,
      });
    }

    // Собираем сеты со ВСЕХ фронтменов пользователя
    const allSetsData = [];
    for (const fm of frontmen) {
      for (const setSlug of fm.sets) {
        const [total, reviewed] = await Promise.all([
          Product.countDocuments({ set: setSlug, brand: fm.brand }),
          ProductReview.countDocuments({
            audit: activeAudit._id,
            frontman: fm._id,
            'productSnapshot.set': setSlug
          }),
        ]);
        allSetsData.push({ slug: setSlug, total, reviewed, brand: fm.brand, frontmanId: fm._id });
      }
    }

    res.json({
      sets: allSetsData,
      frontman: { _id: primaryFrontman._id, name: primaryFrontman.name, brand: primaryFrontman.brand, color: primaryFrontman.color },
      activeAudit: {
        _id: activeAudit._id,
        name: activeAudit.name,
        deadline: activeAudit.deadline,
      },
      overdueAudits: reallyOverdue,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/review/set/:setSlug/all — все товары сета с отзывами
router.get('/review/set/:setSlug/all', async (req, res) => {
  try {
    const { auditId } = req.query;
    const frontman = await Frontman.findOne({ userId: req.user._id });
    if (!frontman) return res.status(403).json({ error: 'Вы не являетесь фронтменом' });
    if (!frontman.sets.includes(req.params.setSlug)) {
      return res.status(403).json({ error: 'Этот сет не в вашем ведении' });
    }

    // Определить аудит
    let audit;
    if (auditId) {
      audit = await Audit.findById(auditId);
    } else {
      audit = await Audit.findOne({ status: 'active' });
    }

    if (!audit) {
      return res.status(400).json({ error: 'Нет активного аудита' });
    }

    // Получить все товары сета
    const products = await Product.find({
      set: req.params.setSlug,
      brand: frontman.brand,
    })
      .select('name fullName sku set brand price priceWholesale stock stockStatus productStatus images driveImages specs')
      .sort({ name: 1 })
      .lean();

    // Получить отзывы для этого аудита
    const productIds = products.map(p => p._id);
    const reviews = await ProductReview.find({
      audit: audit._id,
      frontman: frontman._id,
      product: { $in: productIds },
    }).lean();

    const reviewMap = {};
    reviews.forEach(r => { reviewMap[r.product.toString()] = r; });

    const productsWithReviews = products.map(p => ({
      ...p,
      review: reviewMap[p._id.toString()] || null,
    }));

    const isCompleted = products.length > 0 && reviews.length === products.length;

    res.json({
      products: productsWithReviews,
      frontmanId: frontman._id,
      isCompleted,
      total: products.length,
      reviewed: reviews.length,
      audit: { _id: audit._id, name: audit.name, deadline: audit.deadline, status: audit.status },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/review — сохранить отзыв фронтмена
router.post('/review', async (req, res) => {
  try {
    const { productId, status, comment, suggestionPhotos, auditId } = req.body;

    if (!['keep', 'not_tried', 'improve', 'discontinue'].includes(status)) {
      return res.status(400).json({ error: 'Неверный статус' });
    }
    if ((status === 'not_tried' || status === 'improve' || status === 'discontinue') && !comment?.trim()) {
      return res.status(400).json({ error: 'Комментарий обязателен' });
    }

    const frontman = await Frontman.findOne({ userId: req.user._id });
    if (!frontman) return res.status(403).json({ error: 'Вы не являетесь фронтменом' });

    // Определить аудит
    let audit;
    if (auditId) {
      audit = await Audit.findById(auditId);
    } else {
      audit = await Audit.findOne({ status: 'active' });
    }

    if (!audit) {
      return res.status(400).json({ error: 'Нет активного аудита' });
    }

    // Нельзя редактировать завершённый аудит
    if (audit.status === 'completed') {
      return res.status(400).json({ error: 'Аудит уже завершён, редактирование недоступно' });
    }

    const product = await Product.findById(productId).lean();
    if (!product) return res.status(404).json({ error: 'Товар не найден' });

    if (!frontman.sets.includes(product.set)) {
      return res.status(403).json({ error: 'Этот товар не в вашем ведении' });
    }

    // Создать или обновить отзыв
    const review = await ProductReview.findOneAndUpdate(
      { audit: audit._id, product: productId, frontman: frontman._id },
      {
        audit: audit._id,
        product: productId,
        frontman: frontman._id,
        reviewer: req.user._id,
        status,
        comment: comment?.trim() || '',
        suggestionPhotos: suggestionPhotos || [],
        productSnapshot: {
          name: product.name,
          fullName: product.fullName,
          sku: product.sku,
          set: product.set,
          brand: product.brand,
          price: product.price,
          stock: product.stock,
          image: product.images?.[0] || '',
        },
      },
      { upsert: true, new: true }
    );

    // Обновить прогресс фронтмена в аудите
    const totalReviewed = await ProductReview.countDocuments({
      audit: audit._id,
      frontman: frontman._id,
    });
    const totalProducts = await Product.countDocuments({
      set: { $in: frontman.sets },
      brand: frontman.brand,
    });

    const isNowComplete = totalReviewed >= totalProducts;

    await Audit.updateOne(
      { _id: audit._id, 'frontmenProgress.frontman': frontman._id },
      {
        $set: {
          'frontmenProgress.$.reviewedProducts': totalReviewed,
          ...(isNowComplete && { 'frontmenProgress.$.completedAt': new Date() }),
        },
      }
    );

    res.json({ ok: true, review });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/review/results — результаты для админа (по сетам/статусам/аудитам)
router.get('/review/results', async (req, res) => {
  try {
    const { set, status, brand, auditId } = req.query;
    const match = {};

    // По умолчанию показываем активный аудит
    if (auditId) {
      match.audit = new (require('mongoose').Types.ObjectId)(auditId);
    } else {
      const activeAudit = await Audit.findOne({ status: 'active' });
      if (activeAudit) match.audit = activeAudit._id;
    }

    if (set)    match['productSnapshot.set']   = set;
    if (status) match.status = status;
    if (brand)  match['productSnapshot.brand'] = brand;

    const reviews = await ProductReview.find(match)
      .populate('audit', 'name deadline status')
      .populate('frontman', 'name color')
      .populate('reviewer', 'name email')
      .populate('product', 'images driveImages stock stockStatus productStatus')
      .sort({ updatedAt: -1 })
      .lean();

    res.json(reviews);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/review/stats — статистика по сетам для админа
router.get('/review/stats', async (req, res) => {
  try {
    const { auditId } = req.query;
    let auditMatch = {};

    if (auditId) {
      auditMatch.audit = new (require('mongoose').Types.ObjectId)(auditId);
    } else {
      const activeAudit = await Audit.findOne({ status: 'active' });
      if (activeAudit) auditMatch.audit = activeAudit._id;
    }

    const stats = await ProductReview.aggregate([
      { $match: auditMatch },
      {
        $group: {
          _id: { set: '$productSnapshot.set', status: '$status' },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.set',
          statuses: { $push: { status: '$_id.status', count: '$count' } },
          total: { $sum: '$count' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json(stats);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/review/frontmen-progress — прогресс фронтменов по аудиту
router.get('/review/frontmen-progress', async (req, res) => {
  try {
    const { auditId } = req.query;
    const ObjectId = require('mongoose').Types.ObjectId;

    let audit;
    if (auditId) {
      audit = await Audit.findById(auditId);
    } else {
      audit = await Audit.findOne({ status: 'active' });
    }
    if (!audit) return res.json([]);

    const frontmen = await Frontman.find().lean();
    const result = [];

    for (const fm of frontmen) {
      if (!fm.sets || fm.sets.length === 0) continue;

      const totalProducts = await Product.countDocuments({ set: { $in: fm.sets } });
      const reviewedCount = await ProductReview.countDocuments({
        audit: audit._id,
        frontman: fm._id
      });

      result.push({
        _id: fm._id,
        name: fm.name,
        color: fm.color,
        channel: fm.channel || null,
        sets: fm.sets,
        total: totalProducts,
        reviewed: reviewedCount,
        progress: totalProducts > 0 ? Math.round((reviewedCount / totalProducts) * 100) : 0,
        completed: totalProducts > 0 && reviewedCount >= totalProducts
      });
    }

    result.sort((a, b) => {
      if (a.channel !== b.channel) return (a.channel || 'zzz').localeCompare(b.channel || 'zzz');
      return b.progress - a.progress;
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/review/grouped — товары со всеми голосами фронтменов (для модалки)
router.get('/review/grouped', async (req, res) => {
  try {
    const { auditId, set, status } = req.query;
    const ObjectId = require('mongoose').Types.ObjectId;

    let auditMatch = {};
    if (auditId) {
      auditMatch.audit = new ObjectId(auditId);
    } else {
      const activeAudit = await Audit.findOne({ status: 'active' });
      if (activeAudit) auditMatch.audit = activeAudit._id;
    }

    if (set) auditMatch['productSnapshot.set'] = set;
    if (status) auditMatch.status = status;

    const reviews = await ProductReview.find(auditMatch)
      .populate('frontman', 'name color')
      .populate('product', 'images driveImages')
      .sort({ 'productSnapshot.fullName': 1 })
      .lean();

    // Группируем по productId
    const grouped = {};
    reviews.forEach(r => {
      const pid = r.product?._id?.toString() || r.productSnapshot?.sku;
      if (!grouped[pid]) {
        grouped[pid] = {
          productId: pid,
          productSnapshot: r.productSnapshot,
          product: r.product,
          votes: []
        };
      }
      grouped[pid].votes.push({
        frontman: r.frontman,
        status: r.status,
        comment: r.comment,
        updatedAt: r.updatedAt
      });
    });

    // Сортируем голоса по дате
    Object.values(grouped).forEach(g => {
      g.votes.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    });

    res.json(Object.values(grouped));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/admin/review/:id — удалить отзыв (editor+)
router.delete('/review/:id', editor, async (req, res) => {
  try {
    await ProductReview.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// FEEDBACK — обратная связь от фронтменов
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/admin/feedback — список всех заявок
router.get('/feedback', async (req, res) => {
  try {
    const { status, priority, frontman, product, limit = 50, skip = 0 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (frontman) filter.frontman = frontman;
    if (product) filter.product = product;

    const [feedbacks, total, newCount] = await Promise.all([
      Feedback.find(filter)
        .populate('product', 'name fullName sku images')
        .populate('frontman', 'name phone channel')
        .populate('assignedTo', 'name email')
        .sort({ createdAt: -1 })
        .skip(Number(skip))
        .limit(Number(limit)),
      Feedback.countDocuments(filter),
      Feedback.countDocuments({ status: 'new' })
    ]);

    res.json({ feedbacks, total, newCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/feedback/count — счётчик новых заявок (для бейджа в меню)
router.get('/feedback/count', async (req, res) => {
  try {
    const newCount = await Feedback.countDocuments({ status: 'new' });
    const inProgressCount = await Feedback.countDocuments({ status: 'in_progress' });
    res.json({ newCount, inProgressCount, total: newCount + inProgressCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/feedback/:id — одна заявка
router.get('/feedback/:id', async (req, res) => {
  try {
    const feedback = await Feedback.findById(req.params.id)
      .populate('product', 'name fullName sku images productStatus improvementHistory')
      .populate('frontman', 'name phone channel sets brand')
      .populate('assignedTo', 'name email')
      .populate('comments.author', 'name email')
      .populate('resolution.resolvedBy', 'name email');

    if (!feedback) return res.status(404).json({ error: 'Заявка не найдена' });
    res.json(feedback);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/feedback — создать заявку (от фронтмена)
router.post('/feedback', async (req, res) => {
  try {
    const { productId, frontmanId, type, priority, problem, alternatives } = req.body;

    if (!productId || !frontmanId || !type || !problem?.description) {
      return res.status(400).json({ error: 'Не все обязательные поля заполнены' });
    }

    const feedback = await Feedback.create({
      product: productId,
      frontman: frontmanId,
      type,
      priority: priority || 'medium',
      problem: {
        description: problem.description,
        media: problem.media || []
      },
      alternatives: {
        description: alternatives?.description || '',
        media: alternatives?.media || []
      },
      statusHistory: [{ from: null, to: 'new', changedBy: req.user._id }]
    });

    const populated = await Feedback.findById(feedback._id)
      .populate('product', 'name fullName sku images')
      .populate('frontman', 'name phone channel');

    res.status(201).json(populated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/admin/feedback/:id — обновить заявку (статус, решение, комментарий)
router.patch('/feedback/:id', editor, async (req, res) => {
  try {
    const feedback = await Feedback.findById(req.params.id);
    if (!feedback) return res.status(404).json({ error: 'Заявка не найдена' });

    const { status, resolution, comment, assignedTo, deadline, startedAt, improvementSpec } = req.body;
    const oldStatus = feedback.status;

    // Обновляем assignedTo
    if (assignedTo !== undefined) {
      feedback.assignedTo = assignedTo || null;
    }

    // Обновляем deadline
    if (deadline !== undefined) {
      feedback.deadline = deadline || null;
    }

    // Обновляем startedAt
    if (startedAt !== undefined) {
      feedback.startedAt = startedAt || null;
    }

    // Обновляем техлист
    if (improvementSpec) {
      feedback.improvementSpec = {
        description: improvementSpec.description || '',
        media: improvementSpec.media || [],
        createdAt: new Date(),
        createdBy: req.user._id,
      };
    }

    // Добавляем комментарий
    if (comment) {
      feedback.comments.push({
        author: req.user._id,
        authorName: req.user.name,
        text: comment
      });
    }

    // Меняем статус
    if (status && status !== oldStatus) {
      feedback.status = status;
      feedback.statusHistory.push({
        from: oldStatus,
        to: status,
        changedBy: req.user._id
      });

      // Если статус "в работе" — записываем startedAt
      if (status === 'in_progress' && !feedback.startedAt) {
        feedback.startedAt = new Date();
      }

      // Если статус "на улучшении" — проверяем наличие техлиста
      if (status === 'improvement') {
        const hasSpec = feedback.improvementSpec?.description || improvementSpec?.description;
        if (!hasSpec) {
          return res.status(400).json({ error: 'Нельзя отправить на улучшение без техлиста' });
        }
        await Product.findByIdAndUpdate(feedback.product, {
          productStatus: 'improvement'
        });
      }

      // Если статус "решена" — сохраняем решение и добавляем в историю улучшений
      if (status === 'resolved' && resolution) {
        feedback.resolution = {
          description: resolution.description || '',
          media: resolution.media || [],
          resolvedAt: new Date(),
          resolvedBy: req.user._id
        };

        // Возвращаем продукту статус "for_sale" и добавляем в историю
        const product = await Product.findById(feedback.product);
        if (product) {
          product.productStatus = 'for_sale';
          product.improvementHistory = product.improvementHistory || [];
          product.improvementHistory.push({
            feedbackId: feedback._id,
            date: new Date(),
            resolvedBy: req.user._id,
            resolvedByName: req.user.name,
            problem: feedback.problem.description,
            solution: resolution.description || '',
            beforeMedia: feedback.problem.media || [],
            afterMedia: resolution.media || []
          });
          await product.save();
        }
      }
    }

    await feedback.save();

    const populated = await Feedback.findById(feedback._id)
      .populate('product', 'name fullName sku images productStatus')
      .populate('frontman', 'name phone channel')
      .populate('assignedTo', 'name email')
      .populate('comments.author', 'name email');

    res.json(populated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/admin/feedback/:id — удалить заявку
router.delete('/feedback/:id', admin, async (req, res) => {
  try {
    await Feedback.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// TECH REQUESTS — заявки на техлист от навигаторов
// ══════════════════════════════════════════════════════════════════════════════

const TR_POPULATE = [
  { path: 'createdBy',  select: 'name email role' },
  { path: 'assignedTo', select: 'name email' },
];

// GET /api/admin/tech-requests — список заявок
router.get('/tech-requests', async (req, res) => {
  try {
    const { status, priority, createdBy, limit = 100, skip = 0 } = req.query;
    const filter = {};
    if (status)    filter.status = status;
    if (priority)  filter.priority = priority;
    if (createdBy) filter.createdBy = createdBy;

    const [requests, total, newCount] = await Promise.all([
      TechRequest.find(filter)
        .populate(TR_POPULATE)
        .sort({ createdAt: -1 })
        .skip(Number(skip))
        .limit(Number(limit)),
      TechRequest.countDocuments(filter),
      TechRequest.countDocuments({ status: 'new' }),
    ]);

    res.json({ requests, total, newCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/tech-requests/count — бейдж в меню
router.get('/tech-requests/count', async (req, res) => {
  try {
    const [newCount, inProgressCount] = await Promise.all([
      TechRequest.countDocuments({ status: 'new' }),
      TechRequest.countDocuments({ status: 'in_progress' }),
    ]);
    res.json({ newCount, inProgressCount, total: newCount + inProgressCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/tech-requests/:id — одна заявка
router.get('/tech-requests/:id', async (req, res) => {
  try {
    const request = await TechRequest.findById(req.params.id)
      .populate(TR_POPULATE)
      .populate('comments.author', 'name email')
      .populate('result.doneBy', 'name email');

    if (!request) return res.status(404).json({ error: 'Заявка не найдена' });
    res.json(request);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/tech-requests — создать заявку (навигатор)
router.post('/tech-requests', async (req, res) => {
  try {
    const { client, item, symbols, spec, priority, deadline } = req.body;

    if (!client?.name?.trim())      return res.status(400).json({ error: 'Укажите имя клиента' });
    if (!client?.legalStatus)       return res.status(400).json({ error: 'Укажите юридический статус клиента' });
    if (!item?.dimensions?.trim())  return res.status(400).json({ error: 'Укажите размеры изделия' });
    if (!item?.color?.trim())       return res.status(400).json({ error: 'Укажите цвет изделия' });
    if (!spec?.description?.trim()) return res.status(400).json({ error: 'Заполните техническое задание' });

    if (COMPANY_REQUIRED.includes(client.legalStatus) && !client.companyName?.trim()) {
      return res.status(400).json({ error: 'Для юридического лица обязательно название компании' });
    }

    const last = await TechRequest.findOne().sort({ number: -1 }).select('number');

    const request = await TechRequest.create({
      number: (last?.number || 0) + 1,
      createdBy: req.user._id,
      client: {
        name:        client.name.trim(),
        legalStatus: client.legalStatus,
        companyName: client.companyName?.trim() || '',
        phone:       client.phone?.trim() || '',
      },
      item: {
        name:       item.name?.trim() || '',
        dimensions: item.dimensions.trim(),
        color:      item.color.trim(),
        quantity:   Number(item.quantity) || 1,
      },
      symbols: {
        has:         !!symbols?.has,
        types:       symbols?.types || [],
        description: symbols?.description || '',
        media:       symbols?.media || [],
      },
      spec: {
        description: spec.description.trim(),
        media:       spec.media || [],
      },
      priority: priority || 'medium',
      deadline: deadline || null,
      statusHistory: [{ from: null, to: 'new', changedBy: req.user._id }],
    });

    const populated = await TechRequest.findById(request._id).populate(TR_POPULATE);
    res.status(201).json(populated);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// PATCH /api/admin/tech-requests/:id — статус, ответственный, срок, результат, комментарий
router.patch('/tech-requests/:id', editor, async (req, res) => {
  try {
    const request = await TechRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ error: 'Заявка не найдена' });

    const { status, assignedTo, deadline, priority, result, comment, rejectReason } = req.body;
    const oldStatus = request.status;

    if (assignedTo !== undefined) request.assignedTo = assignedTo || null;
    if (deadline   !== undefined) request.deadline   = deadline || null;
    if (priority)                 request.priority   = priority;
    if (rejectReason !== undefined) request.rejectReason = rejectReason;

    if (result) {
      request.result = {
        description: result.description || '',
        media:       result.media || [],
        doneAt:      new Date(),
        doneBy:      req.user._id,
      };
    }

    if (comment) {
      request.comments.push({ author: req.user._id, authorName: req.user.name, text: comment });
    }

    if (status && status !== oldStatus) {
      // Нельзя закрыть заявку без результата (готового техлиста)
      if (status === 'done' && !(request.result?.description || result?.description)) {
        return res.status(400).json({ error: 'Нельзя закрыть заявку без результата — опишите готовый техлист' });
      }
      request.status = status;
      request.statusHistory.push({ from: oldStatus, to: status, changedBy: req.user._id });
      if (status === 'in_progress' && !request.startedAt) request.startedAt = new Date();
    }

    await request.save();

    const populated = await TechRequest.findById(request._id)
      .populate(TR_POPULATE)
      .populate('comments.author', 'name email');

    res.json(populated);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// DELETE /api/admin/tech-requests/:id — удалить заявку
router.delete('/tech-requests/:id', admin, async (req, res) => {
  try {
    await TechRequest.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// =====================
// PRODUCT REQUESTS (фронтмен → заказ товара, инбокс Джипар)
// =====================

// Доступ к инбоксу заказов: владелец или пользователь с флагом canOrderProducts (Джипар)
const canOrders = (req, res, next) => {
  if (req.user?.role === 'owner' || req.user?.canOrderProducts) return next();
  return res.status(403).json({ message: 'Нет доступа к заказам товаров' });
};

const PR_TYPE_LABEL = { new: 'Новый товар', catalog: 'Заказ с каталога', test: 'Тестовый продукт', real: 'Заказ товара' };

// POST /api/admin/product-requests — создать заявку (любой фронтмен: protect+warehouse)
router.post('/product-requests', async (req, res) => {
  try {
    const { type, photo, photos, name, dimensions, color, note, product, sku } = req.body;

    if (!['new', 'catalog'].includes(type)) return res.status(400).json({ error: 'Выберите тип заявки' });
    if (!name?.trim())                      return res.status(400).json({ error: 'Укажите название товара' });

    const photoList = Array.isArray(photos) ? photos.filter(Boolean) : (photo ? [photo] : []);

    const last = await ProductRequest.findOne().sort({ number: -1 }).select('number');

    const request = await ProductRequest.create({
      number:        (last?.number || 0) + 1,
      createdBy:     req.user._id,
      createdByName: req.user.name || '',
      type,
      product:    (type === 'catalog' && isValidId(product)) ? product : undefined,
      sku:        (sku || '').trim(),
      photo:      photoList[0] || '',
      photos:     photoList,
      name:       name.trim(),
      dimensions: (dimensions || '').trim(),
      color:      (color || '').trim(),
      note:       (note || '').trim(),
      status:     'active',
    });

    // Уведомить Джипар в Telegram (если привязан бот)
    try {
      const recipients = await User.find({ $or: [{ canOrderProducts: true }] })
        .select('telegramChatId').lean();
      const caption = `🛒 Новая заявка №${request.number} · ${PR_TYPE_LABEL[type]}\n` +
        `Товар: ${request.name}\n` +
        (request.dimensions ? `Размеры: ${request.dimensions}\n` : '') +
        (request.color ? `Цвет: ${request.color}\n` : '') +
        (request.note ? `Примечание: ${request.note}\n` : '') +
        `От: ${request.createdByName || 'фронтмен'}`;
      for (const u of recipients) {
        if (!u.telegramChatId) continue;
        if (request.photo) await sendTelegramPhoto(u.telegramChatId, request.photo, caption);
        else               await sendTelegramMessage(u.telegramChatId, caption);
      }
    } catch (e) { console.error('[product-requests] telegram notify failed:', e.message); }

    res.status(201).json(request);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// GET /api/admin/product-requests/mine — свои заявки (для страницы фронтмена)
router.get('/product-requests/mine', async (req, res) => {
  try {
    const requests = await ProductRequest.find({ createdBy: req.user._id })
      .sort({ createdAt: -1 }).limit(50);
    res.json({ requests });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/product-requests/count — бейдж в меню (активные)
router.get('/product-requests/count', canOrders, async (req, res) => {
  try {
    const activeCount = await ProductRequest.countDocuments({ status: 'active' });
    res.json({ activeCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/product-requests — инбокс Джипар
router.get('/product-requests', canOrders, async (req, res) => {
  try {
    const { status, type } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (type)   filter.type   = type;

    const [requests, activeCount] = await Promise.all([
      ProductRequest.find(filter)
        .populate('createdBy', 'name email')
        .populate('doneBy', 'name')
        .sort({ createdAt: -1 })
        .limit(500),
      ProductRequest.countDocuments({ status: 'active' }),
    ]);
    res.json({ requests, activeCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/admin/product-requests/:id — отметить выполненной / вернуть в активные
router.patch('/product-requests/:id', canOrders, async (req, res) => {
  try {
    const request = await ProductRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ error: 'Заявка не найдена' });

    const { status } = req.body;
    if (status === 'done') {
      request.status     = 'done';
      request.doneBy     = req.user._id;
      request.doneByName = req.user.name || '';
      request.doneAt     = new Date();
    } else if (status === 'active') {
      request.status     = 'active';
      request.doneBy     = null;
      request.doneByName = '';
      request.doneAt     = null;
    }
    await request.save();
    const populated = await ProductRequest.findById(request._id)
      .populate('createdBy', 'name email').populate('doneBy', 'name');
    res.json(populated);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// DELETE /api/admin/product-requests/:id — удалить (владелец или Джипар)
router.delete('/product-requests/:id', canOrders, async (req, res) => {
  try {
    await ProductRequest.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/products/:id/improvements — история улучшений продукта
router.get('/products/:id/improvements', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .select('name fullName sku improvementHistory')
      .populate('improvementHistory.resolvedBy', 'name email');

    if (!product) return res.status(404).json({ error: 'Продукт не найден' });
    res.json(product.improvementHistory || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// =====================
// VIDEO SCHEDULE (фронтмен — планирование съёмок)
// =====================

// Все фронтмен-профили пользователя. Обычно один, но Кенжебек заведён в двух
// брендах (HOME + SHAAR), поэтому планирование должно объединять их сеты.
async function getUserFrontmen(userId) {
  return Frontman.find({ userId });
}
// Товары всех сетов пользователя: у каждого профиля свой бренд, поэтому $or по паре бренд+сеты.
const frontmenProductFilter = frontmen => ({
  $or: frontmen.map(f => ({ brand: f.brand, set: { $in: f.sets } })),
});

// GET /api/admin/video-schedule/my — получить данные текущего фронтмена
router.get('/video-schedule/my', protect, async (req, res) => {
  try {
    const frontmen = await getUserFrontmen(req.user._id);
    if (!frontmen.length) return res.status(403).json({ error: 'Вы не являетесь фронтменом' });
    const frontmanIds = frontmen.map(f => f._id);

    const products = await Product.find({
      ...frontmenProductFilter(frontmen),
      productStatus: { $in: ['for_sale', 'test_sale'] },
    }).select('name fullName sku set brand images driveImages hasVideo').lean();

    const schedules = await VideoSchedule.find({ frontman: { $in: frontmanIds } })
      .populate('product', 'name fullName sku set images driveImages hasVideo')
      .lean();

    const stats = {
      total: products.length,
      withVideo: products.filter(p => p.hasVideo).length,
      scheduled: schedules.length,
      completed: schedules.filter(s => s.isCompleted).length,
    };

    // Для шапки берём первый профиль, но отдаём и полный список брендов.
    res.json({ frontman: frontmen[0], frontmen, products, schedules, stats });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/video-schedule — запланировать съёмку
router.post('/video-schedule', protect, async (req, res) => {
  try {
    const frontmen = await getUserFrontmen(req.user._id);
    if (!frontmen.length) return res.status(403).json({ error: 'Вы не являетесь фронтменом' });

    const { productId, plannedDate } = req.body;

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ error: 'Товар не найден' });
    // Привязываем запись к профилю того бренда, которому принадлежит товар,
    // чтобы отчёты по HOME и SHAAR оставались раздельными.
    const frontman = frontmen.find(f => f.brand === product.brand && f.sets.includes(product.set));
    if (!frontman) {
      return res.status(403).json({ error: 'Этот товар не в вашем сете' });
    }

    // Товар повторяемый — можно снимать несколько раз.
    // Не допускаем лишь буквальный дубль: тот же товар, тот же день, ещё не снят.
    const planned = new Date(plannedDate);
    const dayStart = new Date(planned); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(planned); dayEnd.setHours(23, 59, 59, 999);
    const existing = await VideoSchedule.findOne({
      frontman: frontman._id,
      product: productId,
      isCompleted: false,
      plannedDate: { $gte: dayStart, $lte: dayEnd },
    });
    if (existing) {
      const populated = await VideoSchedule.findById(existing._id)
        .populate('product', 'name fullName sku set images driveImages hasVideo');
      return res.json(populated);
    }

    const schedule = await VideoSchedule.create({
      frontman: frontman._id,
      product: productId,
      plannedDate: new Date(plannedDate),
    });

    const populated = await VideoSchedule.findById(schedule._id)
      .populate('product', 'name fullName sku set images driveImages hasVideo');
    res.json(populated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/admin/video-schedule/:id/complete — отметить съёмку выполненной
router.patch('/video-schedule/:id/complete', protect, async (req, res) => {
  try {
    const frontmen = await getUserFrontmen(req.user._id);
    if (!frontmen.length) return res.status(403).json({ error: 'Вы не являетесь фронтменом' });
    const frontmanIds = frontmen.map(f => f._id.toString());

    const schedule = await VideoSchedule.findById(req.params.id);
    if (!schedule) return res.status(404).json({ error: 'Запись не найдена' });
    if (!frontmanIds.includes(schedule.frontman.toString())) {
      return res.status(403).json({ error: 'Это не ваша запись' });
    }

    schedule.isCompleted = true;
    // Отметка прошлой съёмки: клиент может передать дату, когда реально снимали.
    // Будущие/битые даты игнорируем — ставим текущий момент.
    const requested = req.body?.completedAt ? new Date(req.body.completedAt) : null;
    schedule.completedAt = requested && !isNaN(requested) && requested <= new Date()
      ? requested
      : new Date();
    await schedule.save();

    await Product.findByIdAndUpdate(schedule.product, { hasVideo: true });

    const populated = await VideoSchedule.findById(schedule._id)
      .populate('product', 'name fullName sku set images driveImages hasVideo');
    res.json(populated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/admin/video-schedule/:id/uncomplete — снять отметку о съёмке
router.patch('/video-schedule/:id/uncomplete', protect, async (req, res) => {
  try {
    const frontmen = await getUserFrontmen(req.user._id);
    if (!frontmen.length) return res.status(403).json({ error: 'Вы не являетесь фронтменом' });
    const frontmanIds = frontmen.map(f => f._id.toString());

    const schedule = await VideoSchedule.findById(req.params.id);
    if (!schedule) return res.status(404).json({ error: 'Запись не найдена' });
    if (!frontmanIds.includes(schedule.frontman.toString())) {
      return res.status(403).json({ error: 'Это не ваша запись' });
    }

    schedule.isCompleted = false;
    schedule.completedAt = null;
    await schedule.save();

    // hasVideo снимаем только если у товара не осталось других снятых съёмок
    const otherDone = await VideoSchedule.exists({
      product: schedule.product, isCompleted: true, _id: { $ne: schedule._id },
    });
    await Product.findByIdAndUpdate(schedule.product, { hasVideo: !!otherDone });

    const populated = await VideoSchedule.findById(schedule._id)
      .populate('product', 'name fullName sku set images driveImages hasVideo');
    res.json(populated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/admin/video-schedule/:id — удалить запись из расписания
router.delete('/video-schedule/:id', protect, async (req, res) => {
  try {
    const frontmen = await getUserFrontmen(req.user._id);
    if (!frontmen.length) return res.status(403).json({ error: 'Вы не являетесь фронтменом' });
    const frontmanIds = frontmen.map(f => f._id.toString());

    const schedule = await VideoSchedule.findById(req.params.id);
    if (!schedule) return res.status(404).json({ error: 'Запись не найдена' });
    if (!frontmanIds.includes(schedule.frontman.toString())) {
      return res.status(403).json({ error: 'Это не ваша запись' });
    }

    // Если удаляем выполненную съёмку — снимаем флаг с товара,
    // иначе hasVideo останется висеть без записи в расписании
    if (schedule.isCompleted) {
      const otherDone = await VideoSchedule.exists({
        product: schedule.product, isCompleted: true, _id: { $ne: schedule._id },
      });
      await Product.findByIdAndUpdate(schedule.product, { hasVideo: !!otherDone });
    }

    await VideoSchedule.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/video-schedule/report — отчёт по всем фронтменам (для админа)
router.get('/video-schedule/report', protect, viewer, async (req, res) => {
  try {
    const frontmen = await Frontman.find().populate('userId', 'name email').lean();

    const report = await Promise.all(frontmen.map(async (fm) => {
      const products = await Product.countDocuments({
        brand: fm.brand,
        set: { $in: fm.sets },
        productStatus: { $in: ['for_sale', 'test_sale'] },
      });

      const scheduled = await VideoSchedule.countDocuments({ frontman: fm._id });
      const completed = await VideoSchedule.countDocuments({ frontman: fm._id, isCompleted: true });

      // «Снято» — только собственные выполненные съёмки фронтмена.
      // hasVideo на товаре глобальный и может быть проставлен другим фронтменом с тем же сетом.
      return {
        frontman: { _id: fm._id, name: fm.name, color: fm.color, brand: fm.brand },
        user: fm.userId,
        stats: { total: products, withVideo: completed, scheduled, completed, remaining: products - completed },
      };
    }));

    res.json(report.filter(r => r.stats.total > 0));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/video-schedule/report/:frontmanId — детальный отчёт по одному фронтмену
router.get('/video-schedule/report/:frontmanId', protect, viewer, async (req, res) => {
  try {
    const fm = await Frontman.findById(req.params.frontmanId)
      .populate('userId', 'name email')
      .lean();
    if (!fm) return res.status(404).json({ error: 'Фронтмен не найден' });

    const products = await Product.find({
      brand: fm.brand,
      set: { $in: fm.sets },
      productStatus: { $in: ['for_sale', 'test_sale'] },
    }).select('name fullName sku set images driveImages hasVideo').lean();

    const schedules = await VideoSchedule.find({ frontman: fm._id })
      .populate('product', 'name fullName sku set images driveImages hasVideo')
      .sort({ plannedDate: 1 })
      .lean();

    // «Снято» — только собственные выполненные съёмки, а не глобальный hasVideo товара
    const completed = schedules.filter(s => s.isCompleted).length;
    const stats = {
      total: products.length,
      withVideo: completed,
      scheduled: schedules.length,
      completed,
    };

    res.json({ frontman: fm, user: fm.userId, products, schedules, stats });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
