/**
 * Onuguu, гибка: одна карточка «Услуги гибки металла 0.5-4 мм» → четыре по прайсу.
 *
 * Запуск из папки server:
 *   node scripts/split-onuguu-bending.js           — только показать
 *   node scripts/split-onuguu-bending.js --apply   — записать
 *
 * Прайс (от пользователя 24.10.2026): 0,5–1 мм — 80 сом, 1–2 мм — 120, 2–3 мм — 140,
 * 3–4 мм — 160. Длина гибки — до 3 м, толщина — до 4 мм. Старая карточка становится
 * первой (0,5–1 мм) — фото и история остаются у неё; три новые — копии с её фото.
 * Бэкап старой карточки — scripts/split-onuguu-bending.backup.json. Повторный запуск
 * ничего не дублирует.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const APPLY = process.argv.includes('--apply');

const RANGES = [
  { t: '0,5–1 мм', price: 80 },
  { t: '1–2 мм', price: 120 },
  { t: '2–3 мм', price: 140 },
  { t: '3–4 мм', price: 160 },
];
const spec = (key, value) => ({ key, value, options: [] });
const card = ({ t, price }) => ({
  name: `Гибка ${t}`,
  fullName: `Гибка листового металла ${t}`,
  price, priceUndefined: false,
  description:
`Гибка листового металла толщиной ${t} по вашим размерам.

Делаем уголки, короба, профили, откосы и детали корпусов. Максимальная длина гибки — до 3 метров.

Точная и аккуратная гибка — детали сразу готовы к сборке и покраске.`,
  specs: [
    spec('Тип услуги', 'Гибка листового металла'),
    spec('Толщина металла', t),
    spec('Длина гибки (макс)', 'до 3 метров'),
    spec('Толщина (макс)', 'до 4 мм'),
  ],
});

(async () => {
  await mongoose.connect(MONGO_URI);
  const P = mongoose.connection.db.collection('products');
  const old = await P.findOne({ set: 'onuguu-set', name: /гибки металла 0\.5-4/i });
  const existing = await P.find({ set: 'onuguu-set', category: 'Услуга гибки' }).toArray();
  console.log('Сейчас в разделе гибки:', existing.map(p => `${p.name} — ${p.price} сом`).join('; '));

  const [first, ...rest] = RANGES.map(card);
  const toCreate = rest.filter(c => !existing.some(p => p.name === c.name));
  console.log(old ? `Переименовать: «${old.name}» → «${first.name}», ${old.price} → ${first.price} сом` : 'Старой карточки нет — первую тоже создадим');
  toCreate.forEach(c => console.log(`Создать: «${c.name}» — ${c.price} сом`));
  if (!APPLY) { console.log('\nПредпросмотр. Для записи: --apply'); return process.exit(0); }

  const base = old || existing[0];
  if (!base) throw new Error('Нет карточки-образца в разделе гибки');
  if (old) {
    fs.writeFileSync(path.join(__dirname, 'split-onuguu-bending.backup.json'), JSON.stringify(old, null, 1));
    await P.updateOne({ _id: old._id }, { $set: { ...first, updatedAt: new Date() } });
  } else if (!existing.some(p => p.name === first.name)) {
    toCreate.unshift(first);
  }
  const docs = toCreate.map(c => {
    const d = { ...base, ...c, createdAt: new Date(), updatedAt: new Date(), improvementHistory: [] };
    delete d._id;
    return d;
  });
  if (docs.length) await P.insertMany(docs);
  console.log(`Готово: ${old ? 'обновлена 1, ' : ''}создано ${docs.length}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
