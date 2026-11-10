// Чертежи PDF — вкладка «Чертежи» в админке. Те же записи, что пишет бот
// (lib/drawingBot.js): загруженное в Telegram видно на сайте и наоборот.
//
// Доступ — только владелец и роль «Конструктор» (middleware drawings).
// По умолчанию каждый видит только свои чертежи. Чужие — через раздел
// «Конструкторы»: список авторов → чертежи выбранного. Менять, заменять файл
// и удалять — автор (по аккаунту или по привязанному Telegram) и владелец.
const router  = require('express').Router();
const multer  = require('multer');
const Drawing = require('../models/Drawing');
const User    = require('../models/User');
const { protect, drawings } = require('../middleware/auth');
const { createDrawing, replaceDrawingFile, deleteDrawing, MAX_BYTES } = require('../lib/drawings');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES } });

router.use(protect, drawings);   // только владелец и роль «Конструктор»

const mineFilter = user => {
  const or = [{ user: user._id }];
  if (user.telegramChatId) or.push({ chatId: String(user.telegramChatId) });
  return { $or: or };
};

const isMine = (d, user) =>
  (d.user && String(d.user) === String(user._id)) ||
  (!!user.telegramChatId && d.chatId === String(user.telegramChatId));

const canEdit = (d, user) => user.role === 'owner' || isMine(d, user);

const view = (d, user) => ({
  _id: d._id, title: d.title, code: d.code, caption: d.caption, fileName: d.fileName, size: d.size,
  url: d.url, author: d.author, lastAuthor: d.lastAuthor, source: d.source,
  createdAt: d.createdAt, fileUpdatedAt: d.fileUpdatedAt || d.createdAt,
  versions: (d.versions || []).slice().reverse(),
  mine: isMine(d, user), canEdit: canEdit(d, user),
});

// Кириллица в multer приходит как latin1 — перекодируем, иначе «Ð¡Ð±_…»
const fileNameOf = f => Buffer.from(f.originalname || 'drawing.pdf', 'latin1').toString('utf8');

const escRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Конструктор = Telegram-чат (бот и сайт у сотрудника с привязанным Telegram пишут
// один chatId), а для загрузок с сайта без Telegram — аккаунт: ключ «u:<userId>».
const authorKeyOf = d => d.chatId || (d.user ? `u:${d.user}` : '');

const authorFilter = key => {
  if (key.startsWith('u:')) return { user: key.slice(2), chatId: '' };
  return { chatId: key };
};

router.get('/', async (req, res) => {
  try {
    const { scope = 'mine', author = '', q = '' } = req.query;
    let filter;
    if (scope === 'author') {
      if (!author || (author.startsWith('u:') && !/^u:[a-f0-9]{24}$/i.test(author))) {
        return res.status(400).json({ message: 'Не выбран конструктор' });
      }
      filter = authorFilter(String(author));
    } else filter = mineFilter(req.user);
    if (q.trim()) {
      const re = new RegExp(escRe(q.trim()), 'i');
      filter = { $and: [filter, { $or: [{ title: re }, { code: re }, { caption: re }, { fileName: re }] }] };
    }
    const [items, mine] = await Promise.all([
      Drawing.find(filter).sort({ updatedAt: -1 }).limit(500).lean(),
      Drawing.countDocuments(mineFilter(req.user)),
    ]);
    res.json({ items: items.map(d => view(d, req.user)), counts: { mine } });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// Список конструкторов, у кого есть чертежи (кроме себя — свои в «Моих»).
router.get('/authors', async (req, res) => {
  try {
    const rows = await Drawing.find({}, { chatId: 1, user: 1, author: 1, updatedAt: 1 }).sort({ updatedAt: -1 }).lean();
    const myKeys = new Set([String(req.user.telegramChatId || ''), `u:${req.user._id}`].filter(k => k && k !== 'u:'));
    const map = new Map();
    for (const d of rows) {
      const key = authorKeyOf(d);
      if (!key) continue;
      if (myKeys.has(key) || (d.user && String(d.user) === String(req.user._id))) continue;
      const a = map.get(key) || { key, name: d.author || '', count: 0, lastAt: d.updatedAt };
      a.count += 1;
      map.set(key, a);
    }
    const list = [...map.values()];
    // Имя берём из аккаунта сайта, если он найден, — оно аккуратнее телеграмного
    const chatIds = list.filter(a => !a.key.startsWith('u:')).map(a => a.key);
    const userIds = list.filter(a => a.key.startsWith('u:')).map(a => a.key.slice(2));
    const users = await User.find({ $or: [{ telegramChatId: { $in: chatIds } }, { _id: { $in: userIds } }] }, { name: 1, telegramChatId: 1 }).lean();
    for (const a of list) {
      const u = a.key.startsWith('u:')
        ? users.find(x => String(x._id) === a.key.slice(2))
        : users.find(x => x.telegramChatId && String(x.telegramChatId) === a.key);
      if (u?.name) a.name = u.name;
      if (!a.name) a.name = 'Без имени';
    }
    res.json({ items: list });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Нет файла' });
    const { title = '', code = '', caption = '' } = req.body;
    const d = await createDrawing(req.file.buffer, fileNameOf(req.file), {
      title: title.trim().slice(0, 200), code: code.trim().slice(0, 60), caption: caption.trim().slice(0, 500),
      author: req.user.name || req.user.email, lastAuthor: req.user.name || req.user.email,
      source: 'site', user: req.user._id, chatId: req.user.telegramChatId ? String(req.user.telegramChatId) : '',
    });
    res.json(view(d.toObject(), req.user));
  } catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const d = await Drawing.findById(req.params.id);
    if (!d) return res.status(404).json({ message: 'Чертёж не найден' });
    if (!canEdit(d, req.user)) return res.status(403).json({ message: 'Менять может только автор' });
    for (const [k, max] of [['title', 200], ['code', 60], ['caption', 500]]) {
      if (typeof req.body[k] === 'string') d[k] = req.body[k].trim().slice(0, max);
    }
    await d.save();
    res.json(view(d.toObject(), req.user));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/:id/replace', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Нет файла' });
    const d = await Drawing.findById(req.params.id);
    if (!d) return res.status(404).json({ message: 'Чертёж не найден' });
    if (!canEdit(d, req.user)) return res.status(403).json({ message: 'Заменить может только автор' });
    await replaceDrawingFile(d, req.file.buffer, fileNameOf(req.file), req.user.name || req.user.email);
    res.json(view(d.toObject(), req.user));
  } catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const d = await Drawing.findById(req.params.id);
    if (!d) return res.status(404).json({ message: 'Чертёж не найден' });
    if (!canEdit(d, req.user)) return res.status(403).json({ message: 'Удалить может только автор' });
    await deleteDrawing(d);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// multer: слишком большой файл
router.use((err, req, res, next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: 'Файл больше 20 МБ' });
  next(err);
});

module.exports = router;
