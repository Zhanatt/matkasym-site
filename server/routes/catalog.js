/**
 * GET /api/catalog          — все товары (контекст для AI-бота)
 * GET /api/catalog/search   — поиск по названию / тегам / описанию
 * GET /api/catalog/:id      — один товар по ID
 *
 * Защита: заголовок  X-API-Key: <CATALOG_API_KEY>
 */
const router  = require('express').Router();
const Product = require('../models/Product');

// ── Категории (для читаемого вывода) ────────────────────────────────────────
const CATEGORY_LABELS = {
  'clothes-dryer':     'Сушилка для белья',
  'ironing-board':     'Гладильная доска',
  'ironing-board-ext': 'Гладильная доска с удлинителем',
  'laundry-basket':    'Корзина для белья',
  'suit-hanger':       'Костюмная вешалка',
  'wardrobe-rack':     'Гардеробная вешалка',
  'wall-hanger':       'Настенная вешалка',
  'floor-hanger':      'Напольная вешалка',
  'shoe-rack':         'Обувная полка',
  'shoe-bench':        'Обувная полка с сидушкой',
  'shelf-toilet':      'Над-унитазная полка',
  'shelf-washer':      'Над-стиральная полка',
  'shelf-corner':      'Угловая полка',
  'shelf-flowers':     'Полка для цветов',
  'mirror-floor':      'Напольное зеркало',
  'bbq-grill':         'Мангал',
  'antenna-outdoor':   'Антенна наружная',
  'antenna-indoor':    'Антенна комнатная',
  'tv-mount':          'Кронштейн для TV',
  'other':             'Другое',
};

const STATUS_LABELS = {
  for_sale:       'В продаже',
  planned:        'В плане',
  in_development: 'В разработке',
  improvement:    'На улучшении',
  discontinued:   'Снят с производства',
};

const STOCK_LABELS = {
  in_stock:     'В наличии',
  out_of_stock: 'Нет в наличии',
  expected:     'Ожидается',
};

// ── API-key middleware ───────────────────────────────────────────────────────
function apiKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!process.env.CATALOG_API_KEY || key !== process.env.CATALOG_API_KEY) {
    return res.status(401).json({ error: 'Неверный или отсутствующий API-ключ' });
  }
  next();
}

// ── Форматирование товара для AI-бота ───────────────────────────────────────
function format(p) {
  const stockLabel = STOCK_LABELS[p.stockStatus] || 'Неизвестно';
  const available  = p.stock > 0;

  return {
    id:            p._id,
    name:          p.name,
    fullName:      p.fullName,
    brand:         p.brand?.replace('matkasym-', '').toUpperCase() || '',
    set:           p.set   || null,
    category:      p.category,
    categoryLabel: CATEGORY_LABELS[p.category] || p.category,
    color:         p.color || null,

    // Цены
    price:          p.price,           // розничная (на сайте)
    priceWholesale: p.priceWholesale || null,  // оптовая
    priceDealer:    p.priceDealer    || null,  // дилерская

    // Наличие
    inStock:     available,
    stock:       p.stock,
    stockStatus: stockLabel,

    // Статус товара
    productStatus:    STATUS_LABELS[p.productStatus] || p.productStatus,
    developmentStage: p.developmentStage || null,

    // Характеристики
    dimensions: p.dimensions || null,
    specs:      (p.specs || []).map(s => ({ [s.key]: s.value })),

    // Описание и теги
    description: p.description || null,
    tags:        p.tags || [],

    // Флаги
    isNew: p.isNew || false,
    sku:   p.sku   || null,
  };
}

// ── GET /api/catalog ─────────────────────────────────────────────────────────
// Возвращает все активные товары (for_sale + in_development + improvement)
// Query params:
//   brand, set, category, inStock (true/false), productStatus
router.get('/', apiKey, async (req, res) => {
  try {
    const { brand, set, category, inStock, productStatus } = req.query;

    const filter = {
      // По умолчанию только товары которые реально существуют
      productStatus: { $in: ['for_sale', 'improvement', 'in_development'] },
    };

    if (brand)         filter.brand = brand;
    if (set)           filter.set   = set;
    if (category)      filter.category = category;
    if (inStock === 'true')  filter.stock = { $gt: 0 };
    if (inStock === 'false') filter.stock = 0;
    if (productStatus) filter.productStatus = productStatus;

    const products = await Product
      .find(filter)
      .select('-driveImages -images -__v')
      .sort({ set: 1, name: 1 });

    res.json({
      total: products.length,
      updatedAt: new Date().toISOString(),
      products: products.map(format),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/catalog/search?q=... ────────────────────────────────────────────
router.get('/search', apiKey, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: 'Укажите параметр q' });

    const products = await Product.find({
      productStatus: { $in: ['for_sale', 'improvement', 'in_development'] },
      $or: [
        { name:        { $regex: q, $options: 'i' } },
        { fullName:    { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { tags:        { $regex: q, $options: 'i' } },
        { category:    { $regex: q, $options: 'i' } },
        { set:         { $regex: q, $options: 'i' } },
      ],
    })
      .select('-driveImages -images -__v')
      .sort({ name: 1 })
      .limit(20);

    res.json({
      query: q,
      total: products.length,
      products: products.map(format),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/catalog/:id ─────────────────────────────────────────────────────
router.get('/:id', apiKey, async (req, res) => {
  try {
    const product = await Product
      .findById(req.params.id)
      .select('-driveImages -images -__v');
    if (!product) return res.status(404).json({ error: 'Товар не найден' });
    res.json(format(product));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
