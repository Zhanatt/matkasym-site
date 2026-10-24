/**
 * Onuguu — только услуги; краски и прочие материалы — в YNTYMAK ZAKUP.
 *
 * Запуск из папки server:
 *   node scripts/split-onuguu-paints-to-yntymak.js           — только показать
 *   node scripts/split-onuguu-paints-to-yntymak.js --apply   — записать
 *
 * Что делает:
 *  1. Краски, эмали, растворители и грунтовку из onuguu-set переносит в yntymak-zakup
 *     (раздел «Покраска» → «Краски», «other» → «Краски»/«Растворители», «грунтовки» → «Грунтовки»).
 *     Остатки с 1С не пострадают: синхронизация красок не привязана к сету.
 *  2. В Onuguu, раздел «Покраска», заводит карточку «Услуга порошковой покраски» (цена не указана).
 *  3. В YNTYMAK ZAKUP заводит три карточки-примера: металлический лист (шт), картон (шт),
 *     металлический рулон (кг) — с тегом example-2026-10-24, цена не указана.
 * Перед записью затронутые карточки выгружаются в scripts/split-onuguu-paints.backup.json.
 * Повторный запуск ничего не дублирует.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const APPLY = process.argv.includes('--apply');

const FROM = 'onuguu-set';
const TO = 'yntymak-zakup';
const TAG = 'example-2026-10-24';

const newCategory = (p) => {
  if (p.category === 'грунтовки') return 'Грунтовки';
  if (/растворител/i.test(p.name)) return 'Растворители';
  return 'Краски';
};

(async () => {
  await mongoose.connect(MONGO_URI);
  const P = mongoose.connection.db.collection('products');

  const move = await P.find({ set: FROM, category: { $in: ['Покраска', 'other', 'грунтовки'] } }).toArray();
  const template = await P.findOne({ set: FROM, name: /гибки/i });
  if (!template) throw new Error('Не нашёл карточку-образец услуги (гибка)');

  console.log(`Перенос в ${TO}: ${move.length} карточек`);
  for (const p of move) console.log(`  ${p.category} → ${newCategory(p)} | ${p.name} | ${p.unit || ''} | остаток ${p.stock}`);

  const blank = (over) => {
    const d = { ...template };
    delete d._id;
    for (const k of ['specs', 'images', 'driveImages', 'improvementHistory']) d[k] = [];
    return {
      ...d,
      sku: '', nomenclature1C: '', setLevel: '', color: '', dimensions: '',
      price: 0, priceUndefined: true, priceCost: 0, priceWholesale: 0, priceDealer: 0,
      stock: 0, inStock: false, stockStatus: 'out_of_stock', isOnOrder: true, isNew: false,
      tags: [], createdAt: new Date(), updatedAt: new Date(),
      ...over,
    };
  };

  const service = blank({
    name: 'Услуга порошковой покраски',
    fullName: 'Услуга порошковой покраски',
    set: FROM, category: 'Покраска', unit: '',
    description: 'Порошковая покраска металлических изделий.\n\nЦвет — по каталогу RAL. Стоимость зависит от площади и сложности изделия — уточняйте у менеджера.',
  });

  const examples = [
    { name: 'Металлический лист (пример)', category: 'Металлические листы', unit: 'шт',
      description: 'Пример карточки: листовой металл, продаётся поштучно. Укажите марку, толщину и размер листа.' },
    { name: 'Картон (пример)', category: 'Картон', unit: 'шт',
      description: 'Пример карточки: картон, продаётся поштучно. Укажите плотность и формат листа.' },
    { name: 'Металлический рулон (пример)', category: 'Металлический рулон', unit: 'кг',
      description: 'Пример карточки: рулонный металл, продаётся на вес (кг). Укажите марку, толщину и ширину рулона.' },
  ].map(e => blank({ ...e, fullName: e.name, set: TO, tags: [TAG] }));

  const toCreate = [];
  for (const d of [service, ...examples]) {
    const exists = await P.findOne({ set: d.set, name: d.name });
    console.log(`${exists ? 'Уже есть' : 'Создать'}: ${d.set} / ${d.category} / ${d.name} [${d.unit || 'услуга'}]`);
    if (!exists) toCreate.push(d);
  }

  if (!APPLY) { console.log('\nПредпросмотр. Для записи: --apply'); return process.exit(0); }

  const backup = path.join(__dirname, 'split-onuguu-paints.backup.json');
  fs.writeFileSync(backup, JSON.stringify(move, null, 1));
  console.log('Бэкап:', backup);

  for (const p of move) {
    await P.updateOne({ _id: p._id }, { $set: { set: TO, category: newCategory(p), setLevel: '', updatedAt: new Date() } });
  }
  if (toCreate.length) await P.insertMany(toCreate);
  console.log(`Готово: перенесено ${move.length}, создано ${toCreate.length}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
