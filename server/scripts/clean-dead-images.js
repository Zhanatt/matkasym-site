// Убирает из product.images ссылки на Cloudinary-файлы, которых больше нет (404).
//
// Зачем: Instagram публикует карусель по одной картинке и падает целиком, если хоть
// одна не скачалась. Публикация №188 (Сушилка SAKURA розовая) легла именно на этом —
// два из семи фото давно удалены из Cloudinary, а в карточке ссылки остались.
//
// Каждую ссылку скрипт перед удалением ПРОВЕРЯЕТ запросом: удаляются только те, что
// реально отдают 404. Живую ссылку скрипт не тронет, даже если её передали в аргументах.
//
// Те же ссылки вычищаются из снимков упавших публикаций (Publication.images) — иначе
// «Отправить только в упавшие» повторит попытку по тем же покойникам (публикация №273).
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

// --sku=MKS-C34 — чинить один товар. Полный скан находит и те товары, у которых
// битая ссылка единственная: удалять её вслепую нельзя, товар останется без фото
// вовсе. Когда упала конкретная публикация, чиним только её товар.
// --safe — не трогать товары, у которых битое фото единственное (см. ниже).
const SAFE = process.argv.includes('--safe');

const SKU_ARG = process.argv.find((a) => a.startsWith('--sku='));
const ONLY_SKUS = SKU_ARG ? SKU_ARG.slice(6).split(',').map((s) => s.trim()).filter(Boolean) : null;

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

  const query = ONLY_SKUS
    ? { sku: { $in: ONLY_SKUS }, images: { $exists: true, $ne: [] } }
    : ALL
      ? { images: { $exists: true, $ne: [] } }
      : { images: { $regex: KNOWN_DEAD.join('|') } };

  const docs = await Products.find(query).project({ name: 1, fullName: 1, sku: 1, images: 1 }).toArray();
  console.log(`Товаров к проверке: ${docs.length}` +
    (ONLY_SKUS ? ` (артикулы: ${ONLY_SKUS.join(', ')})` : ALL ? ' (полный скан)' : ''));

  const candidates = new Set();
  docs.forEach((d) => (d.images || []).forEach((u) => {
    if (ALL || ONLY_SKUS || KNOWN_DEAD.some((k) => u.includes(k))) candidates.add(u);
  }));

  // Снимки упавших публикаций проверяем отдельно: товар могли уже почистить (или пост
  // собрали из произвольных картинок, kind: 'custom') — тогда в товарах покойников
  // больше нет, а публикация всё равно падает на них при повторе.
  const Publications = mongoose.connection.db.collection('publications');
  const failedPubs = await Publications
    .find({ 'targets.status': 'failed', images: { $exists: true, $ne: [] } })
    .project({ number: 1, productName: 1, product: 1, images: 1 })
    .toArray();
  failedPubs.forEach((p) => (p.images || []).forEach((u) => candidates.add(u)));
  console.log(`Упавших публикаций к проверке: ${failedPubs.length}`);

  if (!candidates.size) { await mongoose.disconnect(); return; }
  console.log(`Ссылок к проверке: ${candidates.size}`);

  const dead = await checkAll(candidates);
  console.log(`Из них битых (404): ${dead.size}`);
  dead.forEach((u) => console.log('   ' + u));

  const all = docs
    .map((d) => ({ doc: d, next: (d.images || []).filter((u) => !dead.has(u)) }))
    .filter(({ doc, next }) => next.length !== (doc.images || []).length);

  // --safe: не трогаем товары, у которых битая ссылка единственная. Убрать её —
  // значит оставить товар вовсе без картинки: на витрине это хуже, чем битая
  // ссылка, и чинится не удалением, а перезаливкой фото.
  const affected = SAFE ? all.filter(({ next }) => next.length > 0) : all;
  const skipped  = SAFE ? all.filter(({ next }) => !next.length) : [];

  console.log(`\nЗатронуто товаров: ${affected.length}`);
  affected.forEach(({ doc, next }) => {
    console.log(`  ${doc.sku || '-'} | ${doc.fullName || doc.name}: ${doc.images.length} → ${next.length} фото`);
    if (!next.length) console.log('     ВНИМАНИЕ: у товара не останется ни одного фото');
  });

  if (skipped.length) {
    console.log(`\nПропущено (осталось бы 0 фото, нужен перезалив): ${skipped.length}`);
    skipped.forEach(({ doc }) => console.log(`  ${doc.sku || '-'} | ${doc.fullName || doc.name}`));
  }

  // Publication.images — снимок на момент создания поста, из товара он не перечитывается.
  // Пока битые ссылки не убрать и отсюда, кнопка «Отправить только в упавшие» будет
  // падать на тех же файлах. Чиним только неудавшиеся: у опубликованных пост уже вышел,
  // и переписывать историю задним числом нельзя.
  const stuck = failedPubs.filter((p) => (p.images || []).some((u) => dead.has(u)));
  if (stuck.length) {
    console.log(`\nЗатронуто упавших публикаций: ${stuck.length}`);
    stuck.forEach((p) => {
      const next = (p.images || []).filter((u) => !dead.has(u));
      console.log(`  №${p.number} | ${(p.productName || '').slice(0, 40)}: ${p.images.length} → ${next.length} фото` +
        (next.length ? '' : '   ВНИМАНИЕ: фото не осталось, публиковать нечего'));
    });
  }

  if (!affected.length && !stuck.length) { await mongoose.disconnect(); return; }

  if (!APPLY) {
    console.log('\nПредпросмотр. Чтобы применить: node scripts/clean-dead-images.js --apply');
    await mongoose.disconnect();
    return;
  }

  const dir = path.join(__dirname, 'backup');
  fs.mkdirSync(dir, { recursive: true });

  if (affected.length) {
    const file = path.join(dir, `products-images-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(file, JSON.stringify(affected.map(({ doc }) => doc), null, 2));
    console.log(`\nБэкап: ${file}`);

    let n = 0;
    for (const { doc, next } of affected) {
      await Products.updateOne({ _id: doc._id }, { $set: { images: next } });
      n++;
    }
    console.log(`Обновлено товаров: ${n}`);
  }

  if (stuck.length) {
    const pubFile = path.join(dir, `publications-images-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(pubFile, JSON.stringify(stuck, null, 2));
    console.log(`\nБэкап публикаций: ${pubFile}`);
    for (const p of stuck) {
      const next = (p.images || []).filter((u) => !dead.has(u));
      await Publications.updateOne({ _id: p._id }, { $set: { images: next } });
      console.log(`  №${p.number}: ${p.images.length} → ${next.length} фото` +
        (next.length ? '' : '  ВНИМАНИЕ: фото не осталось, публиковать нечего'));
    }
  }

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
