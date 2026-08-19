// Автопубликации: подключённые площадки, схемы канваса и сами публикации.
// Монтируется как /api/admin/social. Права — как у публикации в Telegram: owner + editor.
const express = require('express');
const router  = express.Router();

const { protect, editor } = require('../middleware/auth');
const { SocialAccount, TelegramChat } = require('../models/SocialAccount');
const PublishFlow  = require('../models/PublishFlow');
const Publication  = require('../models/Publication');
const Counter      = require('../models/Counter');
const Product      = require('../models/Product');
const { buildProductText, captionFor, runPublication, unpublishPublication,
        refreshStats, refreshRecentStats, STATS_PLATFORMS,
        recentlyPublished, DUPLICATE_WINDOW_MS, PLATFORM_LABELS } = require('../lib/socialPublish');
const { normLang } = require('../lib/postLang');
const { postTitle } = require('../lib/postCaption');
const { manualName } = require('../lib/postNames');

router.use(protect, editor);

// Все даты в отчётах считаем по Бишкеку: сервер на Render в UTC, разница 6 часов.
const TZ = 'Asia/Bishkek';

// Время отложенной публикации. Новый фронт шлёт ISO с зоной, но старая вкладка
// могла остаться открытой и прислать «голое» значение datetime-local
// («2026-08-12T20:00») — Node на Render прочитал бы его как UTC и сдвинул пост
// на 6 часов вперёд. Такое значение трактуем как бишкекское время (UTC+6, DST в
// Кыргызстане нет). Вернёт null, если строки нет; Invalid Date — если мусор.
function parseScheduledAt(value) {
  const s = String(value || '').trim();
  if (!s) return null;
  const naive = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s);
  return new Date(naive ? `${s}+06:00` : s);
}

// ===== Площадки =====

router.get('/accounts', async (req, res) => {
  const accounts = await SocialAccount.find().sort({ platform: 1, title: 1 });
  res.json({ accounts: accounts.map(a => a.toPublicJSON()), labels: PLATFORM_LABELS });
});

