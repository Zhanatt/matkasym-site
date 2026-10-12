// Сортировочные урны 0-TASHTANDY — в PDF-каталоге сериями, под моделью число
// секций (12.10.2026). Пустой дубль «Урна «Эко SW3»» (без артикула, цены и
// характеристик) из печати убирается.
// Без --apply только показывает. --apply пишет бэкап. --undo откатывает.
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const { ObjectId } = mongoose.Types;
const BACKUP = path.join(__dirname, 'pdf-series-urns.backup.json');

const S = (series, variant, sections) => ({ series, variant, note: `${sections} ${sections === 1 ? 'секция' : sections < 5 ? 'секции' : 'секций'}` });
// По артикулу: у двух «Karakol 4» одно имя, различает длина
const PLAN = {
  'MKS-UT-021': S('Эко урна SW', 'SW', 1),
  'MKS-UT-022': S('Эко урна SW', 'SW2', 2),
  'MKS-UT-023': S('Эко урна SW', 'SW3', 3),
  'MKS-UT-012': S('Урна GW', 'GW', 1),
  'MKS-UT-013': S('Урна GW', 'GW2', 2),
  'MKS-UT-014': S('Урна GW', 'GW3', 3),
  'СЗ0048':     S('Урна GWR', 'GWR', 1),
  'СЗ0048W2':   S('Урна GWR', 'GWR2', 2),   // в характеристиках «3» — по названию 2, проверить
  'СЗ0048W3':   S('Урна GWR', 'GWR3', 3),
  'MKS-UT-009': S('Эко урна G', 'G2', 2),
  'MKS-UT-010': S('Эко урна G', 'G3', 3),
  'MKS-UT-011': S('Эко урна G', 'G4', 4),
  'MKS-UT-016': S('Урна KARAKOL', 'Karakol 2', 2),
  'MKS-UT-025': S('Урна KARAKOL', 'Karakol 4 · 105 см', 4),
  'MKS-UT-017': S('Урна KARAKOL', 'Karakol 4 · 137 см', 4),
  'MKS-UT-018': S('Урна 3 BURCH', '3 BURCH 1', 1),
  'MKS-UT-019': S('Урна 3 BURCH', '3 BURCH 3', 3),
};
const EMPTY_SW3 = '6a4bb8f2e7e30ad1e398b5ba';

(async () => {
  await mongoose.connect(MONGO_URI);
  const col = mongoose.connection.collection('products');
  if (process.argv.includes('--undo')) {
    const saved = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
    for (const d of saved) await col.updateOne({ _id: new ObjectId(d._id) }, { $set: {
      pdfSeries: d.pdfSeries || '', pdfVariant: d.pdfVariant || '', pdfNote: d.pdfNote || '', hideInPdf: !!d.hideInPdf } });
    console.log('Восстановлено:', saved.length);
    return process.exit(0);
  }
  const proj = { projection: { sku: 1, name: 1, set: 1, pdfSeries: 1, pdfVariant: 1, pdfNote: 1, hideInPdf: 1, price: 1, specs: 1 } };
  const docs = await col.find({ sku: { $in: Object.keys(PLAN) }, set: '0-tashtandy' }, proj).toArray();
  const missing = Object.keys(PLAN).filter(k => !docs.some(d => d.sku === k));
  // Пустой SW3 ищем по имени и признакам, а не по угаданному id
  const empties = await col.find({ set: '0-tashtandy', name: 'Урна «Эко SW3»', $or: [{ sku: '' }, { sku: null }, { sku: { $exists: false } }] }, proj).toArray();
  docs.forEach(d => console.log(`${d.sku.padEnd(12)} ${d.name.padEnd(22)} → ${PLAN[d.sku].series} / ${PLAN[d.sku].variant} / ${PLAN[d.sku].note}`));
  empties.forEach(d => console.log(`скрыть из PDF: ${d.name} (${d._id}) цена ${d.price}, характеристик ${(d.specs || []).length}`));
  if (missing.length) { console.error('Не найдены:', missing); process.exit(1); }
  if (empties.length !== 1 || empties[0].price || (empties[0].specs || []).length) { console.error('Пустой SW3 не однозначен'); process.exit(1); }
  if (!process.argv.includes('--apply')) { console.log('\nПредпросмотр. Запустите с --apply.'); return process.exit(0); }
  fs.writeFileSync(BACKUP, JSON.stringify([...docs, ...empties], null, 1));
  for (const d of docs) {
    const p = PLAN[d.sku];
    await col.updateOne({ _id: d._id }, { $set: { pdfSeries: p.series, pdfVariant: p.variant, pdfNote: p.note } });
  }
  await col.updateOne({ _id: empties[0]._id }, { $set: { hideInPdf: true } });
  console.log(`\nОбновлено: ${docs.length} урн, скрыт пустой SW3. Бэкап: ${BACKUP}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
