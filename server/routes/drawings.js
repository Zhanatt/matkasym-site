// Чертежи PDF — вкладка «Чертежи» в админке. Те же записи, что пишет бот
// (lib/drawingBot.js): загруженное в Telegram видно на сайте и наоборот.
//
// Смотреть и копировать ссылки могут все, кто заходит в админку. Менять, заменять
// файл и удалять — автор (по аккаунту или по привязанному Telegram) и владелец.
const router  = require('express').Router();
const multer  = require('multer');
const Drawing = require('../models/Drawing');
const { protect, warehouse } = require('../middleware/auth');
const { createDrawing, replaceDrawingFile, deleteDrawing, MAX_BYTES } = require('../lib/drawings');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES } });

router.use(protect, warehouse);

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

router.get('/', async (req, res) => {
  try {
    const { scope = 'mine', q = '' } = req.query;
    const filter = scope === 'mine' ? mineFilter(req.user) : {};
    if (q.trim()) {
      const re = new RegExp(escRe(q.trim()), 'i');
      filter.$and = [{ $or: [{ title: re }, { code: re }, { caption: re }, { fileName: re }, { author: re }] }];
    }
    const [items, mine, all] = await Promise.all([
      Drawing.find(filter).sort({ updatedAt: -1 }).limit(500).lean(),
      Drawing.countDocuments(mineFilter(req.user)),
      Drawing.countDocuments(),
    ]);
    res.json({ items: items.map(d => view(d, req.user)), counts: { mine, all } });
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
