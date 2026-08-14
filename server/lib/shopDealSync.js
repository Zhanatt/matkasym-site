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

const STAGE_ACTIONS = {
  'C49:FINAL_INVOICE': {
    status: 'in_stock',
    text: r => [
      '✅ <b>Товар есть в наличии</b>',
      '',
      `🛍 ${r.snapshot.name} — ${r.qty} шт.`,
      '',
      'Менеджер готовит счёт: оплатить можно переводом MBank по реквизитам, которые он пришлёт.',
    ].join('\n'),
  },
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
  'C49:LOSE': {
    status: 'out_of_stock',
    text: r => [
      '😔 <b>Приносим извинения</b>',
      '',
      `${r.snapshot.name} сейчас нет в наличии.`,
      '',
      r.notifyOnRestock
        ? 'Мы сообщим вам сюда, как только товар снова появится на складе.'
        : 'Загляните в магазин позже — ассортимент обновляется.',
    ].join('\n'),
  },
};

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
    select: ['ID', 'STAGE_ID'],
  });

  let sent = 0;
  for (const deal of deals) {
    const req = byDeal.get(String(deal.ID));
    const stage = String(deal.STAGE_ID || '');
    if (!req || !stage || stage === req.bitrix.stage) continue;

    // У заявки, заведённой до появления этой синхронизации, стадии не записано —
    // такой первый проход только запоминает её: сообщать о том, что случилось раньше, поздно.
    const known = !!req.bitrix.stage;
    req.bitrix.stage = stage;

    const action = STAGE_ACTIONS[stage];
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
