/**
 * Чертежи от конструкторов через Telegram-бота.
 *
 * 1. Конструктор открывает ссылку t.me/<бот>?start=konstruktor (или пишет
 *    /konstruktor) и называет себя.
 * 2. Владельцам (owner с привязанным Telegram) приходит заявка с кнопками
 *    «Принять» / «Отклонить».
 * 3. Принятому конструктору бот ставит постоянную клавиатуру («Загрузить чертёж»,
 *    «Мои чертежи», «Помощь») и меню команд «/» — только в его чате: бот общий
 *    с магазином, покупателям эти команды не нужны.
 * 4. PDF уходит в Cloudinary (папка matkasym/drawings), в ответ — ссылка и
 *    кнопки «Открыть» / «Удалить». В «Моих чертежах» — список своих файлов
 *    с удалением. Удалить можно только свой чертёж.
 *
 * PDF кладём как raw, а не image: картинкой Cloudinary не отдаёт PDF по ссылке
 * без отдельной настройки аккаунта, а raw открывается в браузере как есть.
 */
const Konstruktor = require('../models/Konstruktor');
const Drawing     = require('../models/Drawing');
const User        = require('../models/User');
const { createDrawing, deleteDrawing } = require('./drawings');
const { sendTelegramMessage, downloadTelegramFile } = require('./telegram');

const TOKEN  = process.env.TELEGRAM_BOT_TOKEN;
const FOLDER = 'matkasym/drawings';
const MAX_BYTES = 20 * 1024 * 1024;   // больше бот скачать не может (лимит Bot API)
const PAGE = 5;                       // чертежей на страницу в «Моих чертежах»

const BOT_USERNAME = (process.env.TELEGRAM_BOT_USERNAME || 'productmatrixmatkasym_bot').replace('@', '');
const REGISTER_LINK = `https://t.me/${BOT_USERNAME}?start=konstruktor`;

const esc = t => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const isPdf = doc => doc && (doc.mime_type === 'application/pdf' || /\.pdf$/i.test(doc.file_name || ''));

// Надписи на клавиатуре — нажатие присылает их обычным текстом
const BTN_UPLOAD = '📤 Загрузить чертёж';
const BTN_LIST   = '📂 Мои чертежи';
const BTN_HELP   = '❓ Помощь';

const KEYBOARD = {
  keyboard: [[{ text: BTN_UPLOAD }, { text: BTN_LIST }], [{ text: BTN_HELP }]],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: 'Пришлите PDF или выберите действие',
};

// Меню «/» в чате конструктора
const COMMANDS = [
  { command: 'upload',  description: 'Как загрузить чертёж' },
  { command: 'my',      description: 'Мои чертежи — открыть или удалить' },
  { command: 'help',    description: 'Подсказка по боту' },
];

// Меню «/» для всех чатов (в том числе покупателей): только вход в регистрацию.
const DEFAULT_COMMANDS = [
  { command: 'start',       description: 'Начать' },
  { command: 'konstruktor', description: 'Регистрация конструктора (чертежи)' },
];

// Меню чертежей ставим в конкретный чат — дёшево, повторный вызов ничего не ломает
const ensureCommands = chatId =>
  tg('setMyCommands', { commands: COMMANDS, scope: { type: 'chat', chat_id: Number(chatId) } });

async function setDefaultCommands() {
  await tg('setMyCommands', { commands: DEFAULT_COMMANDS, scope: { type: 'default' } });
  // Владельцам — сразу меню чертежей: им регистрация не нужна
  for (const o of await ownerChats()) await ensureCommands(o.telegramChatId);
}

const REGISTER_RE = /^\/(konstruktor|register)(@\w+)?$|^\/start konstruktor$/i;
const UPLOAD_RE   = new RegExp(`^(/upload(@\\w+)?|${BTN_UPLOAD})$`, 'i');
const LIST_RE     = new RegExp(`^(/my(@\\w+)?|/drawings|${BTN_LIST})$`, 'i');
const HELP_RE     = new RegExp(`^(/help(@\\w+)?|${BTN_HELP})$`, 'i');

async function tg(method, body) {
  if (!TOKEN) return null;
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).then(x => x.json()).catch(() => null);
  if (r && !r.ok) console.error(`[drawingBot] ${method}:`, r.description);
  return r;
}

// Конструктор из бота — конструктор и на сайте: аккаунт с тем же Telegram получает
// роль «Конструктор». Владельца и редактора не трогаем — им чертежи и так доступны
// или роль шире и понижать её молча нельзя.
const KEEP_ROLES = ['owner', 'editor'];
async function promoteSiteUser(chatId) {
  const u = await User.findOne({ telegramChatId: String(chatId) });
  if (!u || KEEP_ROLES.includes(u.role) || u.role === 'konstruktor') return null;
  u.role = 'konstruktor';
  await u.save();
  return u;
}

