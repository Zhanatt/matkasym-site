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
const User = require('../models/User');
const Counter = require('../models/Counter');
const storage = require('../lib/storage');
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
  const ext = pdf ? 'pdf' : ((file.mimetype.split('/')[1] || 'png').replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '') || 'png');
  const key = `site-changes/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  return storage.put(key, file.buffer, pdf ? 'application/pdf' : file.mimetype, { fileName: file.originalname || undefined });
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

// Продолжить чат после выложенной/отклонённой правки: новая ветка от свежего main
function reopen(doc) {
  if (doc.status === 'merged') doc.doneUpTo = doc.messages.length;
  for (const f of ['prNumber', 'prUrl', 'previewUrl', 'previewReadyAt', 'mergeSha', 'mergedAt', 'deployedAt', 'error'])
    doc[f] = undefined;
  doc.reverted = []; doc.pdfs = []; doc.dataOps = []; doc.files = [];
  sc.status(doc, '🔄 Чат продолжается — Claude сделает новую правку.');
}

// Сообщения, пришедшие пока Claude работал: передать в новый запуск
async function continueIfPending(doc) {
  const pending = doc.messages.filter(m => m.pending);
  if (!pending.length) return;
  pending.forEach(m => { m.pending = undefined; });
  doc.markModified('messages');
  if (['merged', 'rejected', 'cancelled'].includes(doc.status)) reopen(doc);
  const last = pending[pending.length - 1];
  const user = await User.findById(last.author);
  if (!user) return doc.save();
  await startRun(doc, user).catch(async e => { console.error('[siteChanges] pending run:', e.message); });
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

// История: что выложено на сайт, по дизайнерам — с итогом Claude и ссылкой «где смотреть»
admin.get('/history', async (req, res) => {
  try {
    const list = await SiteChange.find({ 'releases.0': { $exists: true } }, { messages: 0 }).limit(300).lean();
    const rows = list.flatMap(d => d.releases.map((r, i) => ({
      _id: d._id, key: `${d._id}-${i}`, number: d.number, title: d.title + (d.releases.length > 1 ? ` (${i + 1})` : ''),
      author: d.author, authorName: d.authorName, summary: r.summary, viewPath: r.viewPath, files: r.files || [],
      approvedBy: r.approvedBy, at: r.deployedAt || r.at, deployed: !!r.deployedAt, prUrl: r.prUrl, ops: r.ops || [],
    })));
    rows.sort((a, b) => new Date(b.at) - new Date(a.at));
    res.json(rows);
  } catch (e) { fail(res, e); }
});

// Мой Claude: личный токен подписки (claude setup-token). Сам токен наружу не отдаётся никогда.
admin.get('/me/claude', async (req, res) => {
  try { res.json(await sc.tokenInfo(req.user._id)); } catch (e) { fail(res, e); }
});
admin.put('/me/claude', async (req, res) => {
  try {
    if (req.body?.token) await sc.saveToken(req.user._id, req.body.token, req.body.account);
    else await sc.setTokenAccount(req.user._id, req.body?.account);
    res.json(await sc.tokenInfo(req.user._id)); } catch (e) { fail(res, e); }
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
    // Чат не закрывается никогда:
    //   ready/failed       — уточнение, Claude дорабатывает ту же правку
    //   queued/working/merging — сообщение ждёт, Claude возьмёт его после текущей работы
    //   merged/rejected/cancelled — чат продолжается новой правкой (прошлое — контекст)
    const doc = await SiteChange.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Правка не найдена' });
    const text = String(req.body.text || '').trim().slice(0, 5000);
    if (!text) return res.status(400).json({ message: 'Напишите сообщение' });
    await ensureToken(req.user);
    const images = await uploadAll(req.files);
    const msg = { kind: 'comment', author: req.user._id, authorName: req.user.name, text, images };
    if (['queued', 'working', 'merging'].includes(doc.status)) {
      doc.messages.push({ ...msg, pending: true });
      sc.status(doc, doc.status === 'merging'
        ? '📝 Сообщение получено. Сейчас выкладывается прошлая правка — сразу после этого Claude возьмётся за новое.'
        : '📝 Сообщение получено. Claude возьмёт его, как только закончит текущую работу.');
      await doc.save();
      return res.json(view(doc, await sc.approverName()));
    }
    if (['merged', 'rejected', 'cancelled'].includes(doc.status)) reopen(doc);
    doc.messages.push(msg);
    await startRun(doc, req.user);
    res.json(view(doc, await sc.approverName()));
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
    await sc.approveChange(doc, req.user);
    res.json(view(doc, await sc.approverName()));
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
    const reason = String(req.body?.reason || '').trim().slice(0, 1000);
    await sc.rejectChange(doc, req.user, reason, owner);
    res.json(view(doc, await sc.approverName()));
  } catch (e) { fail(res, e); }
});

// ── Для воркфлоу GitHub ─────────────────────────────────────────────────────

const hook = express.Router();
hook.use(express.json({ limit: '200kb' }));
hook.use((req, res, next) => sc.checkSecret(req.get('x-site-change-secret')) ? next() : res.status(401).json({ message: 'bad secret' }));

// Снимок каталога для Claude: товары, бренды с сетами, поставщики (только чтение)
hook.get('/:id/catalog', async (req, res) => {
  try { res.json(await require('../lib/siteOps').catalogSnapshot()); } catch (e) { fail(res, e); }
});

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
    // Claude ответил (готово, вопрос или «понял») — токен рабочий, старое предупреждение снять
    else if (b.status === 'ready' || b.status === 'question' || Number(b.costUsd) > 0) sc.setTokenError(tokenUser, null).catch(() => {});

    if (b.status === 'working') {
      if (!closed) {
        setStatus(doc, 'working');
        if (b.stage) sc.status(doc, String(b.stage).slice(0, 300));
        if (b.say) doc.messages.push({ kind: 'bot', authorName: 'Claude', text: String(b.say).slice(0, 4000) });
        if (b.costUsd) doc.costUsd = Math.round(((doc.costUsd || 0) + Number(b.costUsd)) * 10000) / 10000;
      }
    } else if (b.status === 'question') {
      // Claude не стал править: уточняет задачу или объясняет, что это не правка внешнего вида
      doc.runs.push({ ok: true, costUsd: Number(b.costUsd) || 0, summary: 'вопрос', runUrl: b.runUrl });
      doc.costUsd = Math.round(((doc.costUsd || 0) + (Number(b.costUsd) || 0)) * 10000) / 10000;
      doc.messages.push({ kind: 'bot', authorName: 'Claude', text: String(b.text || '').slice(0, 4000) });
      if (!closed) setStatus(doc, 'question');
    } else if (b.status === 'ready' || b.status === 'failed') {
      const cost = Number(b.costUsd) || 0;
      doc.runs.push({ ok: b.status === 'ready', costUsd: cost, summary: b.summary, runUrl: b.runUrl });
      doc.costUsd = Math.round(((doc.costUsd || 0) + cost) * 10000) / 10000;
      if (b.summary) doc.messages.push({ kind: 'bot', authorName: 'Claude', text: String(b.summary).slice(0, 4000) });
      if (!closed) {
        if (b.status === 'ready') {
          if (b.prNumber) { doc.prNumber = b.prNumber; doc.prUrl = b.prUrl; doc.previewUrl = sc.previewUrl(b.prNumber); }
          doc.reverted = Array.isArray(b.reverted) ? b.reverted.slice(0, 50) : [];
          if (Array.isArray(b.files)) doc.files = b.files.slice(0, 100).map(String);
          // Изменения каталога от Claude — проверить и показать карточкой, применятся при утверждении
          doc.dataOps = b.ops ? await require('../lib/siteOps').validateOps(b.ops) : [];
          const where = String(b.summary || '').match(/Где смотреть:\s*(.+?)\s*$/im);
          if (where) doc.viewPath = await require('../lib/siteOps').normalizeViewPath(where[1].replace(/[«»"`]/g, '').trim().slice(0, 300));
          doc.pdfs = Array.isArray(b.pdfs) ? b.pdfs.slice(0, 5).map(p => ({ title: String(p.title || 'Каталог'), url: p.url ? String(p.url) : undefined, error: p.error ? String(p.error) : undefined })) : [];
          setStatus(doc, 'ready');
          const who = await sc.approverName();
          const opsN = (doc.dataOps || []).filter(o => !o.error).length;
          sc.status(doc, `⏳ Правка на утверждении. Её должен утвердить ${who} — пока ${who.includes(' или ') ? 'никто из них не утвердит' : 'не утвердит'}, на сайте ничего не изменится.`
            + (opsN ? ` Изменений в каталоге: ${opsN} — внесутся в базу только после утверждения.` : '')
            + (doc.prNumber ? ' Предпросмотр собирается (3–7 минут), напишу, когда будет готов.' : ''));
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
      sc.pushRelease(doc);
      sc.status(doc, '📦 Правка добавлена в основной код. Сайт пересобирается — обычно 5–10 минут, напишу, когда можно будет смотреть.');
    } else if (b.status === 'merge_failed') {
      // Вернуть на решение: обычно конфликт с main — дизайнер уточняет, Claude переделывает
      doc.error = String(b.error || 'Не удалось слить правку').slice(0, 1000);
      setStatus(doc, 'failed');
      sc.status(doc, `❌ ${doc.error}`);
    }
    await doc.save();

    if (!closed && ['ready', 'failed', 'merged'].includes(b.status)) sc.notify(doc, b.status, { summary: b.summary }).catch(() => {});
    // Пока Claude работал, в чат написали — сразу следующий круг
    if (!closed && b.status === 'question') sc.notify(doc, 'question', { text: b.text, answer: b.answer }).catch(() => {});
    if (['ready', 'failed', 'merged', 'merge_failed', 'question'].includes(b.status)) await continueIfPending(doc);
    if (b.status === 'merge_failed') sc.notify(doc, 'failed').catch(() => {});
    res.json({ ok: true, status: doc.status });
  } catch (e) { fail(res, e); }
});

// Прислать владельцу сообщение о готовой правке ещё раз (с кнопками «Утвердить / Отклонить»)
hook.post('/:id/resend', async (req, res) => {
  try {
    const doc = await SiteChange.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'not found' });
    if (doc.status !== 'ready') return res.status(409).json({ message: `статус ${doc.status}` });
    await sc.notifyOwnersReady(doc);
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});

module.exports = { admin, hook };
