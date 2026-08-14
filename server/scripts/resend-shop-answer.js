/**
 * Переотправляет клиенту ответ менеджера по заявке из Telegram-магазина.
 *
 * Сообщение уходит один раз — на смену ответа в Битриксе. Если оно не дошло
 * (клиент не нажимал «Начать» у бота) или ушло без кнопки оплаты, потому что тогда
 * ещё не был задан MBANK_PAY_URL, — этот скрипт стирает отметку о последнем ответе,
 * и ближайший тик (раз в минуту) отправит сообщение заново, уже с кнопкой.
 *
 *   node scripts/resend-shop-answer.js                 # кому и что переотправится
 *   node scripts/resend-shop-answer.js --apply         # всем заявкам с ответом менеджера
 *   node scripts/resend-shop-answer.js 366587 --apply  # только по этой сделке
 */
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');

const APPLY = process.argv.includes('--apply');
const ONLY  = process.argv.find(a => /^\d+$/.test(a));

async function main() {
  await mongoose.connect(MONGO_URI);
  const ShopRequest = require('../models/ShopRequest');

  const filter = { 'bitrix.stockAnswer': { $nin: ['', null] } };
  if (ONLY) filter['bitrix.dealId'] = ONLY;
  const requests = await ShopRequest.find(filter).sort({ createdAt: -1 });

  if (!requests.length) { console.log('Заявок с ответом менеджера не нашлось'); return mongoose.disconnect(); }
  console.log(`Заявок: ${requests.length}${APPLY ? '' : ' (предпросмотр)'}\n`);

  for (const r of requests) {
    console.log(`#${r.bitrix.dealId} ${r.snapshot.name} × ${r.qty} → ${r.customer.name} (${r.status})`
      + (r.notifyFailed ? ' — прошлое сообщение не доставлено' : ''));
    if (!APPLY) continue;
    r.bitrix.stockAnswer = '';   // ближайший тик увидит «ответ изменился» и напишет клиенту
    await r.save();
  }

  if (APPLY) console.log('\nГотово: сообщения уйдут в течение минуты.');
  await mongoose.disconnect();
}

main().catch(e => { console.error('Ошибка:', e.message); process.exit(1); });