const ownerChats = () =>
  User.find({ role: 'owner', telegramChatId: { $nin: [null, ''] } }, 'telegramChatId name').lean();

// Кто может загружать: принятый конструктор или владелец (ему регистрация не нужна).
// Возвращает имя автора или null.
async function uploaderName(chatId) {
  const k = await Konstruktor.findOne({ chatId, status: 'approved' }, 'name').lean();
  if (k) return k.name || 'Конструктор';
  const owner = await User.findOne({ role: 'owner', telegramChatId: chatId }, 'name').lean();
  return owner ? (owner.name || 'Владелец') : null;
}

const HELP_TEXT =
  '📐 <b>Чертежи</b>\n\n' +
  `<b>${BTN_UPLOAD}</b> — пришлите PDF файлом, в ответ придёт ссылка.\n` +
  `<b>${BTN_LIST}</b> — список ваших чертежей: открыть или удалить.\n\n` +
  'Как отправить файл: 📎 скрепка → <b>Файл</b> → выберите PDF.\n' +
  'В подписи к файлу можно написать, что это за чертёж — подпись будет видна в списке.\n\n' +
  'Ограничение Telegram — до 20 МБ на файл.';

const sendMenu = (chatId, text = HELP_TEXT) =>
  sendTelegramMessage(chatId, text, { reply_markup: KEYBOARD, disablePreview: true });

// ── Регистрация ──────────────────────────────────────────────────────────────

async function startRegistration(message, chatId) {
  const k = await Konstruktor.findOne({ chatId });
  if (k?.status === 'approved') return sendMenu(chatId, `✅ ${esc(k.name)}, вы уже зарегистрированы.\n\n${HELP_TEXT}`);
  if (k?.status === 'pending')  return sendTelegramMessage(chatId, '⏳ Заявка уже отправлена, ждём подтверждения.');
  await Konstruktor.updateOne(
    { chatId },
    { $set: { status: 'awaiting_name', username: message.from?.username || '' } },
    { upsert: true },
  );
  return sendTelegramMessage(chatId,
    '📐 <b>Регистрация конструктора</b>\n\nНапишите одним сообщением ваше <b>имя и фамилию</b>.',
    { reply_markup: { force_reply: true, input_field_placeholder: 'Имя Фамилия' } });
}

async function finishRegistration(k, text, chatId) {
  k.name = text.slice(0, 100);
  k.status = 'pending';
  await k.save();
  await sendTelegramMessage(chatId, `Спасибо, ${esc(k.name)}! Заявка отправлена — сообщу, когда её подтвердят.`,
    { reply_markup: { remove_keyboard: true } });

  const who = `<b>${esc(k.name)}</b>` + (k.username ? ` (@${esc(k.username)})` : '');
  for (const o of await ownerChats()) {
    await sendTelegramMessage(o.telegramChatId, `📐 Заявка конструктора: ${who}\n\nПосле подтверждения сможет загружать чертежи PDF.`, {
      reply_markup: { inline_keyboard: [[
        { text: '✅ Принять',   callback_data: `drw:ok:${chatId}` },
        { text: '❌ Отклонить', callback_data: `drw:no:${chatId}` },
      ]] },
    });
  }
}

/** Текстовое сообщение в личке. true — сообщение наше, дальше не обрабатывать. */
async function handleDrawingText(message) {
  if (message.chat?.type !== 'private') return false;
  const chatId = String(message.chat.id);
  const text   = String(message.text || '').trim();

  if (REGISTER_RE.test(text)) { await startRegistration(message, chatId); return true; }

  // Ответ на «напишите имя»
  const waiting = await Konstruktor.findOne({ chatId, status: 'awaiting_name' });
  if (waiting && text && !text.startsWith('/')) { await finishRegistration(waiting, text, chatId); return true; }

  const isStart = /^\/start$/i.test(text);
  const isOurs  = isStart || UPLOAD_RE.test(text) || LIST_RE.test(text) || HELP_RE.test(text);
  if (!isOurs) return false;

  const author = await uploaderName(chatId);
  if (!author) {
    if (isStart) return false;   // покупатель — пусть /start обработает магазин
    await sendTelegramMessage(chatId,
      `📐 Эта функция для конструкторов. Чтобы подать заявку, нажмите /konstruktor.`);
    return true;
  }

  await ensureCommands(chatId);
  if (LIST_RE.test(text)) { await sendList(chatId, 0); return true; }
  if (UPLOAD_RE.test(text)) {
    await sendMenu(chatId, '📤 Пришлите чертёж файлом <b>PDF</b>: 📎 скрепка → <b>Файл</b> → выберите PDF.\n\nВ подписи можно написать, что это за чертёж.');
    return true;
  }
  await sendMenu(chatId, isStart ? `👋 ${esc(author)}, здравствуйте!\n\n${HELP_TEXT}` : HELP_TEXT);
  return true;
}

