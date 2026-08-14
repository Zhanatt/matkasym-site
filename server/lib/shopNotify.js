/**
 * Уведомления Telegram-магазина: клиенту и менеджеру.
 *
 * Написать клиенту бот может только после того, как тот сам открыл с ним диалог.
 * Mini App по прямой ссылке (t.me/<бот>/<приложение>) диалог создаёт, но кнопку «Начать»
 * клиент мог и не нажать — тогда Telegram отвечает «bot can't initiate conversation».
 * Это не ошибка сервера: заявка уже в Битриксе, менеджер всё равно позвонит.
 */
const { sendTelegramMessage } = require('./telegram');

const SITE_URL = process.env.SITE_URL || 'https://matkasym-site.onrender.com';
// Ссылка на сам Mini App: t.me/<бот>/<короткое имя приложения из BotFather>
const APP_LINK = () => {
  const bot = process.env.TELEGRAM_BOT_USERNAME;
  const app = process.env.TELEGRAM_SHOP_APP || 'shop';
  return bot ? `https://t.me/${bot.replace('@', '')}/${app}` : `${SITE_URL}/shop`;
};

const money = n => `${Number(n || 0).toLocaleString('ru')} сом`;

// Куда падает копия заявки для дежурного менеджера. Не задан — обходимся Битриксом.
const managerChat = () => process.env.SHOP_MANAGER_CHAT_ID || '';

/** Клиенту: заявка принята. */
async function notifyRequestAccepted(request) {
  const chatId = request.customer?.tgUserId;
  if (!chatId || chatId === 'dev') return;

  const text = [
    '✅ <b>Заявка принята</b>',
    '',
    `🛍 ${request.snapshot.name}`,
    request.snapshot.sku ? `Артикул: ${request.snapshot.sku}` : '',
    `Количество: ${request.qty} шт.`,
    `Цена: ${money(request.snapshot.price)}`,
    '',
    'Менеджер проверит наличие и свяжется с вами в ближайшее время.',
    request.customer.phone ? `Мы позвоним на ${request.customer.phone}.` : '',
  ].filter(Boolean).join('\n');

  await sendTelegramMessage(chatId, text, { disablePreview: true });
}

/** Менеджеру: новая заявка (если задан SHOP_MANAGER_CHAT_ID). */
async function notifyManagerNewRequest(request) {
  const chatId = managerChat();
  if (!chatId) return;

  const tg = request.customer?.tgUsername
    ? `@${request.customer.tgUsername}`
    : `id ${request.customer?.tgUserId || '—'}`;
  const text = [
    '🛍 <b>Заявка из Telegram-магазина</b>',
    '',
    `${request.snapshot.name}${request.qty > 1 ? ` × ${request.qty}` : ''}`,
    request.snapshot.sku ? `Артикул: ${request.snapshot.sku}` : '',
    `Цена: ${money(request.snapshot.price)} · остаток: ${request.snapshot.stock} шт.`,
    '',
    `Клиент: ${request.customer?.name || '—'} · ${request.customer?.phone || 'без телефона'} · ${tg}`,
    request.comment ? `Комментарий: ${request.comment}` : '',
    request.bitrix?.dealId
      ? `Сделка в Битриксе: #${request.bitrix.dealId}`
      : `⚠️ Сделка НЕ создана: ${request.bitrix?.error || 'причина не записана'}`,
  ].filter(Boolean).join('\n');

  await sendTelegramMessage(chatId, text, { disablePreview: true });
}

/**
 * Товар снова на складе — сообщаем всем, кто просил об этом.
 * Вызывается после выгрузки остатков: на вход идут записи StockLog этой выгрузки,
 * нас интересуют только переходы 0 → больше нуля.
 */
async function notifyRestocked(stockLogDocs = []) {
  const restockedIds = stockLogDocs
    .filter(d => d.fromStock === 0 && d.toStock > 0)
    .map(d => String(d.productId));
  if (!restockedIds.length) return 0;

  const ShopRequest = require('../models/ShopRequest');
  const waiting = await ShopRequest.find({
    product:         { $in: restockedIds },
    notifyOnRestock: true,
    notifiedAt:      { $exists: false },
    status:          { $in: ['new', 'out_of_stock'] },
  }).populate('product', 'name fullName price images driveImages stock');

  let sent = 0;
  for (const req of waiting) {
    const chatId = req.customer?.tgUserId;
    if (!chatId || chatId === 'dev') continue;

    const price = req.product?.price || req.snapshot.price;
    const text = [
      '🎉 <b>Товар снова в наличии!</b>',
      '',
      `🛍 ${req.snapshot.name}`,
      `Цена: ${money(price)}`,
      '',
      'Вы просили сообщить, когда он появится на складе. Откройте магазин и оставьте заявку — менеджер оформит заказ.',
    ].join('\n');
    // Кнопкой, а не картинкой: sendPhoto не умеет inline-клавиатуру,
    // а клиенту нужен именно вход обратно в магазин.
    await sendTelegramMessage(chatId, text, {
      disablePreview: true,
      reply_markup: { inline_keyboard: [[{ text: '🛍 Открыть магазин', url: APP_LINK() }]] },
    });

    req.notifiedAt = new Date();
    await req.save();
    sent++;
  }

  if (sent) console.log(`[shopNotify] «снова в наличии» отправлено: ${sent}`);
  return sent;
}

module.exports = { notifyRequestAccepted, notifyManagerNewRequest, notifyRestocked, APP_LINK };
