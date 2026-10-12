// KOOZ KOOPSUZDUK в PDF (12.10.2026): сначала серийные щиты, потом индивидуальные, ВРУ в конце.
//   IP31 (+ ЩРн IP31, газовый щит карточкой внизу листа) → IP54: ЩМП + щит 50×40×18 →
//   IP30 с монтажной панелью → нержавейка IP44 → пластиковые встраиваемые, накладные →
//   прочие настенные → этажные → сантехнические → пожарные → прочее (люки) → ВРУ.
// ЩМП 65×50×20 из категории electric-panel-mount — в «Щиты монтажные (ЩМП)», к остальным ЩМП.
// Из PDF убраны TI box и дубль «Электрощит 50х40х18 IP54» без цены. Экран не трогает (кроме категории ЩМП).
// Без --apply только показывает. --undo откатывает из бэкапа.
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const { ObjectId } = mongoose.Types;
const BACKUP = path.join(__dirname, 'pdf-order-kooz.backup.json');
const SET = 'kooz-koopsuzduk';
const IP31 = 'Электрощиты настенные IP31';
const IP54 = 'Электрощиты IP54';
const FIELDS = ['category', 'dimensions', 'pdfRange', 'pdfRangeExtra', 'pdfNote', 'pdfOrder', 'hideInPdf'];

const rank = p => {
  const c = p.category;
  if (p.pdfRange === IP31) return 1;
  if (p.pdfRange === IP54) return 2;
  if (/IP30 с монтажной/.test(p.pdfRange)) return 3;
  if (/нержавейки/.test(p.pdfRange)) return 4;
  if (c === 'Распред. щиты встраиваемые') return 5;
  if (c === 'Распред. щиты накладные') return 6;
  if (c === 'Электрощиты настенные') return 7;
  if (c === 'Щиты этажные') return 8;
  if (c === 'Щиты сантехнические') return 9;
  if (c === 'Шкафы пожарные') return 10;
  if (/^ВРУ/.test(c) || /ВРУ/.test(p.name)) return 12;
  // Из чужих категорий («other» и т.п.) — по названию к своим
  if (/газов|ЩГР/i.test(p.name)) return 1;
  if (/этаж/i.test(p.name)) return 8;
  if (/сантех/i.test(p.name)) return 9;
  if (/пожар/i.test(p.name)) return 10;
  return 11;
};

(async () => {
  await mongoose.connect(MONGO_URI);
  const col = mongoose.connection.collection('products');
  if (process.argv.includes('--undo')) {
    const saved = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
    for (const d of saved) {
      const set = {}; FIELDS.forEach(f => { set[f] = d[f] ?? (f === 'pdfOrder' ? null : f === 'pdfRangeExtra' || f === 'hideInPdf' ? false : ''); });
      await col.updateOne({ _id: new ObjectId(d._id) }, { $set: set });
    }
    console.log('Восстановлено:', saved.length);
    return process.exit(0);
  }
  const proj = { name: 1, sku: 1, price: 1 }; FIELDS.forEach(f => { proj[f] = 1; });
  const all = await col.find({ set: SET }, { projection: proj }).toArray();
  const before = JSON.parse(JSON.stringify(all));

  const bySku = sku => { const p = all.find(x => x.sku === sku); if (!p) throw new Error('нет ' + sku); return p; };
  bySku('MKS-KS-IP54-10').category = 'Щиты монтажные (ЩМП)';
  Object.assign(bySku('MKS-KS-Х65'), { pdfRange: IP31, pdfNote: 'ЩРн' });
  // Газовые щиты — карточками внизу листа IP31
  all.filter(p => /газов|ЩГР/i.test(p.name)).forEach(p => Object.assign(p, { pdfRange: IP31, pdfRangeExtra: true }));
  // ЩМП: IP54 — в линейку IP54, IP31 — в линейку IP31; подпись «ЩМП» под коробом
  all.filter(p => p.category === 'Щиты монтажные (ЩМП)')
    .forEach(p => Object.assign(p, { pdfRange: /IP\s*31/i.test(p.name) ? IP31 : IP54, pdfNote: 'ЩМП' }));
  all.filter(p => /^MKS-XX-IP31/.test(p.sku || '')).forEach(p => { p.pdfRange = IP31; });
  Object.assign(bySku('MKS-KS-Х40-12'), { pdfRange: IP54, dimensions: bySku('MKS-KS-Х40-12').dimensions || '50x40x18' });
  bySku('MKS-KS-002').hideInPdf = true;      // TI box
  bySku('MKS-KS-Х40-4').hideInPdf = true;    // дубль 50х40х18 IP54 без цены

  const sorted = [...all].sort((a, b) => rank(a) - rank(b) || (Number(a.price) || 0) - (Number(b.price) || 0) || a.name.localeCompare(b.name, 'ru'));
  sorted.forEach((p, i) => { p.pdfOrder = i + 1; });

  const changed = all.filter(p => { const b = before.find(x => String(x._id) === String(p._id)); return FIELDS.some(f => (b[f] ?? null) !== (p[f] ?? null)); });
  sorted.forEach(p => console.log(String(p.pdfOrder).padStart(4), String(rank(p)).padStart(3), (p.sku || '—').padEnd(20), p.name.slice(0, 55), p.hideInPdf ? '  [скрыт]' : '', p.pdfRangeExtra ? '  [внизу листа]' : ''));
  if (!process.argv.includes('--apply')) { console.log(`\nПредпросмотр: изменится ${changed.length}. Запустите с --apply.`); return process.exit(0); }
  if (!fs.existsSync(BACKUP)) fs.writeFileSync(BACKUP, JSON.stringify(before, null, 1));
  for (const p of changed) { const set = {}; FIELDS.forEach(f => { if (p[f] !== undefined) set[f] = p[f]; }); await col.updateOne({ _id: p._id }, { $set: set }); }
  console.log(`\nОбновлено: ${changed.length}. Бэкап: ${BACKUP}`);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