// ── Список своих чертежей ────────────────────────────────────────────────────

const fmtDate = d => new Date(new Date(d).getTime() + 6 * 3600e3).toISOString().slice(0, 16).replace('T', ' ')
  .replace(/^(\d{4})-(\d\d)-(\d\d)/, '$3.$2.$1');

async function listView(chatId, page) {
  const total = await Drawing.countDocuments({ chatId });
  if (!total) return { text: `📂 У вас пока нет чертежей.\n\nПришлите PDF файлом — он появится здесь.`, kb: [] };

  const pages = Math.ceil(total / PAGE);
  page = Math.min(Math.max(0, page), pages - 1);
  const items = await Drawing.find({ chatId }).sort({ createdAt: -1 }).skip(page * PAGE).limit(PAGE).lean();

  const lines = [`📂 <b>Мои чертежи</b> — ${total}` + (pages > 1 ? ` (стр. ${page + 1} из ${pages})` : ''), ''];
  const kb = [];
  items.forEach((d, i) => {
    const n = page * PAGE + i + 1;
    lines.push(`<b>${n}.</b> ${esc(d.title || d.fileName)}` + (d.caption ? `\n    <i>${esc(d.caption.slice(0, 80))}</i>` : '') + `\n    ${fmtDate(d.createdAt)}`);
    kb.push([
      { text: `📄 ${n}. Открыть`, url: d.url },
      { text: `🗑 Удалить`, callback_data: `drw:del:${d._id}:${page}` },
    ]);
  });
  if (pages > 1) {
    const nav = [];
    if (page > 0)         nav.push({ text: '◀️ Назад',  callback_data: `drw:pg:${page - 1}` });
    if (page < pages - 1) nav.push({ text: 'Дальше ▶️', callback_data: `drw:pg:${page + 1}` });
    kb.push(nav);
  }
  return { text: lines.join('\n'), kb };
}

async function sendList(chatId, page) {
  const v = await listView(chatId, page);
  return sendTelegramMessage(chatId, v.text, { reply_markup: { inline_keyboard: v.kb }, disablePreview: true });
}

async function editList(cb, page) {
  const v = await listView(String(cb.from.id), page);
  return tg('editMessageText', {
    chat_id: cb.message.chat.id, message_id: cb.message.message_id, parse_mode: 'HTML',
    text: v.text, reply_markup: { inline_keyboard: v.kb }, disable_web_page_preview: true,
  });
}

// ── Кнопки ───────────────────────────────────────────────────────────────────

async function decideRegistration(cb, action, chatId) {
  const from  = String(cb.from?.id || '');
  const owner = await User.findOne({ role: 'owner', telegramChatId: from }, 'name').lean();
  if (!owner) return tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Решает только владелец', show_alert: true });

  const k = await Konstruktor.findOne({ chatId });
  if (!k) return tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Заявка не найдена' });

  const ok = action === 'ok';
  k.status = ok ? 'approved' : 'rejected';
  k.decidedBy = owner.name || from;
  k.decidedAt = new Date();
  await k.save();

  await tg('answerCallbackQuery', { callback_query_id: cb.id, text: ok ? 'Принят' : 'Отклонён' });
  if (cb.message) {
    await tg('editMessageText', {
      chat_id: cb.message.chat.id, message_id: cb.message.message_id, parse_mode: 'HTML',
      text: `📐 Конструктор <b>${esc(k.name)}</b> — ${ok ? '✅ принят' : '❌ отклонён'} (${esc(k.decidedBy)})`,
    });
  }
  if (ok) {
    await promoteSiteUser(chatId).catch(e => console.error('[drawingBot] promote', e.message));
    // Меню «/» — только в чате этого конструктора
    await ensureCommands(chatId);
    await sendMenu(chatId, `✅ Регистрация подтверждена!\n\n${HELP_TEXT}`);
  } else {
    await sendTelegramMessage(chatId, '❌ Заявка на регистрацию отклонена.');
  }
}

async function askDelete(cb, id, page) {
  const chatId = String(cb.from.id);
  const d = await Drawing.findOne({ _id: id, chatId }).lean();
  if (!d) return tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Чертёж уже удалён' });
  await tg('answerCallbackQuery', { callback_query_id: cb.id });
  return tg('editMessageText', {
    chat_id: cb.message.chat.id, message_id: cb.message.message_id, parse_mode: 'HTML',
    text: `🗑 Удалить чертёж <b>${esc(d.title || d.fileName)}</b>?\n\nСсылка перестанет открываться, вернуть файл будет нельзя.`,
    reply_markup: { inline_keyboard: [[
      { text: '🗑 Да, удалить', callback_data: `drw:rm:${id}:${page}` },
      { text: '↩️ Отмена',     callback_data: page === 'x' ? `drw:keep:${id}` : `drw:pg:${page}` },
    ]] },
  });
}

