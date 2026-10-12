// Порядок товаров 0-TASHTANDY в PDF (12.10.2026), поле pdfOrder. Экран не трогает.
// Пластиковые урны от меньшей к большей, за ними пластиковые баки 120/240 → уличные урны, похожие рядом →
// серии SW, GW, GWR, G, KARAKOL, 3 BURCH → баки от меньшего к большему, Ecomayak последним.
// Без --apply только показывает. --undo откатывает из бэкапа.
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const { ObjectId } = mongoose.Types;
const BACKUP = path.join(__dirname, 'pdf-order-0-tashtandy.backup.json');
const SET = '0-tashtandy';

// Артикул или точное название
const ORDER = [
  // пластиковые урны
  'MKS-UTH-012', 'MKS-UTH-013', 'MKS-UTH-019', 'MKS-UTH-020',
  // за ними пластиковые баки на колёсах: 120, 120 педаль, 240, 240 педаль
  'MKS-UT-029', 'MKS-UT-030', 'MKS-UT-032', 'MKS-UT-031',
  // уличные: маленькая напольная → подвесные на стойках → закрытые с проёмом → деревянные
  'MKS-UT-008',                                  // G Tegerek
  'MKS-UT-015', 'MKS-UT-001', 'MKS-СЗ0300',      // Jashyl, A1, AW
  'MKS-UT-020', 'MKS-UT-005', 'MKS-UT-006',      // Plaza, BP, BP PRO
  'MKS-UT-007', 'MKS-UT-004', 'MKS-UT-002', 'MKS-UT-003', // ECO, KÖRK, ARNUR 1, ARNUR 2
  // серии
  'MKS-UT-021', 'MKS-UT-022', 'MKS-UT-023',      // SW
  'MKS-UT-012', 'MKS-UT-013', 'MKS-UT-014',      // GW
  'СЗ0048', 'СЗ0048W2', 'СЗ0048W3',              // GWR
  'MKS-UT-009', 'MKS-UT-010', 'MKS-UT-011',      // G
  'MKS-UT-016', 'MKS-UT-025', 'MKS-UT-017',      // KARAKOL
  'MKS-UT-018', 'MKS-UT-019',                    // 3 BURCH
  // баки по объёму
  // большие баки — одним листом (pdf-page-bins-0-tashtandy.js): пластиковый 1100,
  // Tazalyk 660, Tazalyk в цветах, Tazalyk с крышкой, Ecomayak. Tazalyk R 1100 убран из PDF.
  'MKS-UT-028',                                  // пластиковый 1100
  'СЗ0055',                                      // Tazalyk 660
  'MKS-СЗ0050', 'MKS-UTH-021', 'Мусорный бак «Tazalyk» (Синий)', 'Мусорный бак «Tazalyk» без крышки  (Желтый)',
  'Мусорный бак «Tazalyk» с крышкой (Зеленный)',
  'MKS-СЗ0058',                                  // Ecomayak — в самом конце
];

(async () => {
  await mongoose.connect(MONGO_URI);
  const col = mongoose.connection.collection('products');
  if (process.argv.includes('--undo')) {
    const saved = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
    for (const d of saved) await col.updateOne({ _id: new ObjectId(d._id) }, { $set: { pdfOrder: d.pdfOrder ?? null } });
    console.log('Восстановлено:', saved.length);
    return process.exit(0);
  }
  const all = await col.find({ set: SET }, { projection: { sku: 1, name: 1, pdfOrder: 1 } }).toArray();
  const plan = ORDER.map((key, i) => {
    const hit = all.filter(p => p.sku === key || (!p.sku && p.name === key));
    if (hit.length !== 1) throw new Error(`«${key}»: найдено ${hit.length}`);
    return { p: hit[0], n: i + 1 };
  });
  plan.forEach(({ p, n }) => console.log(String(n).padStart(3), (p.sku || '—').padEnd(14), p.name));
  if (!process.argv.includes('--apply')) { console.log(`\nПредпросмотр: ${plan.length}. Запустите с --apply.`); return process.exit(0); }
  // Бэкап — только исходное состояние: повторный --apply его не затирает
  if (!fs.existsSync(BACKUP)) fs.writeFileSync(BACKUP, JSON.stringify(all.map(p => ({ _id: p._id, pdfOrder: p.pdfOrder ?? null })), null, 1));
  for (const { p, n } of plan) await col.updateOne({ _id: p._id }, { $set: { pdfOrder: n } });
  console.log(`\nОбновлено: ${plan.length}. Бэкап: ${BACKUP}`);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