router.post('/accounts', async (req, res) => {
  try {
    const { platform, title, config, postTypes, captionTemplate, enabled } = req.body || {};
    if (!['telegram', 'instagram', 'facebook', 'bitrix24', 'site'].includes(platform)) {
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

// Ошибки Meta приходят англоязычной простынёй, из которой не видно, что делать.
// Переводим типовые случаи в инструкцию: почти всегда лечится перевыпуском токена.
// Общая для Instagram и Facebook — API и ошибки у них одни и те же.
const META_SCOPES = 'pages_show_list, pages_read_engagement, pages_manage_posts, '
  + 'instagram_basic, instagram_content_publish';

function metaError(err = {}) {
  const msg = String(err.message || '');
  if (/pages_manage_posts/i.test(msg)) {
    return 'У токена нет права публиковать на странице (pages_manage_posts). Перевыпустите токен '
      + `в Graph API Explorer с разрешениями ${META_SCOPES} — и возьмите токен САМОЙ СТРАНИЦЫ `
      + '(GET /me/accounts), а не пользователя.';
  }
  if (/permission\(s\) must be granted|pages_show_list|pages_read_engagement/i.test(msg)) {
    return 'У токена нет прав на страницу. Перевыпустите его в Graph API Explorer с разрешениями '
      + `${META_SCOPES} — и возьмите токен САМОЙ СТРАНИЦЫ (GET /me/accounts), а не пользователя.`;
  }
  if (/expired|Session has expired/i.test(msg)) {
    return 'Токен истёк. Выпустите новый долгоживущий токен страницы и вставьте его в «Изменить».';
  }
  if (Number(err.code) === 190) {
    return `Токен недействителен: ${msg}`;
  }
  return msg || 'Meta API error';
}

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
        ? { ok: false, error: metaError(d.error) }
        : { ok: true, info: '@' + (d.username || d.name || igUserId) });
    }

    // Facebook: мало достучаться до страницы — надо убедиться, что токен ещё и
    // писать умеет. Права видно только через debug_token, а не по ответу страницы,
    // иначе «связь есть» показывалось бы вплоть до самой неудачной публикации.
    if (acc.platform === 'facebook') {
      const { pageId, accessToken } = acc.config || {};
      if (!pageId || !accessToken) return res.json({ ok: false, error: 'Не заданы pageId / accessToken' });

      const enc = encodeURIComponent(accessToken);
      const r = await fetch(`https://graph.facebook.com/v21.0/${pageId}?fields=name,fan_count&access_token=${enc}`);
      const d = await r.json();
      if (d.error) return res.json({ ok: false, error: metaError(d.error) });

      const dbg = await fetch(`https://graph.facebook.com/v21.0/debug_token?input_token=${enc}&access_token=${enc}`)
        .then(x => x.json()).catch(() => ({}));
      const info = dbg.data || {};

      if (info.type && info.type !== 'PAGE') {
        return res.json({ ok: false, error: 'Это токен пользователя, а не страницы. Возьмите access_token из GET /me/accounts.' });
      }
      if (Array.isArray(info.scopes) && !info.scopes.includes('pages_manage_posts')) {
        return res.json({ ok: false, error: metaError({ message: 'pages_manage_posts' }) });
      }

      // expires_at: 0 = бессрочный. data_access_expires_at — отдельный срок:
      // токен ещё жив, а доступ к данным Meta уже отключила.
      const parts = [d.name || pageId];
      if (d.fan_count) parts.push(`${Number(d.fan_count).toLocaleString('ru-RU')} подписчиков`);
      parts.push(info.expires_at === 0 ? 'токен бессрочный' : 'токен со сроком');
      if (info.data_access_expires_at) {
        parts.push('доступ к данным до ' + new Date(info.data_access_expires_at * 1000).toLocaleDateString('ru-RU'));
      }
      return res.json({ ok: true, info: parts.join(' · ') });
    }

    // Сайт — своя же база, проверять связь не с кем. Показываем, скольким сотрудникам
    // новость попадёт в ленту: если получателей ноль, публиковать бессмысленно.
    if (acc.platform === 'site') {
      const User = require('../models/User');
      const n = await User.countDocuments({ role: { $in: ['owner', 'editor', 'viewer'] }, isPending: false });
      return res.json(n
        ? { ok: true, info: `лента новостей · получателей: ${n}` }
        : { ok: false, error: 'Нет ни одного сотрудника — новость никто не увидит' });
    }

    // Битрикс24 — вебхук общий с каталогом, проверяем, что он вообще отвечает.
    if (acc.platform === 'bitrix24') {
      const { call } = require('../utils/bitrix24');
      const me = await call('profile', {});
      return res.json({ ok: true, info: me?.NAME ? `${me.NAME} ${me.LAST_NAME || ''}`.trim() : 'вебхук отвечает' });
    }

    // Раньше Битрикс стоял здесь без проверки платформы, как «всё остальное»,
    // и новая площадка на ещё не обновлённом сервере получала зелёное «связь есть»
    // с именем владельца битрикс-вебхука. Неизвестную платформу честно называем.
    return res.json({ ok: false, error: `Проверка для «${acc.platform}» не реализована — обновите сервер` });
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

// GET /publish-stats — сколько раз и куда уже публиковали каждый товар.
// Нужно в поиске на странице публикации: видно, что товар недавно постили,
// и не выйдет случайного повтора. Считаем только реально ушедшие посты.
router.get('/publish-stats', async (req, res) => {
  try {
    const rows = await Publication.aggregate([
      { $match: { product: { $ne: null } } },
      { $unwind: '$targets' },
      { $match: { 'targets.status': 'published' } },
      { $group: {
        _id:  { product: '$product', platform: '$targets.platform' },
        n:    { $sum: 1 },
        last: { $max: '$updatedAt' },
      } },
    ]);

    const byProduct = {};
    for (const r of rows) {
      const id = String(r._id.product);
      const e = byProduct[id] || (byProduct[id] = { counts: {}, last: null });
      e.counts[r._id.platform] = r.n;
      if (!e.last || r.last > e.last) e.last = r.last;
    }
    res.json(byProduct);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// GET /report?days=30 — кто сколько публикаций сделал, с разбивкой по дням.
// Нужно, чтобы видеть выработку дизайнеров: журнал показывает последние 50 записей
// подряд и на вопрос «сколько за неделю сделала Мадина» не отвечает.
//
// days=0 — за всё время.
router.get('/report', async (req, res) => {
  try {
    const days = Math.min(Number(req.query.days) || 30, 365);
    const match = {};
    if (days > 0) {
      const from = new Date();
      from.setHours(0, 0, 0, 0);
      from.setDate(from.getDate() - (days - 1));
      match.createdAt = { $gte: from };
    }

    // Группируем по бишкекскому дню, а не по UTC: сервер на Render живёт в UTC,
    // и публикация, сделанная вечером по Бишкеку, попадала бы в предыдущие сутки.
    const rows = await Publication.aggregate([
      { $match: match },
      { $group: {
        _id: {
          day:  { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TZ } },
          user: '$createdBy',
        },
        publications: { $sum: 1 },
        // Одна публикация = несколько постов: в Instagram, Facebook, Telegram.
        // Считаем реально ушедшие, вместе со снятыми потом — работа была сделана.
        posts: { $sum: { $size: { $filter: {
          input: { $ifNull: ['$targets', []] },
          cond:  { $in: ['$$this.status', ['published', 'deleted', 'needs_manual']] },
        } } } },
      } },
      { $sort: { '_id.day': -1 } },
    ]);

    const User = require('../models/User');
    const ids  = [...new Set(rows.map(r => String(r._id.user)).filter(x => x && x !== 'null'))];
    const users = await User.find({ _id: { $in: ids } }).select('name role').lean();
    const nameOf = Object.fromEntries(users.map(u => [String(u._id), u]));

    const people = {};
    const byDay  = {};

    for (const r of rows) {
      const uid = String(r._id.user || 'none');
      const u   = nameOf[uid];

      const p = people[uid] || (people[uid] = {
        id: uid,
        name: u?.name || 'без автора',
        role: u?.role || '',
        publications: 0,
        posts: 0,
      });
      p.publications += r.publications;
      p.posts        += r.posts;

      const d = byDay[r._id.day] || (byDay[r._id.day] = { date: r._id.day, publications: 0, posts: 0, byPerson: {} });
      d.publications += r.publications;
      d.posts        += r.posts;
      d.byPerson[uid] = (d.byPerson[uid] || 0) + r.publications;
    }

    // Сеты и товары, закреплённые за дизайнерами. Это не про период: сколько
    // сетов ведёт человек — состояние на сегодня, а не выработка за неделю.
    // Считаем товары по каждой карточке отдельно, с её брендом: один и тот же
    // slug сета встречается и в HOME, и в SHAAR, и без фильтра по бренду
    // товары чужого бренда попали бы в зачёт.
    const Frontman = require('../models/Frontman');
    const cards = await Frontman.find({ kind: 'designer' }).sort({ order: 1 }).lean();

    const byUser = {};
    for (const c of cards) {
      if (!c.userId) continue;                     // карточка без привязки к учётке
      const uid = String(c.userId);
      const d = byUser[uid] || (byUser[uid] = { id: uid, name: c.name, sets: new Set(), brands: new Set(), products: 0 });
      (c.sets || []).forEach(s => d.sets.add(s));
      if (c.brand) d.brands.add(c.brand);
      if ((c.sets || []).length) {
        d.products += await Product.countDocuments({ set: { $in: c.sets }, brand: c.brand });
      }
    }

    // Дизайнер без карточки сетов — тоже дизайнер, показываем с нулями,
    // иначе «сетов ни у кого нет» не отличить от «человека забыли завести».
    const designerUsers = await User.find({ role: 'designer' }).select('name').lean();
    for (const u of designerUsers) {
      const uid = String(u._id);
      if (!byUser[uid]) byUser[uid] = { id: uid, name: u.name, sets: new Set(), brands: new Set(), products: 0 };
    }

    // Одна строка на человека: и выработка, и зона ответственности. Раньше это
    // были два списка, и публикации в них дублировались — читателю приходилось
    // сверять две таблицы глазами.
    const roleOf = Object.fromEntries(designerUsers.map(u => [String(u._id), 'designer']));

    for (const [uid, d] of Object.entries(byUser)) {
      const p = people[uid] || (people[uid] = {
        id: uid, name: d.name, role: 'designer', publications: 0, posts: 0,
      });
      p.sets     = d.sets.size;
      p.products = d.products;
      p.brands   = [...d.brands];
    }
    for (const p of Object.values(people)) {
      p.sets     = p.sets     || 0;
      p.products = p.products || 0;
      p.role     = p.role || roleOf[p.id] || '';
    }

    // Отклик на посты этого человека: сколько людей увидело и сколько откликнулось.
    // Выработка («сделал 30 постов») ничего не говорит о том, сработали они или нет,
    // а вопрос к дизайнеру именно такой.
    //
    // Реакции складываем из двух площадок: у Instagram это лайки, у Facebook —
    // все реакции разом (лайк, сердце, «ха-ха»). Считаем по одной строке на площадку:
    // публикация уходит в несколько мест, и отклик у каждого свой.
    const measuredPubs = await Publication.find(match)
      .select('createdBy targets.platform targets.status targets.stats').lean();

    for (const pub of measuredPubs) {
      const uid = String(pub.createdBy || 'none');
      const p = people[uid] || (people[uid] = {
        id: uid, name: nameOf[uid]?.name || 'без автора', role: nameOf[uid]?.role || '',
        publications: 0, posts: 0,
      });
      const e = p.engagement || (p.engagement = {
        reactions: 0, comments: 0, saved: 0, shares: 0, views: 0, reach: 0,
        // measured — постов, по которым цифры есть; noData — вышли, но цифр нет
        // (пост удалён с площадки или статистику ещё не собирали). Без этого
        // деления среднее на пост врёт: делить пришлось бы на посты без данных.
        measured: 0, noData: 0,
        // Для «отклика к охвату» берём только те посты, где охват известен:
        // у Facebook его нет, и общий охват занизил бы долю.
        reachReactions: 0, reachBase: 0,
      });

      for (const t of pub.targets || []) {
        if (!STATS_PLATFORMS.includes(t.platform) || t.status !== 'published') continue;
        const s = t.stats || {};
        const nums = ['views', 'reach', 'likes', 'reactions', 'comments', 'saved', 'shares']
          .some(k => typeof s[k] === 'number');
        if (!nums) { e.noData++; continue; }

        const reactions = (s.likes || 0) + (s.reactions || 0);
        e.measured++;
        e.reactions += reactions;
        e.comments  += (s.comments || 0) + (s.replies || 0);
        e.saved     += s.saved  || 0;
        e.shares    += s.shares || 0;
        e.views     += s.views  || 0;
        e.reach     += s.reach  || 0;
        if (s.reach > 0) { e.reachReactions += reactions; e.reachBase += s.reach; }
      }
    }

    for (const p of Object.values(people)) {
      const e = p.engagement || (p.engagement = {
        reactions: 0, comments: 0, saved: 0, shares: 0, views: 0, reach: 0,
        measured: 0, noData: 0, reachReactions: 0, reachBase: 0,
      });
      e.perPost      = e.measured ? e.reactions / e.measured : null;
      e.responseRate = e.reachBase ? e.reachReactions / e.reachBase : null;
    }

    const sumEng = (key) => Object.values(people).reduce((s, p) => s + (p.engagement?.[key] || 0), 0);

    res.json({
      days,
      // Сначала те, кто публиковал в этом периоде, потом остальные — по зоне.
      people: Object.values(people).sort((a, b) =>
        b.publications - a.publications || b.products - a.products),
      byDay:  Object.values(byDay).sort((a, b) => b.date.localeCompare(a.date)),
      totals: {
        publications: Object.values(people).reduce((s, p) => s + p.publications, 0),
        posts:        Object.values(people).reduce((s, p) => s + p.posts, 0),
        reactions:    sumEng('reactions'),
        comments:     sumEng('comments'),
        saved:        sumEng('saved'),
        views:        sumEng('views'),
        reach:        sumEng('reach'),
        measured:     sumEng('measured'),
        noData:       sumEng('noData'),
      },
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /report/person/:userId?days=30 — посты одного человека с цифрами по каждому.
// В сводной таблице отклика видно только среднее: «112 реакций, 2.0 на пост».
// На вопрос «а какие именно посты зашли» она не отвечает — отвечает этот список.
//
// Строка = один пост на одной площадке, как и в сводке: публикация уходит
// в несколько мест, и отклик у каждого свой. Считаем теми же правилами,
// иначе суммы здесь и в таблице разойдутся.
//
// userId = 'none' — публикации без автора (createdBy пустой у старых записей).
router.get('/report/person/:userId', async (req, res) => {
  try {
    const days = Math.min(Number(req.query.days) || 30, 365);
    const uid  = req.params.userId;

    // Строку в ObjectId кастует сам mongoose — поле в схеме уже типизировано.
    const match = uid === 'none' ? { createdBy: null } : { createdBy: uid };
    if (days > 0) {
      const from = new Date();
      from.setHours(0, 0, 0, 0);
      from.setDate(from.getDate() - (days - 1));
      match.createdAt = { $gte: from };
    }

    const pubs = await Publication.find(match)
      .select('number productName kind images createdAt targets')
      .sort({ createdAt: -1 })
      .lean();

    const posts = [];
    for (const pub of pubs) {
      for (const t of pub.targets || []) {
        if (!STATS_PLATFORMS.includes(t.platform) || t.status !== 'published') continue;
        const s = t.stats || {};
        const hasStats = ['views', 'reach', 'likes', 'reactions', 'comments', 'saved', 'shares']
          .some(k => typeof s[k] === 'number');
        const reactions = (s.likes || 0) + (s.reactions || 0);

        posts.push({
          id:          String(pub._id),
          number:      pub.number || null,
          name:        pub.productName || (pub.kind === 'custom' ? 'Свой пост' : 'Без названия'),
          image:       (pub.images || [])[0] || '',
          date:        pub.createdAt,
          publishedAt: t.publishedAt || null,
          platform:    t.platform,
          postType:    t.postType || 'feed',
          url:         t.externalUrl || '',
          hasStats,
          reactions:   hasStats ? reactions : null,
          comments:    hasStats ? (s.comments || 0) + (s.replies || 0) : null,
          saved:       hasStats ? (s.saved  || 0) : null,
          shares:      hasStats ? (s.shares || 0) : null,
          views:       hasStats ? (s.views  || 0) : null,
          reach:       hasStats ? (s.reach  || 0) : null,
          // Доля откликнувшихся — только там, где охват известен (Facebook его не отдаёт).
          responseRate: hasStats && s.reach > 0 ? reactions / s.reach : null,
        });
      }
    }

    // Сильные посты сверху — ради них список и открывают. Посты без цифр
    // не смешиваем с нулевыми: у них не «ноль реакций», а «неизвестно».
    posts.sort((a, b) => {
      if (a.hasStats !== b.hasStats) return a.hasStats ? -1 : 1;
      return (b.reactions || 0) - (a.reactions || 0);
    });

    res.json({ days, posts });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /leads?days=30 — сколько обращений пришло за период и по каким каналам.
// Рядом с отчётом по постам: «сделали 342 публикации» и «пришло 55 обращений»
// читаются вместе, а по отдельности не значат почти ничего.
//
// Считается по источнику обращения в Битриксе, не по метке поста: метки
// (#inst_matrix) остаются внутри чата Wazzup и в поля CRM не попадают.
router.get('/leads', async (req, res) => {
  try {
    const days = Math.min(Number(req.query.days) || 30, 365);
    res.json(await require('../lib/bitrixLeads').leadsByChannel({ days }));
  } catch (e) {
    // Битрикс может быть недоступен или у вебхука кончились права — отчёт по постам
    // из-за этого падать не должен, поэтому отдаём причину, а не 500.
    res.json({ error: e.message, channels: [], totals: { leads: 0, deals: 0, all: 0 } });
  }
});

// Черновик текста по товару — тот же, что уходит в предпросмотр.
router.get('/draft/:productId', async (req, res) => {
  const p = await Product.findById(req.params.productId).lean();
  if (!p) return res.status(404).json({ message: 'Товар не найден' });
  // ?price=wholesale — пост на партнёров/дилеров вместо витрины.
  const priceMode = req.query.price === 'wholesale' ? 'wholesale' : 'retail';
  // ?lang=kk — тот же пост по-казахски; по умолчанию кыргызский.
  const lang = normLang(req.query.lang);
  res.json({
    lang,
    text: buildProductText(p, { priceMode, lang }),
    // Заголовок отдаём отдельно: в форме его можно поправить и сохранить в карточку.
    // titleAuto — что даёт словарь, titleManual — что вписано руками (если вписано).
    title:       postTitle(p, lang),
    titleAuto:   postTitle({ ...p, nameKy: '', nameKk: '' }, lang),
    titleManual: manualName(p, lang),
    titleRu:     postTitle(p, 'ru'),
    images: [
      ...(p.images || []).filter(u => u && u.startsWith('http')),
      ...(p.driveImages || []).filter(Boolean).map(id => `https://drive.google.com/thumbnail?id=${id}&sz=w1200`),
    ],
    product: {
      _id: p._id, name: p.name, fullName: p.fullName,
      price: p.price, priceWholesale: p.priceWholesale, priceUndefined: p.priceUndefined,
      // sku — для короткой ссылки /w/:sku в историях, brand — чтобы в форме
      // было видно, на какой номер WhatsApp уйдёт заказ.
      sku: p.sku, brand: p.brand,
    },
  });
});

// PUT /product-name/:productId — название товара на кыргызском/казахском.
// Живёт здесь, а не в редакторе товара: правят его те, кто пишет посты, и правят
// ровно в тот момент, когда увидели кривой заголовок в форме публикации.
router.put('/product-name/:productId', async (req, res) => {
  try {
    const lang  = normLang(req.body?.lang);
    const field = lang === 'kk' ? 'nameKk' : lang === 'ky' ? 'nameKy' : '';
    if (!field) return res.status(400).json({ message: 'Название хранится только для кыргызского и казахского' });

    const value = String(req.body?.value || '').trim().slice(0, 200);
    const p = await Product.findByIdAndUpdate(
      req.params.productId, { $set: { [field]: value } }, { new: true },
    ).lean();
    if (!p) return res.status(404).json({ message: 'Товар не найден' });

    // Пустое значение = «вернуть словарь», поэтому отдаём заголовок как он теперь есть.
    res.json({ ok: true, lang, title: postTitle(p, lang), titleManual: manualName(p, lang) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /preview — как будет выглядеть текст на каждой выбранной площадке.
router.post('/preview', async (req, res) => {
  try {
    const { productId, text, targets, lang } = req.body || {};
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
          caption:   captionFor({ nodeTemplate: t.captionTemplate, account, product, text, lang }),
        };
      }),
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /publications — создать публикацию и разослать (или запланировать).
// body: { kind, productId, text, images, flowId, scheduledAt, force,
//         targets: [{ accountId, postType, captionTemplate, delayMinutes }] }
router.post('/publications', async (req, res) => {
  try {
    const { kind = 'product', productId, text, images, flowId, targets, scheduledAt, lang, force } = req.body || {};
    if (!Array.isArray(targets) || !targets.length) {
      return res.status(400).json({ message: 'Не выбрана ни одна площадка' });
    }
    if (!String(text || '').trim()) return res.status(400).json({ message: 'Пустой текст поста' });

    const product  = productId ? await Product.findById(productId).lean() : null;
    const accounts = await SocialAccount.find({ _id: { $in: targets.map(t => t.accountId) } });
    const byId = Object.fromEntries(accounts.map(a => [String(a._id), a]));

    const when = parseScheduledAt(scheduledAt);
    if (when && isNaN(when.getTime())) {
      return res.status(400).json({ message: 'Не понял время отложенной публикации' });
    }

    const base = when || new Date();
    const pubTargets = targets.map(t => {
      const account = byId[String(t.accountId)];
      return {
        account:  t.accountId,
        platform: account?.platform || '',
        title:    account?.title || '',
        postType: t.postType || 'feed',
        caption:  captionFor({ nodeTemplate: t.captionTemplate, account, product, text, lang }),
        dueAt:    new Date(base.getTime() + (Number(t.delayMinutes) || 0) * 60 * 1000),
        status:   'pending',
      };
    }).filter(t => t.platform); // площадка могла быть удалена, пока форма была открыта

    if (!pubTargets.length) return res.status(400).json({ message: 'Выбранные площадки не найдены' });

    // Спрашиваем, а не запрещаем: решение за человеком, но вслепую он его больше
    // не принимает. С force публикуем как просили.
    if (!force) {
      const already = await recentlyPublished({
        productId:  product?._id,
        text,
        accountIds: pubTargets.map(t => t.account),
      });
      if (already.length) {
        return res.status(409).json({
          message: 'Этот пост уже выходил на части площадок',
          duplicate: { targets: already, windowHours: DUPLICATE_WINDOW_MS / 3600000 },
        });
      }
    }

    const pub = await Publication.create({
      number:      await Counter.next('publication'),
      kind,
      product:     product?._id,
      productName: product ? (product.fullName || product.name || '') : '',
      text:        String(text).trim(),
      images:      (images || []).filter(Boolean),
      flow:        flowId || undefined,
      targets:     pubTargets,
      scheduledAt: when || undefined,
      createdBy:   req.user._id,
    });

    // Отложенное уходит по тику планировщика, немедленное публикуем прямо сейчас.
    if (when && when > new Date()) {
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

// POST /publications/stats — обновить отклик сразу по последним публикациям.
// Стоит выше маршрута с :id, иначе «stats» попало бы в него как идентификатор.
router.post('/publications/stats', async (req, res) => {
  try {
    res.json(await refreshRecentStats({ limit: Number(req.body?.limit) || 20 }));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /publications/:id/stats — сходить на площадки за лайками, комментариями
// и просмотрами этого поста. Цифры живут в самой публикации снимком: показывать
// отчёт надо и тогда, когда Meta недоступна или токен протух.
router.post('/publications/:id/stats', async (req, res) => {
  try {
    const result = await refreshStats(req.params.id);
    if (result.error) return res.status(404).json({ message: result.error });
    res.json(result);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /publications/:id/unpublish — снять пост со всех площадок, где он вышел.
// Запись в журнале остаётся: по ней видно, что снялось само, а что надо убрать руками.
router.post('/publications/:id/unpublish', async (req, res) => {
  try {
    const result = await unpublishPublication(req.params.id);
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
