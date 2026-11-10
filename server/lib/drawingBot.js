/**
 * Чертежи от конструкторов через Telegram-бота.
 *
 * 1. Конструктор пишет боту /konstruktor и своё имя.
 * 2. Владельцам (owner с привязанным Telegram) приходит заявка с кнопками
 *    «Принять» / «Отклонить».
 * 3. Принятый конструктор присылает PDF — файл уходит в Cloudinary в папку
 *    matkasym/drawings, в ответ приходит ссылка на документ.
 *
 * PDF кладём как raw, а не image: картинкой Cloudinary не отдаёт PDF по ссылке
 * без отдельной настройки аккаунта, а raw открывается в браузере как есть.
 */
const Konstruktor = require('../models/Konstruktor');
const Drawing     = require('../models/Drawing');
const User        = require('../models/User');
const cloudinary  = require('./cloudinary');
const { sendTelegramMessage, downloadTelegramFile } = require('./telegram');

const TOKEN  = process.env.TELEGRAM_BOT_TOKEN;
const FOLDER = 'matkasym/drawings';
const MAX_BYTES = 20 * 1024 * 1024;   // больше бот скачать не может (лимит Bot API)

const esc = t => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const isPdf = doc => doc && (doc.mime_type === 'application/pdf' || /\.pdf$/i.test(doc.file_name || ''));

const REGISTER_RE = /^\/(konstruktor|konstrukt|register|чертеж|чертёж)\b/i;

async function tg(method, body) {
  if (!TOKEN) return null;
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).then(x => x.json()).catch(() => null);
  if (r && !r.ok) console.error(`[drawingBot] ${method}:`, r.description);
  return r;
}

const ownerChats = async () =>
  (await User.find({ role: 'owner', telegramChatId: { $nin: [null, ''] } }, 'telegramChatId name').lean());

// Владелец тоже может присылать чертежи — регистрироваться ему не нужно
async function isOwnerChat(chatId) {
  return !!(await User.exists({ role: 'owner', telegramChatId: String(chatId) }));
}

// ── Регистрация ──────────────────────────────────────────────────────────────

/** Текстовое сообщение в личке. true — сообщение наше, дальше не обрабатывать. */
async function handleDrawingText(message) {
  if (message.chat?.type !== 'private') return false;
  const chatId = String(message.chat.id);
  const text   = String(message.text || '').trim();

  if (REGISTER_RE.test(text)) {
    const k = await Konstruktor.findOne({ chatId });
    if (k?.status === 'approved') {
      await sendTelegramMessage(chatId, `✅ ${esc(k.name)}, вы уже зарегистрированы.\n\nПрисылайте чертёж файлом <b>PDF</b> — в ответ придёт ссылка.`);
      return true;
    }
    if (k?.status === 'pending') {
      await sendTelegramMessage(chatId, '⏳ Заявка уже отправлена, ждём подтверждения.');
      return true;
    }
    await Konstruktor.updateOne(
      { chatId },
      { $set: { status: 'awaiting_name', username: message.from?.username || '' } },
      { upsert: true },
    );
    await sendTelegramMessage(chatId, '📐 Регистрация конструктора.\n\nНапишите одним сообщением ваше <b>имя и фамилию</b>.');
    return true;
  }

  // Ответ на «напишите имя»
  if (!text || text.startsWith('/')) return false;
  const k = await Konstruktor.findOne({ chatId, status: 'awaiting_name' });
  if (!k) return false;

  k.name = text.slice(0, 100);
  k.status = 'pending';
  await k.save();
  await sendTelegramMessage(chatId, `Спасибо, ${esc(k.name)}! Заявка отправлена, сообщу, когда её подтвердят.`);

  const who = `<b>${esc(k.name)}</b>` + (k.username ? ` (@${esc(k.username)})` : '');
  for (const o of await ownerChats()) {
    await sendTelegramMessage(o.telegramChatId, `📐 Заявка конструктора: ${who}\n\nПосле подтверждения сможет загружать чертежи PDF.`, {
      reply_markup: { inline_keyboard: [[
        { text: '✅ Принять',   callback_data: `drw:ok:${chatId}` },
        { text: '❌ Отклонить', callback_data: `drw:no:${chatId}` },
      ]] },
    });
  }
  return true;
}

