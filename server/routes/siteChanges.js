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

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 5 } });
const STUCK_MS = 40 * 60 * 1000;   // queued/working дольше — считаем зависшим, можно перезапустить

const isOwner = u => u?.role === 'owner';
const canAccess = (req, res, next) =>
  sc.SITE_CHANGE_ROLES.includes(req.user?.role) ? next() : res.status(403).json({ message: 'Раздел доступен дизайнерам и владельцу' });
const ownerOnly = (req, res, next) =>
  isOwner(req.user) ? next() : res.status(403).json({ message: 'Принимает и отклоняет правки только владелец' });

function uploadImage(file) {
  if (!/^image\//.test(file.mimetype)) return Promise.reject(new Error('Можно прикладывать только картинки'));
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream({ folder: 'matkasym/site-changes', resource_type: 'image' },
      (err, r) => (err ? reject(err) : resolve(r.secure_url))).end(file.buffer);
  });
}
const uploadAll = files => Promise.all((files || []).map(uploadImage));

function setStatus(doc, status) { doc.status = status; doc.statusAt = new Date(); }

async function ensureBudget() {
  const { spent, limit } = await sc.monthSpend();
  if (spent >= limit) {
    const e = new Error(`Лимит расходов на этот месяц исчерпан ($${spent} из $${limit}). Обратитесь к владельцу.`);
    e.status = 402; throw e;
  }
}

// Отправить задачу (или доработку) в GitHub
async function startRun(doc) {
  await ensureBudget();
  setStatus(doc, 'queued');
  doc.error = undefined;
  await doc.save();
  try {
    await sc.dispatch('site-change', doc);
  } catch (e) {
    setStatus(doc, 'failed'); doc.error = e.message; await doc.save();
    throw e;
  }
}

const view = d => {
  const o = d.toObject ? d.toObject() : d;
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
    res.json({ items: list.map(view), budget: await sc.monthSpend(), isOwner: isOwner(req.user) });
  } catch (e) { fail(res, e); }
});

admin.get('/:id', async (req, res) => {
  try {
    const d = await SiteChange.findById(req.params.id).lean();
    if (!d) return res.status(404).json({ message: 'Правка не найдена' });
    res.json(view(d));
  } catch (e) { fail(res, e); }
});

admin.post('/', upload.array('images', 5), async (req, res) => {
  try {
    const title = String(req.body.title || '').trim().slice(0, 140);
    const text = String(req.body.text || '').trim().slice(0, 5000);
    if (!title || !text) return res.status(400).json({ message: 'Заполните, что нужно сделать, и подробности' });
    await ensureBudget();
    const images = await uploadAll(req.files);
    const doc = await SiteChange.create({
      number: await Counter.next('siteChange'),
      author: req.user._id, authorName: req.user.name, title,
      messages: [{ kind: 'request', author: req.user._id, authorName: req.user.name, text, images }],
    });
    await startRun(doc);
    res.status(201).json(view(doc));
  } catch (e) { fail(res, e); }
});

// Уточнение: пишут автор или владелец. Если правка не в работе — Claude дорабатывает.
admin.post('/:id/messages', upload.array('images', 5), async (req, res) => {
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
    await startRun(doc);
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
    await startRun(doc);
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
    doc.messages.push({ kind: 'decision', author: req.user._id, authorName: req.user.name, text: '✅ Принято' });
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
    res.json({ number: d.number, title: d.title, status: d.status, ...sc.buildPrompt(d) });
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

    if (b.status === 'working') {
      if (!closed) setStatus(doc, 'working');
    } else if (b.status === 'ready' || b.status === 'failed') {
      const cost = Number(b.costUsd) || 0;
      doc.runs.push({ ok: b.status === 'ready', costUsd: cost, summary: b.summary, runUrl: b.runUrl });
      doc.costUsd = Math.round(((doc.costUsd || 0) + cost) * 10000) / 10000;
      if (b.summary) doc.messages.push({ kind: 'bot', authorName: 'Claude', text: String(b.summary).slice(0, 4000) });
      if (!closed) {
        if (b.status === 'ready') {
          if (b.prNumber) { doc.prNumber = b.prNumber; doc.prUrl = b.prUrl; doc.previewUrl = sc.previewUrl(b.prNumber); }
          doc.reverted = Array.isArray(b.reverted) ? b.reverted.slice(0, 50) : [];
          setStatus(doc, 'ready');
        } else {
          doc.error = String(b.error || 'Неизвестная ошибка').slice(0, 1000);
          setStatus(doc, 'failed');
        }
      }
    } else if (b.status === 'merged') {
      setStatus(doc, 'merged');
    } else if (b.status === 'merge_failed') {
      // Вернуть на решение: обычно конфликт с main — дизайнер уточняет, Claude переделывает
      doc.error = String(b.error || 'Не удалось слить правку').slice(0, 1000);
      setStatus(doc, 'failed');
    }
    await doc.save();

    if (!closed && ['ready', 'failed', 'merged'].includes(b.status)) sc.notify(doc, b.status, { summary: b.summary }).catch(() => {});
    if (b.status === 'merge_failed') sc.notify(doc, 'failed').catch(() => {});
    res.json({ ok: true, status: doc.status });
  } catch (e) { fail(res, e); }
});

module.exports = { admin, hook };
