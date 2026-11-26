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
//
// Claude у каждого свой: правку делает подписка того, кто её запустил (задача или
// уточнение). Личный токен (claude setup-token) человек вставляет в разделе, хранится
// зашифрованным в ClaudeToken, воркфлоу получает его вместе с задачей.
//   SITE_CHANGE_PREVIEW_URL  — шаблон адреса предпросмотра Render, {n} = номер PR
const crypto = require('crypto');
const User = require('../models/User');
const SiteChange = require('../models/SiteChange');
const ClaudeToken = require('../models/ClaudeToken');
const { sendTelegramMessage } = require('./telegram');

const REPO = 'Zhanatt/matkasym-site';
const SITE_URL = process.env.SITE_URL || 'https://matkasym-site.onrender.com';
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

// ── Личные токены Claude ────────────────────────────────────────────────────

const TOKEN_RE = /^sk-ant-oat01-[A-Za-z0-9_-]{20,}$/;
const TOKEN_TTL_DAYS = 365;   // setup-token живёт год
const tokenKey = () => {
  if (!process.env.SITE_CHANGE_SECRET) throw new Error('На сервере не задан SITE_CHANGE_SECRET');
  return crypto.createHash('sha256').update('claude-token:' + process.env.SITE_CHANGE_SECRET).digest();
};

