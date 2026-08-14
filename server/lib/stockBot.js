/**
 * Обновление остатков файлом, присланным боту в Telegram.
 *
 * Ежедневная рутина владельца: выгрузить остатки из 1С на удалённом сервере и
 * загрузить их на сайт. Второй шаг — этот модуль: файл, отправленный боту,
 * проезжает ровно тот же код, что и кнопка «Остатки» в админке (lib/stockSync.js),
 * а в ответ приходит тот же отчёт. Компьютер для этого не нужен — работает и с телефона.
 *
 * Правило доступа жёсткое: только owner и только в личном чате. Бот сидит в группах
 * и каналах ради автопубликаций, и чужая таблица, брошенная в канал, не должна
 * переписать остатки всего каталога.
 */
const StockLog = require('../models/StockLog');
const User     = require('../models/User');
const { sendTelegramMessage, downloadTelegramFile } = require('./telegram');
const { applyStockUpload, detectBaseFromBuffer } = require('./stockSync');
const { BASES, BASE_KEYS, isBaseKey } = require('./stockBases');

const SITE_URL = process.env.SITE_URL || 'https://matkasym-site.onrender.com';

// Загрузка идёт минуты: за это время можно успеть прислать второй файл, и две
// bulkWrite по всему каталогу поедут внахлёст. Пока одна идёт — вторую не берём.
let busy = false;

const isExcel = name => /\.xlsx?$/i.test(String(name || ''));

// База из подписи к файлу: «matkasym», «make-in», «qtop». Пишут по-разному,
// поэтому сверяем и с ключом базы, и с её названием.
function baseFromCaption(caption = '') {
  const s = String(caption).toLowerCase().replace(/[-_\s]/g, '');
  if (!s) return '';
  return BASE_KEYS.find(k =>
    s.includes(k) || s.includes(BASES[k].label.toLowerCase().replace(/[-_\s]/g, ''))
  ) || '';
}

function formatReport(r) {
  const lines = [
    `✅ Остатки базы «${r.baseLabel}» обновлены`,
    '',
    `Совпало: <b>${r.matched}</b>` + (r.zeroed ? ` · обнулилось: <b>${r.zeroed}</b>` : ''),
  ];
  if (r.warehouses?.length) lines.push(`Склады: ${r.warehouses.join(' + ')}`);
  if (r.kitsUpdated)    lines.push(`Комплекты пересчитаны: ${r.kitsUpdated}`);
  if (r.buffersUpdated) lines.push(`Буферный запас обновлён: ${r.buffersUpdated}`);
  if (r.skuLearned)     lines.push(`Новых связей по артикулу: ${r.skuLearned}`);

  // Новые позиции не заводим молча: в выгрузке кроме товаров лежат группы и сырьё
  const fresh = (r.newItems || []).filter(i => !i.isGroup);
  if (fresh.length) {
    lines.push('', `🆕 В 1С есть, в каталоге нет: <b>${fresh.length}</b>`);
    for (const i of fresh.slice(0, 5)) lines.push(`• ${i.name} — ${i.stock} шт.`);
    if (fresh.length > 5) lines.push(`…и ещё ${fresh.length - 5}`);
    lines.push(`<a href="${SITE_URL}/admin">Завести их в админке →</a>`);
  }
  return lines.join('\n');
}

/**
 * Файл из личного чата с ботом. Вызывается уже после ответа Telegram'у 200:
 * загрузка длится дольше таймаута вебхука, и Telegram прислал бы апдейт повторно.
 */
async function handleStockDocument(message) {
  const chatId = message.chat?.id;
  const doc    = message.document;
  if (!chatId || !doc) return;

  // Только личка: в группах и каналах бот живёт ради публикаций
  if (message.chat?.type !== 'private') return;
  if (!isExcel(doc.file_name)) {
    return sendTelegramMessage(chatId, '📄 Жду выгрузку остатков из 1С — файл <b>.xlsx</b>.');
  }

  const user = await User.findOne({ telegramChatId: String(chatId) });
  if (!user || user.role !== 'owner') {
    return sendTelegramMessage(chatId,
      '⛔️ Обновлять остатки может только владелец.\n\n' +
      'Если это вы — привяжите аккаунт: в админке «Пользователи» → кнопка Telegram.');
  }

  if (busy) {
    return sendTelegramMessage(chatId, '⏳ Предыдущая загрузка ещё идёт. Пришлите файл через минуту.');
  }

  busy = true;
  try {
    await sendTelegramMessage(chatId, `📥 Принял «${doc.file_name}», обновляю остатки…`);
    const buffer = await downloadTelegramFile(doc.file_id);

    // Базу берём из подписи, иначе определяем по шапке файла. Не угадываем:
    // загрузка не в ту базу обнулит остатки всего каталога.
    const asked = baseFromCaption(message.caption);
    const base  = asked || detectBaseFromBuffer(buffer);
    if (!base || !isBaseKey(base)) {
      return await sendTelegramMessage(chatId,
        '🤔 Не понял, из какой базы выгрузка — шапка не похожа ни на одну.\n\n' +
        'Пришлите файл ещё раз и напишите базу в подписи: ' +
        BASE_KEYS.map(k => `<code>${k}</code>`).join(' / '));
    }

    const report = await applyStockUpload(buffer, base, user);
    await sendTelegramMessage(chatId, formatReport(report), { disablePreview: true });
  } catch (e) {
    console.error('[stockBot]', e);
    await sendTelegramMessage(chatId, `❌ Не получилось: ${e.message}`);
  } finally {
    busy = false;
  }
}

// ── Напоминание, если выгрузки за день не было ──────────────────────────────
// Дёргается внешним cron'ом вместе с автопубликациями: на бесплатном Render
// сервис засыпает и собственный таймер не идёт.

const BISHKEK_OFFSET_H = 6;          // UTC+6, без переходов на летнее время
const REMIND_FROM_HOUR = 11;         // раньше выгрузку обычно ещё не делали
const REMIND_TO_HOUR   = 14;         // после — напоминать поздно, день прошёл

let remindedOn = '';                 // «2026-08-14», чтобы не повторяться за тик

const bishkekNow = () => new Date(Date.now() + BISHKEK_OFFSET_H * 3600 * 1000);

async function remindIfNoStockToday() {
  const now  = bishkekNow();
  const hour = now.getUTCHours();
  if (hour < REMIND_FROM_HOUR || hour >= REMIND_TO_HOUR) return null;

  const day = now.toISOString().slice(0, 10);
  if (remindedOn === day) return null;

  // Начало суток по Бишкеку в UTC
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - BISHKEK_OFFSET_H * 3600 * 1000);
  const uploaded = await StockLog.exists({ source: 'excel', createdAt: { $gte: dayStart } });
  if (uploaded) { remindedOn = day; return null; }

  const owners = await User.find({ role: 'owner', telegramChatId: { $nin: [null, ''] } }, 'telegramChatId').lean();
  for (const o of owners) {
    await sendTelegramMessage(o.telegramChatId,
      '⏰ Остатки сегодня ещё не обновлялись.\n\nПришлите выгрузку из 1С сюда файлом — обновлю сам.');
  }
  remindedOn = day;
  return owners.length;
}

module.exports = { handleStockDocument, remindIfNoStockToday, formatReport, baseFromCaption };
