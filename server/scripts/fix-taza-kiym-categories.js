/**
 * Разовая правка категорий в сете taza-kiym.
 *
 * В каталоге часть товаров сидела в латинских слагах (clothes-dryer, laundry-basket)
 * и в 'other' — из-за этого они выпадали из своей секции и висели отдельными
 * блоками внизу. Плюс две вешалки KERBEN лежали в «Плечиках».
 * Приводим к тем же русским категориям, что и у соседей по полке.
 *
 * Запуск:
 *   node scripts/fix-taza-kiym-categories.js           # только показать, что изменится
 *   node scripts/fix-taza-kiym-categories.js --apply   # записать (с бэкапом в scripts/backups)
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const Product = require('../models/Product');

const APPLY = process.argv.includes('--apply');

// Что чиним: имя товара → правильная категория (имена как в базе)
const FIXES = [
  ['Гладильная доска SANIRA (S)',        'Гладильная доска'],
  ['Гладильная доска SANIRA (M)',        'Гладильная доска'],
  ['Сушилка для белья COMFORT(Черная)',  'Сушилка'],
  ['Корзина для белья ECO SEBET',        'Корзины для белья'],
  ['Костюмная вешалка MURAS 1 (Черный)', 'Гардеробная вешалка'],
  ['Гардеробная вешалка KERBEN черная',  'Гардеробная вешалка'],
  ['Гардеробная вешалка KERBEN белая',   'Гардеробная вешалка'],
];

(async () => {
  await mongoose.connect(MONGO_URI);

  const targets = [];
  for (const [name, category] of FIXES) {
    const found = await Product.find({ set: 'taza-kiym', name }).lean();
    if (!found.length) { console.log(`⚠  не найден: ${name}`); continue; }
    found.forEach(p => {
      if (p.category === category) { console.log(`•  уже ок: ${name}`); return; }
      targets.push({ id: p._id, name: p.name, sku: p.sku, from: p.category, to: category });
    });
  }

  console.log(`\nК изменению: ${targets.length}`);
  targets.forEach(t => console.log(`   ${t.name} [${t.sku || '—'}]: ${t.from} → ${t.to}`));

  if (!APPLY) {
    console.log('\nПредпросмотр. Для записи — с флагом --apply');
    await mongoose.disconnect();
    return;
  }

  const dir = path.join(__dirname, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const backup = path.join(dir, `taza-kiym-categories-${Date.now()}.json`);
  fs.writeFileSync(backup, JSON.stringify(targets, null, 2));
  console.log(`\nБэкап: ${backup}`);

  for (const t of targets) {
    await Product.updateOne({ _id: t.id }, { $set: { category: t.to } });
    console.log(`✓  ${t.name}: ${t.from} → ${t.to}`);
  }

  await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
