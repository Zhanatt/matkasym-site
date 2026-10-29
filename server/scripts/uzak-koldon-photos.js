// Новые фото сета UZAK KOLDON (29.10.2026).
//
// Из групповых кадров (Figma, «Frame 539…551») нарезаны отдельные шкафы и тумбы.
// Каждому товару ставим главным фото его нарезку, вторым — групповой кадр серии.
// Старые фото остаются в карточке после новых, из Cloudinary ничего не удаляем.
// Групповой кадр лежит в Cloudinary как matkasym/uzak-koldon/series-<серия>,
// по этому имени его находит PDF-каталог (build-uzak-koldon-catalog.js).
//
// Заодно чиним TSh 3: настоящая запись — 6a8521c2…cb0098 (по 1С «с 3 ящиками,
// H1026»), у неё было имя и вариант от TSh 4. Вторая MKS-TSh-3 (…025f97) —
// поздняя копия с данными TSh 4: прячем её из PDF, не удаляем.
//
//   node scripts/uzak-koldon-photos.js <папка с нарезками>          — предпросмотр
//   node scripts/uzak-koldon-photos.js <папка с нарезками> --apply  — записать

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const cloudinary = require('../lib/cloudinary');

const DIR = process.argv[2];
const APPLY = process.argv.includes('--apply');
if (!DIR || !fs.existsSync(DIR)) { console.error('Укажите папку с нарезками'); process.exit(1); }

const CARD_ID = '6aa7ae3943f109a689024caa';
const TSH3_ID = '6a8521c255b2177465cb0098';
const TSH3_DUP_ID = '6aa7b0a643f109a689025f97';

(async () => {
  await mongoose.connect(MONGO_URI);
  const col = mongoose.connection.db.collection('products');
  const files = fs.readdirSync(DIR).filter(f => f.endsWith('.jpg'));
  const crops = files.filter(f => f.includes('--'));
  const series = files.filter(f => f.startsWith('series-'));

  // Кто есть кто
  const plan = [];
  for (const f of crops) {
    const [ser, key] = f.replace('.jpg', '').split('--');
    let doc;
    if (key === 'CARD') doc = await col.findOne({ _id: new mongoose.Types.ObjectId(CARD_ID) });
    else if (key === 'MKS-TSh-3') doc = await col.findOne({ _id: new mongoose.Types.ObjectId(TSH3_ID) });
    else doc = await col.findOne({ sku: key, set: 'uzak-koldon' });
    if (!doc) throw new Error('нет товара ' + key);
    plan.push({ file: f, ser, doc });
  }
  plan.forEach(p => console.log(p.doc.sku || '(без SKU)', '·', p.doc.name, '←', p.file));
  console.log(`\n${plan.length} товаров, ${series.length} групповых кадров`);

  if (!APPLY) { console.log('\nПредпросмотр. Для записи добавьте --apply'); process.exit(0); }

  const backupIds = [...plan.map(p => p.doc._id), new mongoose.Types.ObjectId(TSH3_DUP_ID)];
  const backup = await col.find({ _id: { $in: backupIds } }).toArray();
  const bfile = path.join(__dirname, `backup-uzak-koldon-photos-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(bfile, JSON.stringify(backup, null, 1));
  console.log('Бэкап:', bfile);

  const seriesUrl = {};
  for (const f of series) {
    const ser = f.replace('series-', '').replace('.jpg', '');
    const up = await cloudinary.uploader.upload(path.join(DIR, f),
      { public_id: `matkasym/uzak-koldon/series-${ser}`, overwrite: true, invalidate: true });
    seriesUrl[ser] = up.secure_url;
    console.log('↑', f);
  }

  for (const p of plan) {
    const slug = (p.doc.sku || 'card-cabinet').toLowerCase();
    const up = await cloudinary.uploader.upload(path.join(DIR, p.file),
      { public_id: `matkasym/uzak-koldon/${slug}`, overwrite: true, invalidate: true });
    const fresh = [up.secure_url, seriesUrl[p.ser]].filter(Boolean);
    // Повторный запуск не должен копить старые версии своих же файлов
    let old = p.doc.images || [];
    // bi/mr/one — это прежнее главное фото с очищенным фоном: прежнее убираем,
    // но только при первом запуске (пока главным стоит не наш файл)
    if (['bi', 'mr', 'one'].includes(p.ser) && old[0] && !old[0].includes('/matkasym/uzak-koldon/')) old = old.slice(1);
    old = old.filter(u => !u.includes('/matkasym/uzak-koldon/'));
    await col.updateOne({ _id: p.doc._id }, { $set: { images: [...new Set([...fresh, ...old])] } });
    console.log('✓', p.doc.sku || p.doc.name);
  }

  await col.updateOne({ _id: new mongoose.Types.ObjectId(TSH3_ID) }, { $set: {
    name: 'Тумба AICHUROK TSh 3 - H1026×W900×D450',
    fullName: 'Тумба AICHUROK TSh 3 - H1026×W900×D450',
    nameByBase: { matkasym: 'Тумба AICHUROK TSh 3 - H1026×W900×D450' },
    pdfVariant: 'TSh 3',
  } });
  await col.updateOne({ _id: new mongoose.Types.ObjectId(TSH3_DUP_ID) }, { $set: { hideInPdf: true } });
  console.log('✓ TSh 3 исправлен, дубль скрыт из PDF');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