async function doDelete(cb, id, page) {
  const chatId = String(cb.from.id);
  // Только свой: chatId в условии, чужой чертёж не найдётся
  const d = await Drawing.findOne({ _id: id, chatId });
  if (!d) {
    await tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Чертёж уже удалён' });
  } else {
    await deleteDrawing(d);   // вместе с архивными версиями
    await tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Удалён' });
  }
  if (page === 'x') {
    return tg('editMessageText', {
      chat_id: cb.message.chat.id, message_id: cb.message.message_id, parse_mode: 'HTML',
      text: `🗑 Чертёж <b>${esc(d?.fileName || '')}</b> удалён.`,
    });
  }
  return editList(cb, Number(page));
}

// Сообщение «Чертёж загружен» с кнопками — после «Отмена» возвращаем его как было
function uploadedView(d) {
  return {
    text: `✅ Чертёж загружен\n\n📄 ${esc(d.title || d.fileName)}` + (d.caption ? `\n<i>${esc(d.caption)}</i>` : '') +
          `\n🔗 <a href="${d.url}">${d.url}</a>`,
    kb: [[
      { text: '📄 Открыть', url: d.url },
      { text: '🗑 Удалить', callback_data: `drw:del:${d._id}:x` },
    ]],
  };
}

/** Нажатие inline-кнопки. true — колбэк наш. */
async function handleDrawingCallback(cb) {
  const data = cb?.data || '';
  if (!data.startsWith('drw:')) return false;
  const [, action, a, b] = data.split(':');
  try {
    if (action === 'ok' || action === 'no') await decideRegistration(cb, action, a);
    else if (action === 'pg') { await tg('answerCallbackQuery', { callback_query_id: cb.id }); await editList(cb, Number(a)); }
    else if (action === 'del') await askDelete(cb, a, b);
    else if (action === 'rm')  await doDelete(cb, a, b);
    else if (action === 'keep') {
      const d = await Drawing.findOne({ _id: a, chatId: String(cb.from.id) }).lean();
      await tg('answerCallbackQuery', { callback_query_id: cb.id });
      if (d) {
        const v = uploadedView(d);
        await tg('editMessageText', {
          chat_id: cb.message.chat.id, message_id: cb.message.message_id, parse_mode: 'HTML',
          text: v.text, reply_markup: { inline_keyboard: v.kb }, disable_web_page_preview: true,
        });
      }
    }
  } catch (e) {
    console.error('[drawingBot] callback', e);
    await tg('answerCallbackQuery', { callback_query_id: cb.id, text: `Ошибка: ${e.message}`.slice(0, 190), show_alert: true });
  }
  return true;
}

// ── Загрузка PDF ─────────────────────────────────────────────────────────────

/** PDF в личке. true — документ наш (дальше его не трогать). */
async function handleDrawingDocument(message) {
  const doc = message.document;
  if (message.chat?.type !== 'private' || !isPdf(doc)) return false;
  const chatId = String(message.chat.id);

  const author = await uploaderName(chatId);
  if (!author) {
    await sendTelegramMessage(chatId, '📐 Загружать чертежи могут только зарегистрированные конструкторы.\n\nНажмите /konstruktor, чтобы подать заявку.');
    return true;
  }
  if (doc.file_size && doc.file_size > MAX_BYTES) {
    await sendTelegramMessage(chatId, '⚠️ Файл больше 20 МБ — бот такой скачать не может. Сожмите PDF и пришлите снова.');
    return true;
  }

  try {
    await sendTelegramMessage(chatId, `📥 Загружаю «${esc(doc.file_name)}»…`);
    const buffer = await downloadTelegramFile(doc.file_id);
    const d = await createDrawing(buffer, doc.file_name, {
      chatId, author, lastAuthor: author, source: 'bot', caption: message.caption || '',
    });
    const v = uploadedView(d);
    await sendTelegramMessage(chatId, v.text, { reply_markup: { inline_keyboard: v.kb }, disablePreview: true });
  } catch (e) {
    console.error('[drawingBot]', e);
    await sendTelegramMessage(chatId, `❌ Не получилось загрузить: ${esc(e.message)}`);
  }
  return true;
}

module.exports = { promoteSiteUser, setDefaultCommands, handleDrawingText, handleDrawingCallback, handleDrawingDocument, isPdf, REGISTER_LINK };
