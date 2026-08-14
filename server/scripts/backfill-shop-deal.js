/**
 * Дозаполняет сделку по заявке из Telegram-магазина.
 *
 * Первые заявки уехали в Битрикс до того, как заработали привязка контакта,
 * товарная позиция и комментарий в ленте — сделка выглядела пустой. Скрипт
 * добирает недостающее по данным заявки из MongoDB; уже заполненное не трогает.
 *
 *   node scripts/backfill-shop-deal.js            # что будет сделано
 *   node scripts/backfill-shop-deal.js --apply    # сделать
 *   node scripts/backfill-shop-deal.js 366547 --apply   # только эта сделка
 */
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');

const { call } = require('../utils/bitrix24');
const {
  ensureContact, attachProduct, addTimelineComment, dealComments,
} = require('../lib/shopBitrix');

const APPLY  = process.argv.includes('--apply');
const ONLY   = process.argv.find(a => /^\d+$/.test(a));

async function main() {
  await mongoose.connect(MONGO_URI);
  const ShopRequest = require('../models/ShopRequest');
  const Product     = require('../models/Product');

  const filter = { 'bitrix.dealId': { $nin: ['', null] } };
  if (ONLY) filter['bitrix.dealId'] = ONLY;
  const requests = await ShopRequest.find(filter).sort({ createdAt: 1 });
  console.log(`Заявок со сделкой: ${requests.length}${APPLY ? '' : ' (предпросмотр, ничего не меняю)'}\n`);

  for (const req of requests) {
    const dealId = String(req.bitrix.dealId);
    let deal;
    try {
      deal = await call('crm.deal.get', { id: dealId });
    } catch (e) {
      console.log(`#${dealId} — сделки нет в Битриксе (${e.message})`);
      continue;
    }

    const rows = await call('crm.deal.productrows.get', { id: dealId }).catch(() => []);
    const timeline = await call('crm.timeline.comment.list', {
      filter: { ENTITY_ID: dealId, ENTITY_TYPE: 'deal' },
    }).catch(() => []);

    const title = `TG-магазин: ${req.snapshot.name} × ${req.qty}`;
    const todo = [];
    if (!deal.CONTACT_ID)        todo.push('контакт');
    if (!rows.length)            todo.push('товарная позиция');
    if (!timeline.length)        todo.push('комментарий в ленте');
    if (deal.TITLE !== title)    todo.push('заголовок с количеством');
    if (!req.bitrix.stage)       todo.push(`запомнить стадию (${deal.STAGE_ID})`);

    if (!todo.length) { console.log(`#${dealId} — уже полная`); continue; }
    console.log(`#${dealId} «${req.snapshot.name}» → ${todo.join(', ')}`);
    if (!APPLY) continue;

    const fields = {};
    if (deal.TITLE !== title) fields.TITLE = title;
    if (!deal.CONTACT_ID) {
      const contactId = await ensureContact({
        name:       req.customer.name,
        phone:      req.customer.phone,
        tgUsername: req.customer.tgUsername,
      });
      if (contactId) fields.CONTACT_ID = contactId;
    }
    if (Object.keys(fields).length) await call('crm.deal.update', { id: dealId, fields });

    if (!rows.length) {
      const product = await Product.findById(req.product).lean();
      await attachProduct(dealId, product || { _id: req.product }, req.qty, req.snapshot.price, req.snapshot.name);
    }
    if (!timeline.length) {
      const product = await Product.findById(req.product).lean() || { _id: req.product };
      await addTimelineComment(dealId, dealComments({
        product, request: req,
        tgUser: { id: req.customer.tgUserId, username: req.customer.tgUsername, name: req.customer.tgName },
      }));
    }
    // Без стадии обратная связь клиенту начнётся только со следующей смены —
    // записываем текущую, чтобы ответ менеджера дошёл.
    if (!req.bitrix.stage) { req.bitrix.stage = deal.STAGE_ID || ''; await req.save(); }

    console.log(`#${dealId} — дозаполнена`);
  }

  await mongoose.disconnect();
}

main().catch(e => { console.error('Ошибка:', e.message); process.exit(1); });