/** Кнопка «Принять / Отклонить». true — колбэк наш. */
async function handleDrawingCallback(cb) {
  const m = /^drw:(ok|no):(-?\d+)$/.exec(cb?.data || '');
  if (!m) return false;
  const [, action, chatId] = m;
  const from = String(cb.from?.id || '');

  const owner = await User.findOne({ role: 'owner', telegramChatId: from }, 'name').lean();
  if (!owner) {
    await tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Решает только владелец', show_alert: true });
    return true;
  }

  const k = await Konstruktor.findOne({ chatId });
  if (!k) {
    await tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Заявка не найдена' });
    return true;
  }

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
  await sendTelegramMessage(chatId, ok
    ? '✅ Регистрация подтверждена!\n\nПрисылайте чертёж файлом <b>PDF</b> — в ответ придёт ссылка на документ. В подписи к файлу можно написать, что это за чертёж.'
    : '❌ Заявка на регистрацию отклонена.');
  return true;
}

// ── Загрузка PDF ─────────────────────────────────────────────────────────────

// Имя файла в Cloudinary: исходное (латиница/кириллица/цифры) + метка времени,
// чтобы чертёж с тем же именем не затёр предыдущую версию.
// Кириллицу переводим в латиницу: иначе ссылка превращается в %D0%A1%D1%82…
const TR = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',
  ң:'n',о:'o',ө:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ү:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',
  ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
const translit = t => String(t).replace(/[а-яёңөү]/gi, ch => {
  const r = TR[ch.toLowerCase()] ?? '';
  return ch === ch.toLowerCase() ? r : r.charAt(0).toUpperCase() + r.slice(1);
});

function publicIdFor(fileName) {
  const base = translit(String(fileName || 'drawing').replace(/\.pdf$/i, ''))
    .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'drawing';
  const stamp = new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 19).replace(/[-:T]/g, '');
  return `${base}_${stamp}.pdf`;   // у raw расширение — часть public_id, без него ссылка без .pdf
}

function uploadPdf(buffer, fileName) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder: FOLDER, resource_type: 'raw', public_id: publicIdFor(fileName), overwrite: false },
      (err, res) => (err ? reject(err) : resolve(res)),
    ).end(buffer);
  });
}

/** PDF в личке. true — документ наш (дальше его не трогать). */
async function handleDrawingDocument(message) {
  const doc = message.document;
  if (message.chat?.type !== 'private' || !isPdf(doc)) return false;
  const chatId = String(message.chat.id);

  const k = await Konstruktor.findOne({ chatId, status: 'approved' }).lean();
  const owner = !k && await isOwnerChat(chatId);
  if (!k && !owner) {
    await sendTelegramMessage(chatId, '📐 Загружать чертежи могут только зарегистрированные конструкторы.\n\nНапишите /konstruktor, чтобы подать заявку.');
    return true;
  }
  if (doc.file_size && doc.file_size > MAX_BYTES) {
    await sendTelegramMessage(chatId, '⚠️ Файл больше 20 МБ — бот такой скачать не может. Сожмите PDF и пришлите снова.');
    return true;
  }

  try {
    await sendTelegramMessage(chatId, `📥 Загружаю «${esc(doc.file_name)}»…`);
    const buffer = await downloadTelegramFile(doc.file_id);
    const res = await uploadPdf(buffer, doc.file_name);
    await Drawing.create({
      chatId, author: k?.name || 'Владелец', fileName: doc.file_name || '',
      caption: message.caption || '', size: buffer.length, url: res.secure_url, publicId: res.public_id,
    });
    await sendTelegramMessage(chatId,
      `✅ Чертёж загружен\n\n📄 ${esc(doc.file_name)}\n🔗 <a href="${res.secure_url}">${res.secure_url}</a>`,
      { disablePreview: true });
  } catch (e) {
    console.error('[drawingBot]', e);
    await sendTelegramMessage(chatId, `❌ Не получилось загрузить: ${esc(e.message)}`);
  }
  return true;
}

module.exports = { handleDrawingText, handleDrawingCallback, handleDrawingDocument, isPdf };
