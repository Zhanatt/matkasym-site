// «Правки сайта» — связь сайта с GitHub Actions и уведомления.
//
// Сайт сам ничего в коде не меняет: он шлёт repository_dispatch, а работу делает
// .github/workflows/site-change.yml (Claude правит client/ в ветке design/<id>,
// сборка, PR, слияние). Обратно воркфлоу стучится в /api/site-changes/:id/*
// с общим секретом SITE_CHANGE_SECRET (тот же в секретах GitHub и в Render).
//
// Переменные окружения (Render):
//   GITHUB_DISPATCH_TOKEN    — тот же токен, что запускает сборку каталогов
//   SITE_CHANGE_SECRET       — общий секрет с воркфлоу
//   SITE_CHANGE_MONTHLY_USD  — потолок расходов на Claude в месяц, по умолчанию 20
//   SITE_CHANGE_PREVIEW_URL  — шаблон адреса предпросмотра Render, {n} = номер PR
const crypto = require('crypto');
const User = require('../models/User');
const SiteChange = require('../models/SiteChange');
const { sendTelegramMessage } = require('./telegram');

const REPO = 'Zhanatt/matkasym-site';
const SITE_URL = process.env.SITE_URL || 'https://matkasym-site.onrender.com';
const MONTHLY_USD = Number(process.env.SITE_CHANGE_MONTHLY_USD || 20);
const PREVIEW_TPL = process.env.SITE_CHANGE_PREVIEW_URL || 'https://matkasym-site-pr-{n}.onrender.com';

// Роли, которым открыт раздел. Принимает/отклоняет только owner.
const SITE_CHANGE_ROLES = ['owner', 'designer'];

