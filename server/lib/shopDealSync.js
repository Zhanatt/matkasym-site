/**
 * Обратная связь по заявке идёт из Битрикса, а не с сайта.
 *
 * Менеджер работает только в CRM: двигает сделку по стадиям — а покупатель сидит
 * в Telegram и в CRM не заходит. Поэтому раз в минуту (тот же тик, что у автопубликаций)
 * смотрим стадии сделок по открытым заявкам и на КАЖДУЮ смену пишем клиенту.
 *
 * Опрос, а не входящий вебхук Битрикса: вебхук надо заводить руками в портале и
 * следить, чтобы он не отвалился, а тик у нас уже есть и переживает сон Render.
 *
 * Смысл стадий воронки «розничные продажи» (49):
 *   C49:NEW            заявка принята, менеджер ещё не ответил   — молчим
 *   C49:EXECUTING      взял в работу                             — молчим, он сам звонит
 *   C49:FINAL_INVOICE  товар есть, выставлен счёт                — «есть, оплатите»
 *   C49:WON            оплачено                                  — «спасибо»
 *   C49:LOSE           товара нет / клиент отказался             — извиняемся, ждём поступления
 */
const { call } = require('../utils/bitrix24');
const ShopRequest = require('../models/ShopRequest');
const { sendTelegramMessage } = require('./telegram');
const { APP_LINK } = require('./shopNotify');

// Поле в карточке сделки: «Наличие для клиента» — список «Есть / Нет».
// Отвечать им прямее, чем двигать сделку по стадиям: стадия про этап продажи,
// а вопрос у покупателя ровно один — есть товар или нет.
// Заводится скриптом scripts/create-shop-stock-field.js.
const STOCK_FIELD = process.env.BITRIX_SHOP_STOCK_FIELD || 'UF_CRM_SHOP_STOCK';

const IN_STOCK_TEXT = r => [
  '✅ <b>Товар есть в наличии</b>',
  '',
  `🛍 ${r.snapshot.name} — ${r.qty} шт.`,
  '',
  'Менеджер свяжется с вами и подскажет, как оплатить переводом MBank.',
].join('\n');

const OUT_OF_STOCK_TEXT = r => [
  '😔 <b>Приносим извинения</b>',
  '',
  `${r.snapshot.name} сейчас нет в наличии.`,
  '',
  r.notifyOnRestock
    ? 'Мы сообщим вам сюда, как только товар снова появится на складе.'
    : 'Загляните в магазин позже — ассортимент обновляется.',
].join('\n');

const STAGE_ACTIONS = {
  'C49:FINAL_INVOICE': { status: 'in_stock', text: IN_STOCK_TEXT },
  'C49:WON': {
    status: 'done',
    text: r => [
      '🎉 <b>Спасибо за покупку!</b>',
      '',
      `${r.snapshot.name} — ${r.qty} шт.`,
      '',
      'Будем рады видеть вас снова.',
    ].join('\n'),
  },
  'C49:LOSE': { status: 'out_of_stock', text: OUT_OF_STOCK_TEXT },
};

// Значения списка «Наличие для клиента» приходят числовыми id — держим карту
// id → текст. Поле заводится один раз, поэтому читаем его метаданные один раз за жизнь процесса.
let stockItemsCache = null;
async function stockFieldItems() {
  if (stockItemsCache) return stockItemsCache;
  try {
    const fields = await call('crm.deal.userfield.list', { filter: { FIELD_NAME: STOCK_FIELD } });
    stockItemsCache = new Map((fields?.[0]?.LIST || []).map(i => [String(i.ID), String(i.VALUE)]));
  } catch (e) {
    console.error('[shopDealSync] поле наличия не прочиталось:', e.message);
    stockItemsCache = new Map();
  }
  return stockItemsCache;
}

/**
 * Один проход: сверяем стадии сделок по заявкам, которые ещё в работе.
 * → сколько сообщений отправлено.
 */
async function syncShopDeals() {
  const open = await ShopRequest.find({
    'bitrix.dealId': { $nin: ['', null] },
    status: { $in: ['new', 'in_stock', 'out_of_stock'] },
  }).limit(200);
  if (!open.length) return 0;

  const byDeal = new Map(open.map(r => [String(r.bitrix.dealId), r]));
  const deals = await call('crm.deal.list', {
    filter: { ID: [...byDeal.keys()] },
    select: ['ID', 'STAGE_ID', STOCK_FIELD],
  });
  const items = await stockFieldItems();

  let sent = 0;
  for (const deal of deals) {
    const req = byDeal.get(String(deal.ID));
    if (!req) continue;

    const stage  = String(deal.STAGE_ID || '');
    const answer = String(deal[STOCK_FIELD] || '');
    const stageChanged  = stage  && stage  !== req.bitrix.stage;
    const answerChanged = answer && answer !== req.bitrix.stockAnswer;
    if (!stageChanged && !answerChanged) continue;

    // У заявки, заведённой до появления этой синхронизации, стадии не записано —
    // такой первый проход только запоминает её: сообщать о том, что случилось раньше, поздно.
    const known = !!req.bitrix.stage;
    req.bitrix.stage = stage || req.bitrix.stage;

    // Ответ полем главнее стадии: менеджер сказал прямо, есть товар или нет.
    let action = null;
    if (answerChanged) {
      req.bitrix.stockAnswer = answer;
      const text = items.get(answer) || '';
      if (/нет/i.test(text))       action = { status: 'out_of_stock', text: OUT_OF_STOCK_TEXT };
      else if (/есть/i.test(text)) action = { status: 'in_stock',     text: IN_STOCK_TEXT };
    }
    if (!action && stageChanged) action = STAGE_ACTIONS[stage] || null;

    if (action) {
      req.status = action.status;
      const chatId = req.customer?.tgUserId;
      if (known && chatId && chatId !== 'dev') {
        await sendTelegramMessage(chatId, action.text(req), {
          disablePreview: true,
          reply_markup: { inline_keyboard: [[{ text: '🛍 Открыть магазин', url: APP_LINK() }]] },
        });
        sent++;
      }
    }
    await req.save();
  }

  if (sent) console.log(`[shopDealSync] сообщений клиентам: ${sent}`);
  return sent;
}

module.exports = { syncShopDeals, STAGE_ACTIONS };
