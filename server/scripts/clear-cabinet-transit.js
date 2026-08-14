// Снимает статус «в пути» со шкафов: inTransit → false, inTransitQty → 0.
// Запуск: node scripts/clear-cabinet-transit.js [--apply]
// Без --apply только печатает, что изменится.
//
// Зачем: линейку AICHUROK пометили «в пути» скопом, хотя товар уже на складе —
// на карточках висел 🚚, а у позиций без остатка «В пути» показывалось вместо «Нет».
// Бейдж остатка (getStockInfo в AdminSets.jsx) смотрит флаги в таком порядке:
//   stock > 0 → «N шт.»  ·  inTransit → «В пути»  ·  isOnOrder → «Под заказ»
//   ·  inStock → «Есть»  ·  иначе → «Нет»
// Поэтому у товара с остатком снятие флага на бейдж не влияет (там и так «N шт.»),
// а у товара без остатка бейдж становится «Нет» — чего и добивались.
//
// isOnOrder НЕ трогаем: «под заказ» — это отдельный осознанный статус
// (возим/производим по запросу), а не ошибочная пометка.
//
// Флаг ставится только руками в карточке товара и снимается приёмкой
// (routes/admin.js — receive), синхронизация с 1С его не пишет. Значит,
// правка не откатится следующей выгрузкой остатков.

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Product = require('../models/Product');

const MONGO_URI = require('../lib/atlas');

// Шкаф как сам товар, а не упоминание в описании: по «шкаф» в fullName ловятся
// «органайзер для шкафа», «полка» и прочее — им статус трогать нельзя.
const CABINETS = {
  $or: [
    { name: /^\s*шкаф/i },
    { category: { $in: ['Шкафы пожарные', 'Шкафы и зеркала', 'storage-cabinet', 'Гардероб'] } },
  ],
};

// Что покажет бейдж после снятия флага — чтобы в предпросмотре было видно последствие,
// а не только сам факт правки. Порядок повторяет getStockInfo на клиенте.
function badgeAfter(p) {
  if (p.stock > 0)   return `${p.stock} шт.`;
  if (p.isOnOrder)   return 'Под заказ';
  if (p.inStock)     return 'Есть';
  return 'Нет';
}

async function main() {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(MONGO_URI);

  const affected = await Product.find({ ...CABINETS, inTransit: true })
    .select('sku name category stock inTransit inTransitQty inStock isOnOrder')
    .sort({ sku: 1 });

  if (!affected.length) {
    console.log('Шкафов со статусом «в пути» не найдено — делать нечего.');
    await mongoose.disconnect();
    return;
  }

  console.log(`шкафов со статусом «в пути»: ${affected.length}\n`);
  for (const p of affected) {
    console.log(`  ${String(p.sku || '—').padEnd(13)} ${String(p.name).slice(0, 26).padEnd(28)} ` +
      `${String(p.category).padEnd(18)} stock=${String(p.stock).padEnd(4)} → «${badgeAfter(p)}»`);
  }

  const zero = affected.filter(p => !(p.stock > 0));
  console.log(`\nиз них без остатка (станут «Нет»): ${zero.length}` +
    (zero.length ? ` — ${zero.map(p => p.sku).join(', ')}` : ''));

  if (!apply) {
    console.log('\nЭто предпросмотр. Запусти с --apply чтобы записать.');
    await mongoose.disconnect();
    return;
  }

  // Бэкап до правки: откатывать приходилось уже не раз.
  const dir = path.join(__dirname, 'backup');
  fs.mkdirSync(dir, { recursive: true });
  const dump = path.join(dir, `cabinet-transit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(dump, JSON.stringify(affected.map(p => p.toObject()), null, 2));
  console.log(`\nбэкап: ${dump}`);

  const r = await Product.updateMany(
    { _id: { $in: affected.map(p => p._id) } },
    { $set: { inTransit: false, inTransitQty: 0 } },
  );
  console.log(`✔ обновлено: ${r.modifiedCount}`);

  await mongoose.disconnect();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