const previewUrl = n => PREVIEW_TPL.replace('{n}', n);
const adminLink = id => `${SITE_URL}/admin/site-changes?id=${id}`;
const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function checkSecret(given) {
  const want = process.env.SITE_CHANGE_SECRET;
  if (!want || !given) return false;
  const a = Buffer.from(String(given)), b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function monthSpend() {
  const from = new Date(); from.setDate(1); from.setHours(0, 0, 0, 0);
  const [r] = await SiteChange.aggregate([
    { $unwind: '$runs' },
    { $match: { 'runs.at': { $gte: from } } },
    { $group: { _id: null, sum: { $sum: '$runs.costUsd' } } },
  ]);
  return { spent: Math.round((r?.sum || 0) * 100) / 100, limit: MONTHLY_USD };
}

// action: 'site-change' (сделать/доделать правку), 'site-change-merge', 'site-change-close'
async function dispatch(action, change) {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) throw new Error('На сервере не задан GITHUB_DISPATCH_TOKEN');
  if (!process.env.SITE_CHANGE_SECRET) throw new Error('На сервере не задан SITE_CHANGE_SECRET');
  const r = await fetch(`https://api.github.com/repos/${REPO}/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_type: action, client_payload: { id: String(change._id), number: change.number } }),
  });
  if (!r.ok) throw new Error(`GitHub не принял задачу: ${r.status} ${await r.text()}`);
}

// Текст задачи для Claude: правила + исходная просьба + все уточнения по порядку.
function buildPrompt(change) {
  const [first, ...rest] = change.messages;
  const imgs = [];
  const withImages = m => {
    const refs = (m.images || []).map(url => { imgs.push(url); return `.site-change-refs/${imgs.length}${extOf(url)}`; });
    return refs.length ? `\n(Приложены картинки: ${refs.join(', ')} — открой их инструментом Read.)` : '';
  };
  const lines = [
    'Ты вносишь правку во внешний вид сайта MATKASYM («Продакт матрица», React 18 + Vite, папка client/).',
    'Задачу поставил дизайнер компании, правку потом проверит и примет владелец сайта.',
    '',
    'ПРАВИЛА:',
    '- Меняй только файлы в client/src/ и client/public/. Сервер (server/), базу, цены, права доступа, роли, авторизацию и API не трогай.',
    '- Исключение — вёрстка PDF-каталогов. Каталоги брендов: client/src/pages/admin/catalogPrint.js, kyzmatPrint.js, brandPdfGroups.js. Каталоги сетов SHAAR: server/scripts/build-<сет>-catalog.js (сеты: uzak-koldon, mazza-seyil, onoy-sakta, 0-tastandy, bilim-kelechek, bekem-fasad, kooz-koopsuzduk, bekem-tosmo), общая вёрстка — server/lib/catalogLayout.js и catalogFonts.js. В этих серверных файлах меняй только HTML/CSS и оформление: никаких новых запросов и записи в базу, process.env, запуска программ, удаления файлов — иначе правка в файле будет отменена. Новые файлы на сервере не создавай.',
    '- Нельзя менять client/src/api/, client/src/context/, client/src/constants/roles.js, package.json, конфиги сборки — такие правки будут автоматически отменены.',
    '- Не добавляй npm-пакеты. Не удаляй функциональность, о которой не просили.',
    '- Делай ровно то, что просят, в стиле существующего кода. Если просьба неясна — выбери самое разумное толкование и напиши об этом в итоге.',
    '- Модалки — порталом в document.body (см. CLAUDE.md).',
    '- В конце ответь по-русски, коротко и простыми словами для дизайнера: что изменено и где это увидеть на сайте (какая страница). Без кода.',
    '',
    `ЗАДАЧА №${change.number} от ${first?.authorName || change.authorName}: ${change.title}`,
    (first?.text || '') + withImages(first || {}),
  ];
  const follow = rest.filter(m => m.kind === 'comment');
  if (follow.length) {
    lines.push('', 'Правка уже делалась раньше (в этой ветке твои прошлые изменения). Уточнения, которые пришли после — выполни их:');
    for (const m of follow) lines.push(`- ${m.authorName}: ${m.text || ''}${withImages(m)}`);
  }
  return { prompt: lines.join('\n'), images: imgs.map((url, i) => ({ url, name: `${i + 1}${extOf(url)}` })) };
}

function extOf(url) {
  const m = String(url).split('?')[0].match(/\.(png|jpe?g|webp|gif)$/i);
  return m ? `.${m[1].toLowerCase()}` : '.jpg';
}

// ── Уведомления в Telegram ──────────────────────────────────────────────────

async function ownerChats() {
  return User.find({ role: 'owner', telegramChatId: { $nin: [null, ''] } }, 'telegramChatId').lean();
}

async function tellAuthor(change, text, buttons) {
  const u = await User.findById(change.author, 'telegramChatId').lean();
  if (!u?.telegramChatId) return;
  await sendTelegramMessage(u.telegramChatId, text, kb(buttons)).catch(() => {});
}

async function tellOwners(text, buttons) {
  for (const o of await ownerChats()) await sendTelegramMessage(o.telegramChatId, text, kb(buttons)).catch(() => {});
}

const kb = buttons => buttons?.length
  ? { disablePreview: true, reply_markup: { inline_keyboard: [buttons.map(([text, url]) => ({ text, url }))] } }
  : { disablePreview: true };

async function notify(change, event, extra = {}) {
  const head = `🎨 <b>Правка сайта №${change.number}</b> · ${esc(change.title)}`;
  const open = ['Открыть', adminLink(change._id)];
  if (event === 'ready') {
    const preview = ['👀 Предпросмотр', change.previewUrl];
    const summary = extra.summary ? `\n\n${esc(extra.summary).slice(0, 1500)}` : '';
    const pdfs = (change.pdfs || []).map(p => p.url ? `\n📄 <a href="${p.url}">${esc(p.title)} — пробный PDF</a>` : `\n📄 ${esc(p.title)}: не собрался (${esc(p.error)})`).join('');
    const reverted = change.reverted?.length ? `\n\n⚠️ Отменены правки в запрещённых файлах: ${esc(change.reverted.join(', '))}` : '';
    await tellOwners(`${head}\nОт: ${esc(change.authorName)}${summary}${pdfs}${reverted}\n\nПредпросмотр соберётся за 3–7 минут. Принять или отклонить — в разделе «Правки сайта».`, [preview, open]);
    await tellAuthor(change, `${head}\nГотово, проверь на предпросмотре (соберётся за 3–7 минут). Если нужно поправить — напиши уточнение в разделе «Правки сайта».${summary}${pdfs}`, [preview, open]);
  } else if (event === 'failed') {
    await tellAuthor(change, `${head}\n❌ Не получилось: ${esc(change.error || 'ошибка')}\nМожно уточнить задачу или повторить.`, [open]);
  } else if (event === 'merged') {
    await tellAuthor(change, `${head}\n✅ Принята. На сайте появится через 5–10 минут.`, [open]);
  } else if (event === 'rejected') {
    await tellAuthor(change, `${head}\n🚫 Отклонена.${extra.reason ? `\nПричина: ${esc(extra.reason)}` : ''}`, [open]);
  }
}

module.exports = { SITE_CHANGE_ROLES, checkSecret, monthSpend, dispatch, buildPrompt, notify, previewUrl, MONTHLY_USD };
