// 10.10.2026: Nurjol Square → Nurjol Charchy; Novotel 1/3 → 3 BURCH 1/3;
// Koopsuzbike Stoika → статус «На улучшении», проблема «Шатается».
// Без --apply только показывает. --apply пишет бэкап, правит товары, порядок
// в сете (SetLayout хранит имена) и историю изменений. --undo откатывает товары и порядок.
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const { ObjectId } = mongoose.Types;

const RENAMES = [
  { id: '6a1d38cba7d1feff777480d6', from: 'Nurjol Square', to: 'Nurjol Charchy' },
  { id: '69f2e9ccc7006efdb3cc8a84', from: 'Novotel 1',     to: '3 BURCH 1' },
  { id: '69f2d85050420bce3b53b712', from: 'Novotel 3',     to: '3 BURCH 3' },
];
const IMPROVE = { id: '6a7efa52ff1030c8b93e9e22', name: 'Koopsuzbike Stoika', problem: 'Шатается' };
const BACKUP = path.join(__dirname, 'rename-and-improve-2026-10-10.backup.json');
const swap = (s, a, b) => (typeof s === 'string' ? s.split(a).join(b) : s);

(async () => {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  const products = db.collection('products');
  const layouts = db.collection('setlayouts');
  const ids = [...RENAMES.map(r => r.id), IMPROVE.id].map(i => new ObjectId(i));

  if (process.argv.includes('--undo')) {
    const b = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
    for (const p of b.products) {
      const { _id, ...rest } = p;
      await products.updateOne({ _id: new ObjectId(_id) }, { $set: rest });
    }
    for (const l of b.layouts) await layouts.updateOne({ _id: new ObjectId(l._id) }, { $set: { productOrder: l.productOrder } });
    console.log('Откат:', b.products.length, 'товаров,', b.layouts.length, 'расстановок');
    return process.exit(0);
  }

  const docs = await products.find({ _id: { $in: ids } },
    { projection: { name: 1, fullName: 1, description: 1, productStatus: 1, improvementTZ: 1 } }).toArray();
  const byId = Object.fromEntries(docs.map(d => [String(d._id), d]));
  const plan = [];
  for (const r of RENAMES) {
    const d = byId[r.id];
    if (!d || d.name !== r.from) throw new Error(`Не найден или уже переименован: ${r.from}`);
    const set = { name: r.to, fullName: swap(d.fullName, r.from, r.to), description: swap(d.description, r.from, r.to) };
    plan.push({ d, set, label: r.to });
    console.log(`«${d.name}» → «${set.name}»;  полное: «${d.fullName}» → «${set.fullName}»`);
  }
  const s = byId[IMPROVE.id];
  if (!s || s.name !== IMPROVE.name) throw new Error('Не найден Koopsuzbike Stoika');
  const imp = { productStatus: 'improvement', 'improvementTZ.problem': IMPROVE.problem };
  plan.push({ d: s, set: imp, label: s.fullName });
  console.log(`«${s.fullName}»: статус ${s.productStatus} → improvement, проблема: «${IMPROVE.problem}»`);

  const lay = await layouts.find({ 'productOrder.names': { $in: RENAMES.map(r => r.from) } }).toArray();
  console.log('Расстановок сета с этими именами:', lay.length);

  if (!process.argv.includes('--apply')) { console.log('\nПредпросмотр. Запустите с --apply.'); return process.exit(0); }

  fs.writeFileSync(BACKUP, JSON.stringify({
    products: docs.map(d => ({ _id: d._id, name: d.name, fullName: d.fullName, description: d.description,
      productStatus: d.productStatus, 'improvementTZ.problem': d.improvementTZ?.problem || '' })),
    layouts: lay.map(l => ({ _id: l._id, productOrder: l.productOrder })),
  }, null, 1));

  for (const { d, set, label } of plan) {
    await products.updateOne({ _id: d._id }, { $set: set });
    const changes = Object.entries(set).map(([field, to]) => ({ field, from: field.split('.').reduce((o, k) => o?.[k], d) ?? '', to }));
    await db.collection('changelogs').insertOne({ productId: d._id, productName: label,
      changedBy: { name: 'Claude (по просьбе Жаната)' }, changes, createdAt: new Date(), updatedAt: new Date() });
  }
  for (const l of lay) {
    const order = l.productOrder.map(g => ({ ...g, names: (g.names || []).map(n => RENAMES.find(r => r.from === n)?.to || n) }));
    await layouts.updateOne({ _id: l._id }, { $set: { productOrder: order } });
  }
  console.log(`\nГотово. Бэкап: ${BACKUP}`);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
