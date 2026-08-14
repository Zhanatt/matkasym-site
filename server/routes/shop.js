/**
 * Публичный API Telegram-магазина (Mini App).
 *
 *   GET  /api/shop/filters            — сеты и бренды с количеством товаров
 *   GET  /api/shop/products           — витрина: поиск, фильтр по сету, постранично
 *   GET  /api/shop/products/:id       — карточка товара
 *   POST /api/shop/requests           — заявка «Уточнить наличие» → сделка в Битриксе
 *   GET  /api/shop/requests/my        — заявки этого Telegram-пользователя
 *
 * Авторизации нет и быть не может: магазин открывают из канала. Клиента опознаём
 * по подписанному initData Telegram (lib/tgWebApp.js) — заявку без него не принимаем.
 */
const router  = require('express').Router();
const Product = require('../models/Product');
const ShopRequest = require('../models/ShopRequest');
const { tgAuth } = require('../lib/tgWebApp');
const { createShopDeal } = require('../lib/shopBitrix');
const { notifyRequestAccepted, notifyManagerNewRequest } = require('../lib/shopNotify');

// Витрина: только то, что человек может купить сегодня.
// Остаток — по Кыргызстану (Product.stock = Make-in + Matkasym), казахстанский склад
// живёт отдельно. Товар без цены показывать нельзя: клиент не поймёт, за что платит.
// Ликвидация — тоже витрина: это товар на складе, который как раз нужно распродать.
// Всё остальное (планы, разработка, тестовые продажи, детали комплектов) — внутренние
// статусы, покупателю их показывать нечего.
const SHOP_FILTER = {
  stock:         { $gt: 0 },
  productStatus: { $in: ['for_sale', 'liquidation'] },
  price:         { $gt: 0 },
  priceUndefined: { $ne: true },
};

// Поля карточки в списке. Всё остальное (specs, описание) — только в детальном запросе:
// витрину листают в мобильном интернете, лишние килобайты там дороже.
const LIST_FIELDS = 'name fullName sku price stock brand set color images driveImages isKit kitType';

