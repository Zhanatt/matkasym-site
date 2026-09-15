/**
 * ADIK STORAGE → ADIK HOME в сете Baary Oorunda.
 *
 * Двум карточкам линейка досталась от поставщика: в прайс-листе все десять
 * моделей подписаны ADIK HOME, а на сайте у ROUND X4 и ROUND X3 стояло
 * STORAGE. Из-за этого ROUND X3 выглядел двумя разными товарами, хотя это одна
 * модель в чёрном и белом.
 *
 * Правим название, полное название и артикул (AS → AH). Заодно схлопываем
 * двойные пробелы, которые приехали из выгрузки.
 *
 * Отдельно: C4 входит в линейку SLOTTED — артикул становится MKS-AH-S-C4-BLK.
 * Название карточки при этом не трогаем, так просили.
 *
 *   node scripts/adik-storage-to-home.js            # показать
 *   node scripts/adik-storage-to-home.js --apply    # записать
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const Product = require('../models/Product');

const APPLY = process.argv.includes('--apply');

(async () => {
  await mongoose.connect(MONGO_URI);
  const plan = [];

  for (const p of await Product.find({ set: 'baary-oorunda', $or: [{ name: /ADIK\s+STORAGE/i }, { fullName: /ADIK\s+STORAGE/i }] }).lean()) {
    const fix = (s) => String(s || '').replace(/ADIK\s+STORAGE/gi, 'ADIK HOME').replace(/\s{2,}/g, ' ').trim();
    plan.push({
      id: p._id,
      before: { name: p.name, fullName: p.fullName, sku: p.sku },
      after:  { name: fix(p.name), fullName: fix(p.fullName), sku: String(p.sku || '').replace(/^MKS-AS-/, 'MKS-AH-') },
    });
  }

  const c4 = await Product.findOne({ sku: 'MKS-AH-C4-BLK' }).lean();
  if (c4) {
    plan.push({
      id: c4._id,
      before: { name: c4.name, fullName: c4.fullName, sku: c4.sku },
      after:  { name: c4.name, fullName: c4.fullName, sku: 'MKS-AH-S-C4-BLK' },
    });
  }

  plan.forEach(x => {
    console.log(`\n${x.before.sku}  →  ${x.after.sku}`);
    if (x.before.fullName !== x.after.fullName) {
      console.log(`   было:  ${x.before.fullName}`);
      console.log(`   стало: ${x.after.fullName}`);
    } else {
      console.log(`   название не меняем: ${x.after.fullName}`);
    }
  });
  console.log(`\nКарточек к правке: ${plan.length}`);

  if (!APPLY) { console.log('Это предпросмотр. Записать: --apply'); await mongoose.disconnect(); return; }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const file = path.join(__dirname, `backup-adik-storage-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(plan.map(x => ({ _id: x.id, ...x.before })), null, 2));
  console.log(`Бэкап: ${path.relative(process.cwd(), file)}`);

  for (const x of plan) await Product.updateOne({ _id: x.id }, { $set: x.after });
  console.log(`Обновлено: ${plan.length}`);
  await mongoose.disconnect();
})();
