// «Правки сайта»: дизайнер описывает правку словами → Claude делает её в ветке
// (GitHub Actions) → предпросмотр → владелец принимает или отклоняет.
// Логика связи с GitHub и уведомления — server/lib/siteChanges.js.
//
// Два роутера:
//   admin  — /api/admin/site-changes, для людей (owner + designer)
//   hook   — /api/site-changes, для воркфлоу; доступ по SITE_CHANGE_SECRET
const express = require('express');
const multer = require('multer');
const SiteChange = require('../models/SiteChange');
const Counter = require('../models/Counter');
const cloudinary = require('../lib/cloudinary');
const { protect } = require('../middleware/auth');
const sc = require('../lib/siteChanges');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 10 } });
const STUCK_MS = 40 * 60 * 1000;   // queued/working дольше — считаем зависшим, можно перезапустить

const isOwner = u => u?.role === 'owner';
const canAccess = (req, res, next) =>
  sc.SITE_CHANGE_ROLES.includes(req.user?.role) ? next() : res.status(403).json({ message: 'Раздел доступен дизайнерам и владельцу' });
const ownerOnly = (req, res, next) =>
  isOwner(req.user) ? next() : res.status(403).json({ message: 'Принимает и отклоняет правки только владелец' });

// Вложения чата: картинки и PDF (Claude читает и то и другое)
function uploadImage(file) {
  const pdf = file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname || '');
  if (!/^image\//.test(file.mimetype) && !pdf) return Promise.reject(new Error('Можно прикладывать картинки и PDF'));
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream({ folder: 'matkasym/site-changes', resource_type: pdf ? 'raw' : 'image', ...(pdf ? { public_id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf` } : {}) },
      (err, r) => (err ? reject(err) : resolve(r.secure_url))).end(file.buffer);
  });
}
const uploadAll = files => Promise.all((files || []).map(uploadImage));

function setStatus(doc, status) { doc.status = status; doc.statusAt = new Date(); }

// Правку делает Claude того, кто её запускает — без личного токена запускать нечем
async function ensureToken(user) {
  const t = await sc.tokenInfo(user._id);
  if (!t.connected) {
    const e = new Error('Сначала подключите свой Claude — кнопка «Мой Claude» вверху раздела');
    e.status = 412; throw e;
  }
}

// Отправить задачу (или доработку) в GitHub. user — чей Claude будет работать
async function startRun(doc, user) {
  await ensureToken(user);
  doc.runBy = user._id; doc.runByName = user.name;
  setStatus(doc, 'queued');
  doc.previewReadyAt = undefined;
  sc.status(doc, doc.runs?.length ? '📨 Уточнение передано Claude — он доработает правку' : '📨 Задача передана Claude');
  doc.error = undefined;
  await doc.save();
  try {
    await sc.dispatch('site-change', doc);
  } catch (e) {
    setStatus(doc, 'failed'); doc.error = e.message; await doc.save();
    throw e;
  }
}

const view = (d, approver) => {
  const o = d.toObject ? d.toObject() : d;
  o.approver = approver;
  o.stuck = ['queued', 'working', 'merging'].includes(o.status) && Date.now() - new Date(o.statusAt).getTime() > STUCK_MS;
  return o;
};

const fail = (res, e) => res.status(e.status || 500).json({ message: e.message || 'Ошибка' });

// ── Для людей ───────────────────────────────────────────────────────────────

const admin = express.Router();
admin.use(protect, canAccess);

admin.get('/', async (req, res) => {
  try {
    const list = await SiteChange.find({}, { messages: { $slice: 1 } }).sort({ createdAt: -1 }).limit(200).lean();
    res.json({ items: list.map(d => view(d)), me: await sc.tokenInfo(req.user._id), isOwner: isOwner(req.user) });
  } catch (e) { fail(res, e); }
});

// Мой Claude: личный токен подписки (claude setup-token). Сам токен наружу не отдаётся никогда.
admin.get('/me/claude', async (req, res) => {
  try { res.json(await sc.tokenInfo(req.user._id)); } catch (e) { fail(res, e); }
});
admin.put('/me/claude', async (req, res) => {
  try { await sc.saveToken(req.user._id, req.body?.token); res.json(await sc.tokenInfo(req.user._id)); } catch (e) { fail(res, e); }
});
admin.delete('/me/claude', async (req, res) => {
  try { await sc.removeToken(req.user._id); res.json({ connected: false }); } catch (e) { fail(res, e); }
});

admin.get('/:id', async (req, res) => {
  try {
    const d = await SiteChange.findById(req.params.id);
    if (!d) return res.status(404).json({ message: 'Правка не найдена' });
    // Чат открыт — заодно проверить, поднялся ли предпросмотр и доехала ли правка до сайта
    await sc.checkPreview(d).catch(() => {});
    await sc.checkDeployed(d).catch(() => {});
    res.json(view(d, await sc.approverName()));
  } catch (e) { fail(res, e); }
});

admin.post('/', upload.array('images', 10), async (req, res) => {
  try {
    // Чат: отдельного заголовка нет — название берём из первого сообщения
    const text = String(req.body.text || '').trim().slice(0, 5000);
    if (!text) return res.status(400).json({ message: 'Напишите, что нужно сделать' });
    const firstLine = text.split('\n').find(l => l.trim()) || text;
    const title = String(req.body.title || '').trim().slice(0, 140) || (firstLine.length > 70 ? firstLine.slice(0, 67).trimEnd() + '…' : firstLine);
    await ensureToken(req.user);
    const images = await uploadAll(req.files);
    const doc = await SiteChange.create({
      number: await Counter.next('siteChange'),
      author: req.user._id, authorName: req.user.name, title,
      messages: [{ kind: 'request', author: req.user._id, authorName: req.user.name, text, images }],
    });
    await startRun(doc, req.user);
    res.status(201).json(view(doc));
  } catch (e) { fail(res, e); }
});

// Уточнение: пишут автор или владелец. Если правка не в работе — Claude дорабатывает.
admin.post('/:id/messages', upload.array('images', 10), async (req, res) => {
  try {
    const doc = await SiteChange.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Правка не найдена' });
    if (!['ready', 'failed'].includes(doc.status)) {
      return res.status(409).json({ message: doc.status === 'merged' ? 'Правка уже на сайте — создайте новую' : 'Сейчас уточнить нельзя: правка в работе или закрыта' });
    }
    const text = String(req.body.text || '').trim().slice(0, 5000);
    if (!text) return res.status(400).json({ message: 'Напишите, что поправить' });
    const images = await uploadAll(req.files);
    doc.messages.push({ kind: 'comment', author: req.user._id, authorName: req.user.name, text, images });
    await startRun(doc, req.user);
    res.json(view(doc));
  } catch (e) { fail(res, e); }
});

// Повторить: после сбоя или если запуск завис
admin.post('/:id/retry', async (req, res) => {
  try {
    const doc = await SiteChange.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Правка не найдена' });
    const stuck = view(doc).stuck;
    if (doc.status === 'merging' && stuck) {
      await sc.dispatch('site-change-merge', doc);
      setStatus(doc, 'merging'); await doc.save();
      return res.json(view(doc));
    }
    if (doc.status !== 'failed' && !stuck) return res.status(409).json({ message: 'Повторять нечего' });
    await startRun(doc, req.user);
    res.json(view(doc));
  } catch (e) { fail(res, e); }
});

admin.post('/:id/approve', ownerOnly, async (req, res) => {
  try {
    const doc = await SiteChange.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Правка не найдена' });
    if (doc.status !== 'ready' || !doc.prNumber) return res.status(409).json({ message: 'Принять можно только готовую правку' });
    await sc.dispatch('site-change-merge', doc);
    setStatus(doc, 'merging');
    doc.decidedBy = req.user._id; doc.decidedAt = new Date();
    doc.messages.push({ kind: 'decision', author: req.user._id, authorName: req.user.name, text: '✅ Утверждено' });
    sc.status(doc, `🚀 ${req.user.name} утвердил(а). Выкладываю правку на сайт…`);
    await doc.save();
    res.json(view(doc));
  } catch (e) { fail(res, e); }
});

// Отклонить (владелец) или отменить (автор). Ветка и PR закрываются в GitHub.
admin.post('/:id/reject', async (req, res) => {
  try {
    const doc = await SiteChange.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Правка не найдена' });
    const owner = isOwner(req.user);
    const mine = String(doc.author) === String(req.user._id);
    if (!owner && !mine) return res.status(403).json({ message: 'Отменить может только автор или владелец' });
    if (['merging', 'merged', 'rejected', 'cancelled'].includes(doc.status)) return res.status(409).json({ message: 'Правка уже закрыта' });
    const reason = String(req.body?.reason || '').trim().slice(0, 1000);
    const cancelled = !owner || mine && !reason;
    setStatus(doc, cancelled ? 'cancelled' : 'rejected');
    doc.decidedBy = req.user._id; doc.decidedAt = new Date();
    doc.messages.push({ kind: 'decision', author: req.user._id, authorName: req.user.name, text: (cancelled ? '↩️ Отменено' : '🚫 Отклонено') + (reason ? `: ${reason}` : '') });
    await doc.save();
    sc.dispatch('site-change-close', doc).catch(e => console.error('[siteChanges] close:', e.message));
    if (!cancelled) sc.notify(doc, 'rejected', { reason }).catch(() => {});
    res.json(view(doc));
  } catch (e) { fail(res, e); }
});

// ── Для воркфлоу GitHub ─────────────────────────────────────────────────────

const hook = express.Router();
hook.use(express.json({ limit: '200kb' }));
hook.use((req, res, next) => sc.checkSecret(req.get('x-site-change-secret')) ? next() : res.status(401).json({ message: 'bad secret' }));

hook.get('/:id/task', async (req, res) => {
  try {
    const d = await SiteChange.findById(req.params.id).lean();
    if (!d) return res.status(404).json({ message: 'not found' });
    const claudeToken = await sc.readToken(d.runBy || d.author);
    if (!claudeToken) return res.status(412).json({ message: 'У того, кто запустил правку, не подключён Claude' });
    res.json({ number: d.number, title: d.title, status: d.status, claudeToken, ...sc.buildPrompt(d) });
  } catch (e) { fail(res, e); }
});

// body: { status: working|ready|failed|merged|closed, prNumber, prUrl, runUrl, summary, costUsd, reverted, error }
hook.post('/:id/callback', async (req, res) => {
  try {
    const doc = await SiteChange.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'not found' });
    const b = req.body || {};
    if (b.runUrl) doc.runUrl = b.runUrl;
    // Отклонённую/отменённую правку запоздалый отчёт не воскрешает
    const closed = ['rejected', 'cancelled'].includes(doc.status);

    // Лимит подписки / недействительный токен — отметить у владельца токена
    const tokenUser = doc.runBy || doc.author;
    if (b.tokenError) sc.setTokenError(tokenUser, String(b.tokenError).slice(0, 300)).catch(() => {});
    else if (b.status === 'ready') sc.setTokenError(tokenUser, null).catch(() => {});

    if (b.status === 'working') {
      if (!closed) {
        setStatus(doc, 'working');
        if (b.stage) sc.status(doc, String(b.stage).slice(0, 300));
      }
    } else if (b.status === 'ready' || b.status === 'failed') {
      const cost = Number(b.costUsd) || 0;
      doc.runs.push({ ok: b.status === 'ready', costUsd: cost, summary: b.summary, runUrl: b.runUrl });
      doc.costUsd = Math.round(((doc.costUsd || 0) + cost) * 10000) / 10000;
      if (b.summary) doc.messages.push({ kind: 'bot', authorName: 'Claude', text: String(b.summary).slice(0, 4000) });
      if (!closed) {
        if (b.status === 'ready') {
          if (b.prNumber) { doc.prNumber = b.prNumber; doc.prUrl = b.prUrl; doc.previewUrl = sc.previewUrl(b.prNumber); }
          doc.reverted = Array.isArray(b.reverted) ? b.reverted.slice(0, 50) : [];
          doc.pdfs = Array.isArray(b.pdfs) ? b.pdfs.slice(0, 5).map(p => ({ title: String(p.title || 'Каталог'), url: p.url ? String(p.url) : undefined, error: p.error ? String(p.error) : undefined })) : [];
          setStatus(doc, 'ready');
          const who = await sc.approverName();
          sc.status(doc, `⏳ Правка на утверждении. Её должен утвердить ${who} — пока ${who.includes(' или ') ? 'никто из них не утвердит' : 'не утвердит'}, на сайте ничего не изменится. Предпросмотр собирается (3–7 минут), напишу, когда будет готов.`);
        } else {
          doc.error = String(b.error || 'Неизвестная ошибка').slice(0, 1000);
          setStatus(doc, 'failed');
          sc.status(doc, `❌ Не получилось: ${doc.error}`);
        }
      }
    } else if (b.status === 'merged') {
      setStatus(doc, 'merged');
      doc.mergedAt = new Date();
      if (b.mergeSha) doc.mergeSha = String(b.mergeSha).slice(0, 64);
      sc.status(doc, '📦 Правка добавлена в основной код. Сайт пересобирается — обычно 5–10 минут, напишу, когда можно будет смотреть.');
    } else if (b.status === 'merge_failed') {
      // Вернуть на решение: обычно конфликт с main — дизайнер уточняет, Claude переделывает
      doc.error = String(b.error || 'Не удалось слить правку').slice(0, 1000);
      setStatus(doc, 'failed');
      sc.status(doc, `❌ ${doc.error}`);
    }
    await doc.save();

    if (!closed && ['ready', 'failed', 'merged'].includes(b.status)) sc.notify(doc, b.status, { summary: b.summary }).catch(() => {});
    if (b.status === 'merge_failed') sc.notify(doc, 'failed').catch(() => {});
    res.json({ ok: true, status: doc.status });
  } catch (e) { fail(res, e); }
});

module.exports = { admin, hook };