const escapeRegex = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── Витрина ─────────────────────────────────────────────────────────────────
router.get('/filters', async (_req, res) => {
  try {
    const rows = await Product.aggregate([
      { $match: SHOP_FILTER },
      { $group: { _id: { brand: '$brand', set: '$set' }, count: { $sum: 1 } } },
    ]);

    const sets = new Map();
    const brands = new Map();
    for (const r of rows) {
      const set = r._id.set || '';
      const brand = r._id.brand || '';
      if (set) sets.set(set, (sets.get(set) || 0) + r.count);
      if (brand) brands.set(brand, (brands.get(brand) || 0) + r.count);
    }

    res.json({
      total:  rows.reduce((n, r) => n + r.count, 0),
      sets:   [...sets].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count),
      brands: [...brands].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/products', async (req, res) => {
  try {
    const page  = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(48, Math.max(1, Number(req.query.limit) || 24));
    const query = { ...SHOP_FILTER };

    if (req.query.set)   query.set = String(req.query.set);
    if (req.query.brand) query.brand = String(req.query.brand);

    const search = String(req.query.search || '').trim();
    if (search) {
      const re = new RegExp(escapeRegex(search), 'i');
      query.$or = [{ name: re }, { fullName: re }, { sku: re }, { tags: re }];
    }

    const [items, total] = await Promise.all([
      Product.find(query, LIST_FIELDS)
        // Сначала то, чего много на складе: такой заказ менеджер закроет наверняка
        .sort({ stock: -1, name: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Product.countDocuments(query),
    ]);

    res.json({ items, total, page, pages: Math.ceil(total / limit) || 1 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/products/:id', async (req, res) => {
  try {
    const p = await Product.findOne({ _id: req.params.id, ...SHOP_FILTER },
      `${LIST_FIELDS} description specs dimensions category`).lean();
    if (!p) return res.status(404).json({ error: 'Товар не найден или его сейчас нет в продаже' });
    res.json(p);
  } catch (e) {
    res.status(400).json({ error: 'Неверный id товара' });
  }
});

// ── Заявки ──────────────────────────────────────────────────────────────────
// Простой лимит: одна и та же кнопка, нажатая десять раз подряд, не должна
// наплодить десять сделок. Память процесса — на Render один инстанс, этого хватает.
const recent = new Map();   // tgUserId → [timestamp]
const RATE_WINDOW = 60 * 60 * 1000;
const RATE_MAX    = 10;

function rateLimited(userId) {
  const now = Date.now();
  const hits = (recent.get(userId) || []).filter(t => now - t < RATE_WINDOW);
  hits.push(now);
  recent.set(userId, hits);
  return hits.length > RATE_MAX;
}

router.post('/requests', tgAuth, async (req, res) => {
  const tgUser = req.tgUser;
  if (!tgUser) {
    // Код причины уходит клиенту специально: «не отправляется» без него — гадание.
    // Тексты разные, потому что чинится это по-разному: no_bot_token — настройка сервера,
    // expired — достаточно переоткрыть приложение.
    const TEXT = {
      no_bot_token: 'Магазин не настроен: на сервере нет токена бота. Напишите нам, мы починим',
      expired:      'Сессия устарела — закройте и откройте магазин заново',
      bad_hash:     'Не удалось подтвердить, что заявка из Telegram. Закройте и откройте магазин заново',
    };
    return res.status(401).json({
      error: TEXT[req.tgReason] || 'Откройте магазин через Telegram — так мы поймём, кому отвечать',
      code:  req.tgReason || 'no_init_data',
    });
  }
  if (rateLimited(tgUser.id)) {
    return res.status(429).json({ error: 'Слишком много заявок подряд. Менеджер уже видит предыдущие — подождите, пожалуйста' });
  }

  try {
    const { productId, qty = 1, name = '', phone = '', comment = '', notifyOnRestock = true } = req.body || {};

    const digits = String(phone).replace(/\D/g, '');
    if (digits.length < 9) {
      return res.status(400).json({ error: 'Укажите номер телефона — менеджер перезвонит по нему' });
    }

    const product = await Product.findById(productId,
      `${LIST_FIELDS} priceUndefined productStatus`).lean();
    if (!product) return res.status(404).json({ error: 'Товар не найден' });

    const request = await ShopRequest.create({
      product: product._id,
      snapshot: {
        name:  product.fullName || product.name || '',
        sku:   product.sku || '',
        price: product.price || 0,
        stock: product.stock || 0,
        image: product.images?.[0] || '',
        set:   product.set || '',
        brand: product.brand || '',
      },
      qty:     Math.min(999, Math.max(1, Number(qty) || 1)),
      comment: String(comment).slice(0, 500),
      customer: {
        tgUserId:   tgUser.id,
        tgUsername: tgUser.username,
        tgName:     tgUser.name,
        name:       String(name).slice(0, 120) || tgUser.name,
        phone:      String(phone).slice(0, 40),
      },
      notifyOnRestock: !!notifyOnRestock,
    });

    // Сделка — главное, ради чего всё затевалось, но заявку она блокировать не должна:
    // при недоступном Битриксе менеджер увидит её в админке, а причина ляжет в bitrix.error.
    const deal = await createShopDeal({ request, product, tgUser });
    request.bitrix = { dealId: deal.dealId || '', error: deal.error || '' };
    await request.save();

    // Сообщения в Telegram — уже после ответа клиенту: он не должен ждать Bot API.
    res.json({ ok: true, requestId: request._id, dealId: deal.dealId || null });

    notifyRequestAccepted(request).catch(e => console.error('[shop] клиенту не ушло:', e.message));
    notifyManagerNewRequest(request).catch(e => console.error('[shop] менеджеру не ушло:', e.message));
  } catch (e) {
    console.error('[shop] заявка не создана:', e.message);
    if (!res.headersSent) res.status(500).json({ error: 'Не удалось отправить заявку: ' + e.message });
  }
});

router.get('/requests/my', tgAuth, async (req, res) => {
  if (!req.tgUser) return res.json({ items: [] });
  try {
    const items = await ShopRequest.find({ 'customer.tgUserId': req.tgUser.id })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('snapshot qty status createdAt notifyOnRestock')
      .lean();
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
