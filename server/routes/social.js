// Автопубликации: подключённые площадки, схемы канваса и сами публикации.
// Монтируется как /api/admin/social. Права — как у публикации в Telegram: owner + editor.
const express = require('express');
const router  = express.Router();

const { protect, editor } = require('../middleware/auth');
const { SocialAccount, TelegramChat } = require('../models/SocialAccount');
const PublishFlow  = require('../models/PublishFlow');
const Publication  = require('../models/Publication');
const Product      = require('../models/Product');
const { buildProductText, captionFor, runPublication, PLATFORM_LABELS } = require('../lib/socialPublish');

router.use(protect, editor);

// ===== Площадки =====

router.get('/accounts', async (req, res) => {
  const accounts = await SocialAccount.find().sort({ platform: 1, title: 1 });
  res.json({ accounts: accounts.map(a => a.toPublicJSON()), labels: PLATFORM_LABELS });
});

router.post('/accounts', async (req, res) => {
  try {
    const { platform, title, config, postTypes, captionTemplate, enabled } = req.body || {};
    if (!['telegram', 'instagram', 'bitrix24'].includes(platform)) {
      return res.status(400).json({ message: 'Неизвестная платформа' });
    }
    if (!String(title || '').trim()) return res.status(400).json({ message: 'Укажите название площадки' });

    const acc = await SocialAccount.create({
      platform,
      title: String(title).trim(),
      config: config || {},
      postTypes: postTypes?.length ? postTypes : ['feed'],
      captionTemplate: captionTemplate || '',
      enabled: enabled !== false,
    });
    res.json({ account: acc.toPublicJSON() });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.patch('/accounts/:id', async (req, res) => {
  try {
    const acc = await SocialAccount.findById(req.params.id);
    if (!acc) return res.status(404).json({ message: 'Площадка не найдена' });

    const { title, config, postTypes, captionTemplate, enabled } = req.body || {};
    if (title !== undefined) acc.title = String(title).trim();
    if (postTypes !== undefined) acc.postTypes = postTypes;
    if (captionTemplate !== undefined) acc.captionTemplate = captionTemplate;
    if (enabled !== undefined) acc.enabled = !!enabled;
    if (config !== undefined) {
      // Токен приходит из UI замаскированным (••••1234) — такой пропускаем,
      // иначе сохранение любой другой настройки затирало бы рабочий токен.
      const next = { ...(acc.config || {}), ...config };
      if (typeof next.accessToken === 'string' && next.accessToken.startsWith('••••')) {
        next.accessToken = acc.config?.accessToken || '';
      }
      acc.config = next;
      acc.markModified('config');
    }
    await acc.save();
    res.json({ account: acc.toPublicJSON() });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.delete('/accounts/:id', async (req, res) => {
  await SocialAccount.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// POST /accounts/:id/check — проверка связи без публикации: доступен ли чат / жив ли токен.
router.post('/accounts/:id/check', async (req, res) => {
  const acc = await SocialAccount.findById(req.params.id);
  if (!acc) return res.status(404).json({ message: 'Площадка не найдена' });

  try {
    if (acc.platform === 'telegram') {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) return res.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN не задан на сервере' });
      const r = await fetch(`https://api.telegram.org/bot${token}/getChat?chat_id=${encodeURIComponent(acc.config?.chatId || '')}`);
      const d = await r.json();
      return res.json(d.ok
        ? { ok: true, info: d.result.title || d.result.username || String(d.result.id) }
        : { ok: false, error: d.description });
    }

    if (acc.platform === 'instagram') {
      const { igUserId, accessToken } = acc.config || {};
      if (!igUserId || !accessToken) return res.json({ ok: false, error: 'Не заданы igUserId / accessToken' });
      const r = await fetch(`https://graph.facebook.com/v21.0/${igUserId}?fields=username,name&access_token=${encodeURIComponent(accessToken)}`);
      const d = await r.json();
      return res.json(d.error
        ? { ok: false, error: d.error.message }
        : { ok: true, info: '@' + (d.username || d.name || igUserId) });
    }

    // Битрикс24 — вебхук общий с каталогом, проверяем, что он вообще отвечает.
    const { call } = require('../utils/bitrix24');
    const me = await call('profile', {});
    return res.json({ ok: true, info: me?.NAME ? `${me.NAME} ${me.LAST_NAME || ''}`.trim() : 'вебхук отвечает' });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// GET /telegram/chats — чаты, где бота уже видели (заполняет вебхук в index.js).
// Избавляет от ручного поиска chat_id: добавил бота в группу, написал туда — и он в списке.
router.get('/telegram/chats', async (req, res) => {
  const chats = await TelegramChat.find().sort({ seenAt: -1 }).limit(50).lean();
  res.json({ chats, botConfigured: !!process.env.TELEGRAM_BOT_TOKEN });
});

// ===== Схемы (канвас) =====

router.get('/flows', async (req, res) => {
  const flows = await PublishFlow.find().sort({ isDefault: -1, updatedAt: -1 }).lean();
  res.json({ flows });
});

router.post('/flows', async (req, res) => {
  try {
    const { name, nodes, edges, isDefault } = req.body || {};
    if (!String(name || '').trim()) return res.status(400).json({ message: 'Укажите название схемы' });
    if (isDefault) await PublishFlow.updateMany({}, { $set: { isDefault: false } });
    const flow = await PublishFlow.create({
      name: String(name).trim(), nodes: nodes || [], edges: edges || [],
      isDefault: !!isDefault, createdBy: req.user._id,
    });
    res.json({ flow });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.patch('/flows/:id', async (req, res) => {
  try {
    const { name, nodes, edges, isDefault } = req.body || {};
    if (isDefault) await PublishFlow.updateMany({ _id: { $ne: req.params.id } }, { $set: { isDefault: false } });
    const flow = await PublishFlow.findByIdAndUpdate(req.params.id, {
      ...(name !== undefined ? { name: String(name).trim() } : {}),
      ...(nodes !== undefined ? { nodes } : {}),
      ...(edges !== undefined ? { edges } : {}),
      ...(isDefault !== undefined ? { isDefault: !!isDefault } : {}),
    }, { new: true });
    if (!flow) return res.status(404).json({ message: 'Схема не найдена' });
    res.json({ flow });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.delete('/flows/:id', async (req, res) => {
  await PublishFlow.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// GET /flows/:id/targets — площадки, подключённые в схеме (для предзаполнения формы публикации).
router.get('/flows/:id/targets', async (req, res) => {
  const flow = await PublishFlow.findById(req.params.id);
  if (!flow) return res.status(404).json({ message: 'Схема не найдена' });
  res.json({ targets: flow.targets() });
});

// ===== Публикации =====

// Черновик текста по товару — тот же, что уходит в предпросмотр.
router.get('/draft/:productId', async (req, res) => {
  const p = await Product.findById(req.params.productId).lean();
  if (!p) return res.status(404).json({ message: 'Товар не найден' });
  res.json({
    text: buildProductText(p),
    images: [
      ...(p.images || []).filter(u => u && u.startsWith('http')),
      ...(p.driveImages || []).filter(Boolean).map(id => `https://drive.google.com/thumbnail?id=${id}&sz=w1200`),
    ],
    product: { _id: p._id, name: p.name, fullName: p.fullName, price: p.price, priceUndefined: p.priceUndefined },
  });
});

// POST /preview — как будет выглядеть текст на каждой выбранной площадке.
router.post('/preview', async (req, res) => {
  try {
    const { productId, text, targets } = req.body || {};
    const product = productId ? await Product.findById(productId).lean() : null;
    const accounts = await SocialAccount.find({ _id: { $in: (targets || []).map(t => t.accountId) } });
    const byId = Object.fromEntries(accounts.map(a => [String(a._id), a]));

    res.json({
      previews: (targets || []).map(t => {
        const account = byId[String(t.accountId)];
        return {
          accountId: t.accountId,
          title:     account?.title || '—',
          platform:  account?.platform || '',
          postType:  t.postType || 'feed',
          caption:   captionFor({ nodeTemplate: t.captionTemplate, account, product, text }),
        };
      }),
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /publications — создать публикацию и разослать (или запланировать).
// body: { kind, productId, text, images, flowId, scheduledAt,
//         targets: [{ accountId, postType, captionTemplate, delayMinutes }] }
router.post('/publications', async (req, res) => {
  try {
    const { kind = 'product', productId, text, images, flowId, targets, scheduledAt } = req.body || {};
    if (!Array.isArray(targets) || !targets.length) {
      return res.status(400).json({ message: 'Не выбрана ни одна площадка' });
    }
    if (!String(text || '').trim()) return res.status(400).json({ message: 'Пустой текст поста' });

    const product  = productId ? await Product.findById(productId).lean() : null;
    const accounts = await SocialAccount.find({ _id: { $in: targets.map(t => t.accountId) } });
    const byId = Object.fromEntries(accounts.map(a => [String(a._id), a]));

    const base = scheduledAt ? new Date(scheduledAt) : new Date();
    const pubTargets = targets.map(t => {
      const account = byId[String(t.accountId)];
      return {
        account:  t.accountId,
        platform: account?.platform || '',
        title:    account?.title || '',
        postType: t.postType || 'feed',
        caption:  captionFor({ nodeTemplate: t.captionTemplate, account, product, text }),
        dueAt:    new Date(base.getTime() + (Number(t.delayMinutes) || 0) * 60 * 1000),
        status:   'pending',
      };
    }).filter(t => t.platform); // площадка могла быть удалена, пока форма была открыта

    if (!pubTargets.length) return res.status(400).json({ message: 'Выбранные площадки не найдены' });

    const pub = await Publication.create({
      kind,
      product:     product?._id,
      productName: product ? (product.fullName || product.name || '') : '',
      text:        String(text).trim(),
      images:      (images || []).filter(Boolean),
      flow:        flowId || undefined,
      targets:     pubTargets,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      createdBy:   req.user._id,
    });

    // Отложенное уходит по тику планировщика, немедленное публикуем прямо сейчас.
    if (scheduledAt && new Date(scheduledAt) > new Date()) {
      return res.json({ publication: pub, scheduled: true });
    }
    const result = await runPublication(pub._id);
    res.json({ publication: result.publication || pub, published: result.published, failed: result.failed });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.get('/publications', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const pubs = await Publication.find()
    .sort({ createdAt: -1 }).limit(limit)
    .populate('createdBy', 'name')
    .lean();
  res.json({ publications: pubs });
});

router.get('/publications/:id', async (req, res) => {
  const pub = await Publication.findById(req.params.id).populate('createdBy', 'name').lean();
  if (!pub) return res.status(404).json({ message: 'Публикация не найдена' });
  res.json({ publication: pub });
});

// POST /publications/:id/retry — повторить только упавшие площадки.
router.post('/publications/:id/retry', async (req, res) => {
  try {
    const result = await runPublication(req.params.id, { onlyFailed: true });
    if (result.error) return res.status(404).json({ message: result.error });
    res.json(result);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.delete('/publications/:id', async (req, res) => {
  await Publication.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