// Чей это токен: спрашиваем у Anthropic профиль аккаунта. Токены setup-token могут не иметь
// права читать профиль — тогда null, и человек вписывает почту сам.
async function fetchClaudeAccount(token) {
  try {
    const r = await fetch('https://api.anthropic.com/api/oauth/profile', {
      headers: { Authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const a = j.account || {};
    return a.email_address || a.email || a.display_name || a.full_name || null;
  } catch { return null; }
}

const cleanAccount = v => String(v || '').trim().slice(0, 120) || null;

async function saveToken(userId, raw, account) {
  // Терминал переносит длинный токен по строкам — при копировании внутрь попадают переносы и пробелы
  const token = String(raw || '').replace(/\s+/g, '');
  if (!TOKEN_RE.test(token)) {
    const e = new Error('Это не похоже на токен Claude: он начинается с sk-ant-oat01- (команда claude setup-token)');
    e.status = 400; throw e;
  }
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', tokenKey(), iv);
  const enc = Buffer.concat([c.update(token, 'utf8'), c.final()]);
  await ClaudeToken.findOneAndUpdate({ user: userId }, {
    enc: enc.toString('base64'), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'),
    last4: token.slice(-4), addedAt: new Date(), $unset: { lastError: '' },
    ...(await accountFields(token, account)),
  }, { upsert: true });
}

async function accountFields(token, manual) {
  const auto = await fetchClaudeAccount(token);
  if (auto) return { account: auto, accountAuto: true, profileTried: true };
  const m = cleanAccount(manual);
  return m ? { account: m, accountAuto: false, profileTried: true } : { profileTried: true, $unset: { lastError: '', account: '', accountAuto: '' } };
}

// Вписать почту аккаунта вручную, не меняя токен (если Anthropic не сказал, чей он)
async function setTokenAccount(userId, account) {
  const t = await ClaudeToken.findOne({ user: userId }, 'accountAuto').lean();
  if (!t) { const e = new Error('Claude ещё не подключён'); e.status = 400; throw e; }
  if (t.accountAuto) return;   // узнанное у Anthropic вручную не перебиваем
  const m = cleanAccount(account);
  await ClaudeToken.updateOne({ user: userId }, m ? { account: m, accountAuto: false } : { $unset: { account: '', accountAuto: '' } });
}

async function readToken(userId) {
  const t = await ClaudeToken.findOne({ user: userId }).lean();
  if (!t) return null;
  const d = crypto.createDecipheriv('aes-256-gcm', tokenKey(), Buffer.from(t.iv, 'base64'));
  d.setAuthTag(Buffer.from(t.tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(t.enc, 'base64')), d.final()]).toString('utf8');
}

async function tokenInfo(userId) {
  let t = await ClaudeToken.findOne({ user: userId }, 'last4 addedAt lastError account accountAuto profileTried').lean();
  if (!t) return { connected: false };
  // Токены, подключённые до этой функции: один раз спрашиваем Anthropic, чей он
  if (!t.profileTried) {
    const acc = await readToken(userId).then(fetchClaudeAccount).catch(() => null);
    await ClaudeToken.updateOne({ user: userId }, acc ? { account: acc, accountAuto: true, profileTried: true } : { profileTried: true });
    if (acc) t = { ...t, account: acc, accountAuto: true };
  }
  const expiresAt = new Date(new Date(t.addedAt).getTime() + TOKEN_TTL_DAYS * 864e5);
  return { connected: true, last4: t.last4, addedAt: t.addedAt, expiresAt, lastError: t.lastError || null, account: t.account || null, accountAuto: !!t.accountAuto };
}

const removeToken = userId => ClaudeToken.deleteOne({ user: userId });
const setTokenError = (userId, lastError) => ClaudeToken.updateOne({ user: userId }, lastError ? { lastError } : { $unset: { lastError: '' } });

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
  const done = change.doneUpTo || 0;
  const userMsgs = change.messages.map((m, i) => ({ m, i })).filter(({ m }) => ['request', 'comment'].includes(m.kind));
  const before = userMsgs.filter(x => x.i < done).map(x => x.m);
  const now = userMsgs.filter(x => x.i >= done).map(x => x.m);
  const [first, ...rest] = before.length ? now : change.messages;
  const imgs = [];
  const withImages = m => {
    const refs = (m.images || []).map(url => {
      imgs.push(url);
      const local = `.site-change-refs/${imgs.length}${extOf(url)}`;
      if (isImageUrl(url)) return `${local} (ссылка для фото товара: ${url})`;
      if (extOf(url) === '.pdf') return local;
      const fname = decodeURIComponent(String(url).split('?')[0].split('/').pop());
      return TEXT_EXT.test(extOf(url))
        ? `«${fname}» — его содержимое текстом: ${local}.txt (оригинал: ${local})`
        : `«${fname}» — ${local} (этот формат прочитать нельзя; если без него не обойтись — спроси дизайнера)`;
    });
    return refs.length ? `\n(Приложены файлы: ${refs.join('; ')} — открой их инструментом Read.)` : '';
  };
  const lines = [
    'Ты вносишь правку во внешний вид сайта MATKASYM («Продакт матрица», React 18 + Vite, папка client/).',
    'Задачу поставил дизайнер компании, правку потом проверит и примет владелец сайта.',
    '',
    'ПРАВИЛА:',
    '- Если есть папка docs/knowledge/ — там знания о проекте (начни с README.md): договорённости, устройство данных, прошлые ошибки. Сверяйся с ними.',
    '- Меняй только файлы в client/src/ и client/public/. Сервер (server/), базу, цены, права доступа, роли, авторизацию и API не трогай.',
    '- Исключение — вёрстка PDF-каталогов. Каталоги брендов: client/src/pages/admin/catalogPrint.js, kyzmatPrint.js, brandPdfGroups.js. Каталоги сетов SHAAR: server/scripts/build-<сет>-catalog.js (сеты: uzak-koldon, mazza-seyil, onoy-sakta, 0-tastandy, bilim-kelechek, bekem-fasad, kooz-koopsuzduk, bekem-tosmo), общая вёрстка — server/lib/catalogLayout.js и catalogFonts.js. В этих серверных файлах меняй только HTML/CSS и оформление: никаких новых запросов и записи в базу, process.env, запуска программ, удаления файлов — иначе правка в файле будет отменена. Новые файлы на сервере не создавай.',
    '- Нельзя менять client/src/api/, client/src/context/, client/src/constants/roles.js, package.json, конфиги сборки — такие правки будут автоматически отменены.',
    '- Не добавляй npm-пакеты. Не удаляй функциональность, о которой не просили.',
    '- Делай ровно то, что просят, в стиле существующего кода. Если просьба неясна — выбери самое разумное толкование и напиши об этом в итоге.',
    '- Модалки — порталом в document.body (см. CLAUDE.md).',
    '- ТОВАРЫ И КАТАЛОГ. Товары живут в базе, в шаблоны и конфиги их НЕ вписывай. Чтобы добавить или изменить товар, создай в корне репозитория файл .site-change-ops.json — изменения внесёт сайт после утверждения владельцем. Текущий каталог: .site-change-data/products.jsonl (по строке на товар, с _id и артикулом — ищи Grep), brands.json (бренды и их сеты), suppliers.txt (поставщики); категории — client/src/config/categorySpecs.js.',
    '  Формат: {"ops":[ {"op":"create","product":{...},"note":"зачем"}, {"op":"update","id":"<_id>" или "sku":"<артикул>","set":{поле: значение},"note":"..."}, {"op":"supplier","name":"...","phone":"..."} ]}',
    '  Поля товара: name, fullName, sku, brand (matkasym-home | matkasym-shaar | matkasym-kyzmat), set (ключ сета этого бренда), category, color, price, priceUndefined, priceWholesale, priceDealer, description, specs ([{"key":"Высота","value":"120 см"}]), dimensions, unit, images (ссылки на приложенные фото), productStatus, isSupplied, supplier ({"company","sku"}), isOnOrder.',
    '  НЕ выдумывай цены, размеры, характеристики, артикулы, категории: только то, что дал дизайнер в переписке, или что уже есть в каталоге. Категорию бери только из существующих. Явно сказал «без цены» — "priceUndefined": true. Привозной товар — сначала op supplier, если поставщика нет в каталоге. Остатки, себестоимость и удаление товаров недоступны.',
    '  В итоге перечисли дизайнеру, какие товары добавишь или изменишь.',
    '- В конце ответь по-русски, коротко и простыми словами для дизайнера: что изменено и где это увидеть на сайте (какая страница). Без кода.',
    '- Самой последней строкой ответа обязательно напиши «Где смотреть: /адрес» — точный адрес, где видно изменение, с нужным разделом. Форматы: сет — /admin/sets?brand=<бренд>&set=<ключ сета>, к разделу-категории добавь &cat=<категория>, к товарам — &focus=<_id>,<_id>… (все изменённые); карточка товара — /admin/products/<_id>; другие страницы — по маршрутам client/src/AdminRoutes.jsx (адреса вида /admin/sets/<сет> НЕ существуют). Если изменился PDF-каталог — «Где смотреть: PDF <название каталога>».',
    '',
  ];
  if (before.length) {
    // Чат продолжили после выложенной правки: прошлое — только для контекста, оно уже на сайте
    lines.push(`ЧАТ №${change.number} «${change.title}». Раньше в этом чате уже сделали и выложили на сайт (для контекста, повторять не нужно):`);
    for (const m of before) lines.push(`- ${m.authorName}: ${(m.text || '').slice(0, 600)}`);
    lines.push('', `НОВАЯ ЗАДАЧА от ${first?.authorName}:`, (first?.text || '') + withImages(first || {}));
  } else {
    lines.push(`ЗАДАЧА №${change.number} от ${first?.authorName || change.authorName}: ${change.title}`, (first?.text || '') + withImages(first || {}));
  }
  const follow = rest.filter(m => m.kind === 'comment');
  if (follow.length) {
    lines.push('', 'Дальше пришли уточнения (если правка уже делалась — твои прошлые изменения в этой ветке). Выполни их:');
    for (const m of follow) lines.push(`- ${m.authorName}: ${m.text || ''}${withImages(m)}`);
  }
  return {
    prompt: lines.join('\n'),
    images: imgs.flatMap((url, i) => {
      const f = { url, name: `${i + 1}${extOf(url)}` };
      // текстовая копия Excel/Word лежит рядом с оригиналом (routes/siteChanges.js uploadImage)
      return TEXT_EXT.test(extOf(url)) ? [f, { url: url + '.txt', name: f.name + '.txt' }] : [f];
    }),
  };
}

// Старые вложения из Cloudinary без расширения — это картинки
function extOf(url) {
  const m = String(url).split('?')[0].match(/\.([a-z0-9]{1,6})$/i);
  return m ? `.${m[1].toLowerCase()}` : '.jpg';
}
const isImageUrl = url => /^\.(png|jpe?g|webp|gif|svg|heic|avif|bmp)$/.test(extOf(url));
const TEXT_EXT = /^\.(xlsx|xlsm|xls|ods|csv|docx|txt|md|json|xml|html?|tsv|rtf)$/;

// Текст файла для Claude (он читает только текст, картинки и PDF). null — формат не текстовый
async function fileToText(buf, ext) {
  const MAX = 400_000;
  let out = null;
  if (/^(xlsx|xlsm|xls|ods|csv|tsv)$/.test(ext)) {
    const XLSX = require('xlsx');
    const wb = XLSX.read(buf, { type: 'buffer' });
    out = wb.SheetNames.map(n => `=== Лист «${n}» ===\n` + XLSX.utils.sheet_to_csv(wb.Sheets[n], { blankrows: false })).join('\n\n');
  } else if (ext === 'docx') {
    out = (await require('mammoth').extractRawText({ buffer: buf })).value;
  } else if (/^(txt|md|json|xml|html?|rtf)$/.test(ext)) {
    out = buf.toString('utf8');
  }
  if (!out) return null;
  return out.length > MAX ? out.slice(0, MAX) + '\n…(обрезано, файл слишком большой)' : out;
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

async function tellOwners(text, buttons, extraRows) {
  for (const o of await ownerChats()) await sendTelegramMessage(o.telegramChatId, text, kb(buttons, extraRows)).catch(() => {});
}

// buttons — ряд [текст, url]; extraRows — готовые ряды inline-кнопок (callback)
const urlRow = buttons => buttons.filter(([, url]) => url).map(([text, url]) => ({ text, url }));
const kb = (buttons, extraRows = []) => {
  const rows = [...extraRows, ...(buttons?.length ? [urlRow(buttons)] : [])].filter(r => r.length);
  return rows.length ? { disablePreview: true, reply_markup: { inline_keyboard: rows } } : { disablePreview: true };
};
// Кнопки решения владельца прямо в Telegram (обработка — handleTelegramCallback)
const decideRow = change => [[
  { text: '✅ Утвердить', callback_data: `sc:ok:${change._id}` },
  { text: '🚫 Отклонить', callback_data: `sc:no:${change._id}` },
]];

async function notify(change, event, extra = {}) {
  const head = `🎨 <b>Правка сайта №${change.number}</b> · ${esc(change.title)}`;
  const open = ['Открыть', adminLink(change._id)];
  if (event === 'ready') {
    const preview = ['👀 Предпросмотр', change.previewUrl];
    const summary = extra.summary ? `\n\n${esc(String(extra.summary).replace(/\n?\s*Где смотреть:.*$/im, '')).slice(0, 1500)}` : '';
    const pdfs = (change.pdfs || []).map(p => p.url ? `\n📄 <a href="${p.url}">${esc(p.title)} — пробный PDF</a>` : `\n📄 ${esc(p.title)}: не собрался (${esc(p.error)})`).join('');
    const opsTxt = (change.dataOps || []).length
      ? '\n\n<b>Изменения в каталоге</b> (внесутся после утверждения):\n' + change.dataOps.slice(0, 15).map(o =>
          `${esc(o.label)}${o.error ? ` — ⚠️ ${esc(o.error)}` : ''}${o.warn ? `\n   ⚠️ ${esc(o.warn)}` : ''}` + (o.changes || []).slice(0, 4).map(c => `\n   ${esc(c.field)}: ${c.from !== undefined ? esc(c.from) + ' → ' : ''}${esc(c.to)}`).join('')).join('\n')
      : '';
    const reverted = change.reverted?.length ? `\n\n⚠️ Отменены правки в запрещённых файлах: ${esc(change.reverted.join(', '))}` : '';
    await tellOwners(`${head}\nОт: ${esc(change.authorName)}${summary}${opsTxt}${pdfs}${reverted}\n\n${change.prNumber ? 'Предпросмотр соберётся за 3–7 минут — пришлю, когда будет готов. ' : ''}Утвердить можно прямо здесь.`, [preview, open], decideRow(change));
    await tellAuthor(change, `${head}\nClaude закончил. Правка ждёт утверждения: ${esc(await approverName())} — без этого на сайте ничего не изменится. Предпросмотр соберётся за 3–7 минут, если нужно поправить — напишите в чат.${summary}${pdfs}`, [preview, open]);
  } else if (event === 'failed') {
    await tellAuthor(change, `${head}\n❌ Не получилось: ${esc(change.error || 'ошибка')}\nМожно уточнить задачу или повторить.`, [open]);
  } else if (event === 'question') {
    const text = esc(String(extra.text || '')).slice(0, 1500);
    await tellAuthor(change, `${head}\n${extra.answer ? '💬 Claude ответил' : '❓ Claude уточняет задачу — ответьте в чате'}:\n\n${text}`, [open]);
  } else if (event === 'preview') {
    const preview = ['👀 Предпросмотр', change.previewUrl];
    const who = await approverName();
    await tellOwners(`${head}\n✅ Предпросмотр готов. Ждёт вашего утверждения.`, [preview, open], decideRow(change));
    await tellAuthor(change, `${head}\n✅ Предпросмотр готов — можно смотреть. Правка ждёт утверждения: ${esc(who)}.`, [preview, open]);
  } else if (event === 'merged') {
    await tellAuthor(change, `${head}\n✅ Утверждена. Сайт пересобирается — сообщу, когда можно будет смотреть (обычно 5–10 минут).`, [open]);
  } else if (event === 'deployed') {
    const site = ['Открыть сайт', SITE_URL];
    await tellAuthor(change, `${head}\n🎉 Изменения уже на сайте — обновите страницу, чтобы увидеть.`, [site, open]);
    await tellOwners(`${head}\n🎉 Выложена на сайт.`, [site, open]);
  } else if (event === 'rejected') {
    await tellAuthor(change, `${head}\n🚫 Отклонена.${extra.reason ? `\nПричина: ${esc(extra.reason)}` : ''}`, [open]);
  }
}

// ── Ход работы: предпросмотр и выкладка ─────────────────────────────────────

let approverCache = { at: 0, name: '' };
// Кто утверждает правки — владелец(цы) сайта, по имени для чата
async function approverName() {
  if (Date.now() - approverCache.at < 10 * 60 * 1000 && approverCache.name) return approverCache.name;
  const owners = await User.find({ role: 'owner' }, 'name').lean();
  const names = owners.map(o => (o.name || '').split(' ')[0]).filter(Boolean);
  approverCache = { at: Date.now(), name: names.length ? names.join(' или ') : 'владелец сайта' };
  return approverCache.name;
}

const status = (doc, text) => doc.messages.push({ kind: 'status', authorName: 'Система', text });

// Предпросмотр Render собирается несколько минут после PR. Проверяем лениво — когда
// чат открыт (GET /:id), не чаще раза в 30 секунд на правку.
const previewChecked = new Map();
async function checkPreview(doc) {
  if (doc.status !== 'ready' || doc.previewReadyAt || !doc.previewUrl) return false;
  const last = previewChecked.get(String(doc._id)) || 0;
  if (Date.now() - last < 30_000) return false;
  previewChecked.set(String(doc._id), Date.now());
  try {
    const r = await fetch(`${doc.previewUrl}/api/version`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return false;
  } catch { return false; }
  doc.previewReadyAt = new Date();
  status(doc, `✅ Предпросмотр готов — можно смотреть: ${doc.previewUrl}`);
  await doc.save();
  notify(doc, 'preview').catch(() => {});
  return true;
}

// Есть ли коммит слияния в том, что сейчас крутится на боевом сайте.
// RENDER_GIT_COMMIT — коммит текущего деплоя (Render ставит сам).
async function isDeployed(doc) {
  const live = process.env.RENDER_GIT_COMMIT;
  if (process.env.IS_PULL_REQUEST === 'true') return false;
  if (!live || !doc.mergeSha) {
    // Без коммитов — запасной признак: сервер стартовал заметно позже слияния
    return !!doc.mergedAt && SERVER_START - new Date(doc.mergedAt).getTime() > 60_000;
  }
  if (live === doc.mergeSha) return true;
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) return false;
  const r = await fetch(`https://api.github.com/repos/${REPO}/compare/${doc.mergeSha}...${live}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) return false;
  const j = await r.json();
  return j.status === 'ahead' || j.status === 'identical';
}
const SERVER_START = Date.now();

async function checkDeployed(doc) {
  if (doc.status !== 'merged' || doc.deployedAt) return false;
  if (!(await isDeployed(doc).catch(() => false))) return false;
  doc.deployedAt = new Date();
  const rel = doc.releases?.[doc.releases.length - 1];
  if (rel && !rel.deployedAt) rel.deployedAt = doc.deployedAt;
  status(doc, '🎉 Готово! Изменения уже на сайте — обновите страницу (⌘R или потяните вниз на телефоне), чтобы увидеть.');
  await doc.save();
  notify(doc, 'deployed').catch(() => {});
  return true;
}

// При старте сервера: новый деплой мог принести слитые правки
async function checkAllDeployed() {
  const list = await SiteChange.find({ status: 'merged', deployedAt: null });
  for (const d of list) await checkDeployed(d).catch(e => console.error('[siteChanges] deployed check:', e.message));
}

// ── Решения владельца (сайт и Telegram) ─────────────────────────────────────

const setStatus = (doc, s) => { doc.status = s; doc.statusAt = new Date(); };

// Запись в «Историю» — каждая выложенная правка чата отдельно
function pushRelease(doc, extra = {}) {
  const bot = [...doc.messages].reverse().find(m => m.kind === 'bot');
  const decided = [...doc.messages].reverse().find(m => m.kind === 'decision');
  doc.releases.push({ at: new Date(), summary: String(bot?.text || '').replace(/\n?\s*Где смотреть:.*$/im, '').trim(),
    viewPath: doc.viewPath, files: doc.files, approvedBy: decided?.authorName, prUrl: doc.prUrl, mergeSha: doc.mergeSha,
    ops: (doc.dataOps || []).filter(o => o.applied).map(o => o.label), ...extra });
}

async function approveChange(doc, user) {
  const ops = (doc.dataOps || []).filter(o => !o.error && !o.applied);
  if (doc.status !== 'ready' || (!doc.prNumber && !ops.length)) { const e = new Error('Утвердить можно только готовую правку'); e.status = 409; throw e; }
  doc.decidedBy = user._id; doc.decidedAt = new Date();
  doc.messages.push({ kind: 'decision', author: user._id, authorName: user.name, text: '✅ Утверждено' });

  // Сначала каталог: товары вносятся от имени утвердившего, обычными маршрутами админки
  if (ops.length) {
    status(doc, `🗂 ${user.name} утвердил(а). Вношу изменения в каталог…`);
    await doc.save();
    const results = await require('./siteOps').applyOps(doc.dataOps, user);
    doc.markModified('dataOps');
    const bad = results.filter(r => !r.ok);
    // Ссылка — на карточки всех внесённых товаров (точнее, чем страница от Claude)
    const ids = doc.dataOps.filter(o => o.applied && o.id).map(o => o.id);
    const link = ids.length && await require('./siteOps').productLink(ids).catch(() => null);
    if (link) doc.viewPath = link;
    status(doc, results.map(r => `${r.ok ? '✅' : '❌'} ${r.label}${r.ok ? '' : ` — ${r.error}`}`).join('\n'));
    if (bad.length) {
      setStatus(doc, 'failed');
      doc.error = `Не все изменения каталога внесены (${bad.length} из ${results.length}) — подробности в чате. Код сайта не выкладывался.`;
      await doc.save();
      notify(doc, 'failed').catch(() => {});
      return;
    }
  }

  if (doc.prNumber) {
    await dispatch('site-change-merge', doc);
    setStatus(doc, 'merging');
    status(doc, `🚀 ${user.name} утвердил(а). Выкладываю правку на сайт…`);
  } else {
    // Только каталог, кода нет — изменения уже на сайте
    setStatus(doc, 'merged');
    doc.mergedAt = doc.deployedAt = new Date();
    pushRelease(doc, { deployedAt: doc.deployedAt });
    status(doc, '🎉 Готово! Изменения в каталоге внесены и уже на сайте — обновите страницу, чтобы увидеть.');
    notify(doc, 'deployed').catch(() => {});
  }
  await doc.save();
}

// owner — решает владелец (отклонить), иначе автор отменяет свою
async function rejectChange(doc, user, reason = '', owner = true) {
  if (['merging', 'merged', 'rejected', 'cancelled'].includes(doc.status)) { const e = new Error('Правка уже закрыта'); e.status = 409; throw e; }
  const mine = String(doc.author) === String(user._id);
  const cancelled = !owner || mine && !reason;
  setStatus(doc, cancelled ? 'cancelled' : 'rejected');
  doc.decidedBy = user._id; doc.decidedAt = new Date();
  doc.messages.push({ kind: 'decision', author: user._id, authorName: user.name, text: (cancelled ? '↩️ Отменено' : '🚫 Отклонено') + (reason ? `: ${reason}` : '') });
  await doc.save();
  dispatch('site-change-close', doc).catch(e => console.error('[siteChanges] close:', e.message));
  if (!cancelled) notify(doc, 'rejected', { reason }).catch(() => {});
}

async function tg(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return r.json().catch(() => ({}));
}

const STATUS_TEXT = { merging: 'уже выкладывается', merged: 'уже на сайте', rejected: 'уже отклонена', cancelled: 'отменена автором', working: 'Claude сейчас её дорабатывает', queued: 'Claude сейчас её дорабатывает', failed: 'не получилась — см. чат' };

/** Кнопки под сообщением о правке. true — колбэк наш. Двойное нажатие: решение → подтверждение. */
async function handleTelegramCallback(cb) {
  const data = cb?.data || '';
  if (!data.startsWith('sc:')) return false;
  const [, action, id] = data.split(':');
  const answer = (text, alert = false) => tg('answerCallbackQuery', { callback_query_id: cb.id, text, show_alert: alert });
  const setKb = rows => cb.message && tg('editMessageReplyMarkup', { chat_id: cb.message.chat.id, message_id: cb.message.message_id, reply_markup: { inline_keyboard: rows } });
  // URL-кнопки сообщения (предпросмотр, открыть) сохраняем при любых правках клавиатуры
  const urlRows = (cb.message?.reply_markup?.inline_keyboard || []).filter(r => r.every(b => b.url));

  const owner = await User.findOne({ role: 'owner', telegramChatId: String(cb.from?.id || '') });
  if (!owner) { await answer('Утверждает только владелец', true); return true; }
  const doc = await SiteChange.findById(id).catch(() => null);
  if (!doc) { await answer('Правка не найдена', true); return true; }
  if (doc.status !== 'ready') {
    await answer(`Правка №${doc.number} ${STATUS_TEXT[doc.status] || doc.status}`, true);
    await setKb(urlRows);
    return true;
  }

  if (action === 'ok' || action === 'no') {
    const ok = action === 'ok';
    await answer();
    await setKb([[
      { text: ok ? '✅ Да, выложить на сайт' : '🚫 Да, отклонить', callback_data: `sc:${ok ? 'okc' : 'noc'}:${id}` },
      { text: 'Отмена', callback_data: `sc:back:${id}` },
    ], ...urlRows]);
  } else if (action === 'back') {
    await answer();
    await setKb([...decideRow(doc), ...urlRows]);
  } else if (action === 'okc') {
    await approveChange(doc, owner);
    await answer('Утверждено — выкладываю');
    await setKb(urlRows);
    if (cb.message) await tg('sendMessage', { chat_id: cb.message.chat.id, reply_to_message_id: cb.message.message_id, text: `✅ Правка №${doc.number} утверждена. Сайт пересобирается — напишу, когда можно смотреть.` });
  } else if (action === 'noc') {
    await rejectChange(doc, owner, '', true);
    await answer('Отклонено');
    await setKb(urlRows);
    if (cb.message) await tg('sendMessage', { chat_id: cb.message.chat.id, reply_to_message_id: cb.message.message_id, text: `🚫 Правка №${doc.number} отклонена. Причину можно написать дизайнеру в чате правки на сайте.` });
  } else {
    await answer();
  }
  return true;
}

// Напоминание владельцу о правке на утверждении — то же сообщение с кнопками
async function notifyOwnersReady(change) {
  const head = `🎨 <b>Правка сайта №${change.number}</b> · ${esc(change.title)}`;
  const last = [...change.messages].reverse().find(m => m.kind === 'bot');
  const summary = last?.text ? `\n\n${esc(last.text).slice(0, 1500)}` : '';
  const preview = change.previewReadyAt ? '✅ Предпросмотр готов.' : 'Предпросмотр ещё собирается.';
  await tellOwners(`${head}\nОт: ${esc(change.authorName)}${summary}\n\n⏳ Ждёт вашего утверждения. ${preview}`,
    [['👀 Предпросмотр', change.previewUrl], ['Открыть', adminLink(change._id)]], decideRow(change));
}

module.exports = { pushRelease, notifyOwnersReady, approveChange, rejectChange, handleTelegramCallback, approverName, status, checkPreview, checkDeployed, checkAllDeployed, SITE_CHANGE_ROLES, checkSecret, dispatch, buildPrompt, notify, previewUrl, saveToken, readToken, tokenInfo, setTokenAccount, fileToText, removeToken, setTokenError };
