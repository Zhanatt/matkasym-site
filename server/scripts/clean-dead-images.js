// Убирает из product.images ссылки на Cloudinary-файлы, которых больше нет (404).
//
// Зачем: Instagram публикует карусель по одной картинке и падает целиком, если хоть
// одна не скачалась. Публикация №188 (Сушилка SAKURA розовая) легла именно на этом —
// два из семи фото давно удалены из Cloudinary, а в карточке ссылки остались.
//
// Каждую ссылку скрипт перед удалением ПРОВЕРЯЕТ запросом: удаляются только те, что
// реально отдают 404. Живую ссылку скрипт не тронет, даже если её передали в аргументах.
//
//   node scripts/clean-dead-images.js                 # только показать, что изменится
//   node scripts/clean-dead-images.js --apply         # применить
//   node scripts/clean-dead-images.js --all           # проверить ВСЕ товары (долго)
//
// Бэкап затронутых документов пишется в scripts/backup/ до записи.

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');

const APPLY = process.argv.includes('--apply');
const ALL = process.argv.includes('--all');

// Известные покойники из публикации №188. При --all список не нужен.
const KNOWN_DEAD = ['o9tj29xcjwv6iswuu4pe', 'luo7yqjrzk3hwftfroq2'];

const CONCURRENCY = 8;

async function isDead(url) {
  try {
    const r = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' } });
    return r.status === 404;
  } catch {
    return false; // сеть моргнула — считаем живой, лучше не тронуть
  }
}

async function checkAll(urls) {
  const dead = new Set();
  const list = [...urls];
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (list.length) {
      const u = list.pop();
      if (await isDead(u)) dead.add(u);
    }
  }));
  return dead;
}

(async () => {
  await mongoose.connect(MONGO_URI);
  const Products = mongoose.connection.db.collection('products');

  const query = ALL
    ? { images: { $exists: true, $ne: [] } }
    : { images: { $regex: KNOWN_DEAD.join('|') } };

  const docs = await Products.find(query).project({ name: 1, fullName: 1, sku: 1, images: 1 }).toArray();
  console.log(`Товаров к проверке: ${docs.length}${ALL ? ' (полный скан)' : ''}`);
  if (!docs.length) { await mongoose.disconnect(); return; }

  const candidates = new Set();
  docs.forEach((d) => (d.images || []).forEach((u) => {
    if (ALL || KNOWN_DEAD.some((k) => u.includes(k))) candidates.add(u);
  }));
  console.log(`Ссылок к проверке: ${candidates.size}`);

  const dead = await checkAll(candidates);
  console.log(`Из них битых (404): ${dead.size}`);
  dead.forEach((u) => console.log('   ' + u));

  const affected = docs
    .map((d) => ({ doc: d, next: (d.images || []).filter((u) => !dead.has(u)) }))
    .filter(({ doc, next }) => next.length !== (doc.images || []).length);

  console.log(`\nЗатронуто товаров: ${affected.length}`);
  affected.forEach(({ doc, next }) => {
    console.log(`  ${doc.sku || '-'} | ${doc.fullName || doc.name}: ${doc.images.length} → ${next.length} фото`);
    if (!next.length) console.log('     ВНИМАНИЕ: у товара не останется ни одного фото');
  });

  if (!affected.length) { await mongoose.disconnect(); return; }

  if (!APPLY) {
    console.log('\nПредпросмотр. Чтобы применить: node scripts/clean-dead-images.js --apply');
    await mongoose.disconnect();
    return;
  }

  const dir = path.join(__dirname, 'backup');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `products-images-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(affected.map(({ doc }) => doc), null, 2));
  console.log(`\nБэкап: ${file}`);

  let n = 0;
  for (const { doc, next } of affected) {
    await Products.updateOne({ _id: doc._id }, { $set: { images: next } });
    n++;
  }
  console.log(`Обновлено товаров: ${n}`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
