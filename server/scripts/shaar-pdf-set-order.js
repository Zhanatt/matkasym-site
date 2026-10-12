// Порядок сетов SHAAR в общем PDF-каталоге (12.10.2026). На экране порядок прежний.
// Без --apply только показывает. --undo убирает pdfOrder.
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const ORDER = ['0-tashtandy', 'mazza-seyil', 'kooz-koopsuzduk', 'uzak-koldon', 'bilim-kelechek', 'onoi-sakta', 'bekem-fasad', 'bekem-tosmo'];

(async () => {
  await mongoose.connect(MONGO_URI);
  const col = mongoose.connection.collection('brands');
  const brand = await col.findOne({ key: 'matkasym-shaar' });
  const keys = brand.sets.map(s => s.key);
  const missing = ORDER.filter(k => !keys.includes(k));
  if (missing.length) { console.error('Нет сетов:', missing); process.exit(1); }
  const undo = process.argv.includes('--undo');
  ORDER.forEach((k, i) => console.log(`${i + 1}. ${brand.sets.find(s => s.key === k).label}`));
  console.log('Без номера (в конце):', keys.filter(k => !ORDER.includes(k)).join(', ') || '—');
  if (!process.argv.includes('--apply') && !undo) { console.log('\nПредпросмотр. Запустите с --apply.'); return process.exit(0); }
  for (const k of keys) {
    const i = ORDER.indexOf(k);
    await col.updateOne({ key: 'matkasym-shaar', 'sets.key': k },
      undo || i < 0 ? { $unset: { 'sets.$.pdfOrder': '' } } : { $set: { 'sets.$.pdfOrder': i } });
  }
  console.log(undo ? 'pdfOrder убран' : 'Готово');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
