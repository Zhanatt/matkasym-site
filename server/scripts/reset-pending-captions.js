// Сбрасывает снимок подписи у ЕЩЁ НЕ ОТПРАВЛЕННЫХ площадок публикаций.
//
// Зачем: Publication.targets[].caption — снимок текста на момент создания поста.
// Когда правило подписи меняется (15.08.2026 разрешили печатать цену в Instagram и
// Facebook — раньше adaptCaption её вырезала), уже созданные, но не ушедшие посты
// продолжают нести старый текст: повтор упавшей публикации отправит цену «как было».
//
// Пустой caption — это не потеря текста: publishTarget падает обратно на pub.text
// (там подпись целиком, с ценой), а публикатор сам прогоняет её через adaptCaption.
// Итог совпадает с тем, что собралось бы для нового поста.
//
// Трогаем только targets со статусом pending/failed. Опубликованные не переписываем:
// у них текст уже вышел на площадку, и снимок — это история, а не заготовка.
//
//   node scripts/reset-pending-captions.js                    # показать, что изменится
//   node scripts/reset-pending-captions.js --apply            # применить
//   node scripts/reset-pending-captions.js --number=273 --apply  # только одна публикация
//
// Бэкап затронутых публикаций пишется в scripts/backup/ до записи.

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');

const APPLY = process.argv.includes('--apply');
const NUM_ARG = process.argv.find((a) => a.startsWith('--number='));
const ONLY_NUMBER = NUM_ARG ? Number(NUM_ARG.slice(9)) : null;

// Площадки, у которых правило подписи поменялось. Telegram печатал цену всегда —
// его снимки трогать незачем.
const PLATFORMS = ['instagram', 'facebook'];
const OPEN = ['pending', 'failed'];

(async () => {
  await mongoose.connect(MONGO_URI);
  const Publications = mongoose.connection.db.collection('publications');

  const query = {
    targets: { $elemMatch: { platform: { $in: PLATFORMS }, status: { $in: OPEN }, caption: { $nin: ['', null] } } },
  };
  if (ONLY_NUMBER) query.number = ONLY_NUMBER;

  const pubs = await Publications.find(query).project({ number: 1, productName: 1, targets: 1, text: 1 }).toArray();
  console.log(`Публикаций с неотправленными Instagram/Facebook: ${pubs.length}`);
  if (!pubs.length) { await mongoose.disconnect(); return; }

  let cells = 0;
  pubs.forEach((p) => {
    const hit = p.targets.filter((t) => PLATFORMS.includes(t.platform) && OPEN.includes(t.status) && t.caption);
    cells += hit.length;
    const hasPrice = /💰/.test(p.text || '');
    console.log(`  №${p.number} | ${(p.productName || '').slice(0, 40)} | ${hit.map((t) => t.platform + ':' + t.status).join(', ')}` +
      (hasPrice ? '' : '   ВНИМАНИЕ: в общем тексте публикации цены нет — не появится и в посте'));
  });
  console.log(`Площадок к сбросу: ${cells}`);

  if (!APPLY) {
    console.log('\nПредпросмотр. Чтобы применить: node scripts/reset-pending-captions.js --apply');
    await mongoose.disconnect();
    return;
  }

  const dir = path.join(__dirname, 'backup');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `publications-captions-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(pubs, null, 2));
  console.log(`\nБэкап: ${file}`);

  let n = 0;
  for (const p of pubs) {
    const targets = p.targets.map((t) => (
      PLATFORMS.includes(t.platform) && OPEN.includes(t.status) ? { ...t, caption: '' } : t
    ));
    await Publications.updateOne({ _id: p._id }, { $set: { targets } });
    n++;
  }
  console.log(`Обновлено публикаций: ${n}`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
