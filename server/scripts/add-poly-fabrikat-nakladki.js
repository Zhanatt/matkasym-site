/**
 * Четыре декоративные ременные накладки в сет Poly Fabrikat, категория «декоративная-деталь».
 *
 * Источник — тех.лист «Комплект декоративных ременных накладок — 4 детали» (заказчик —
 * физ. лицо, менеджер Бейшеналиева А.). Тех.лист общий на четыре детали, поэтому он
 * прикреплён к каждой карточке. Фото — рендеры деталей из Downloads.
 *
 * Цены в тех.листе нет — карточки заводятся с «цена не определена», остаток 0,
 * «под заказ» (деталь делают по заказу, на складе её нет).
 *
 *   node scripts/add-poly-fabrikat-nakladki.js           # показать, что заведётся
 *   node scripts/add-poly-fabrikat-nakladki.js --apply   # загрузить файлы и завести
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const cloudinary = require('../lib/cloudinary');
const Product = require('../models/Product');

const APPLY = process.argv.includes('--apply');
const DL = '/Users/zhanat/Downloads';
const PDF = `${DL}/Комплект декоративных ременных накладок - 4 детали.pdf`;
const PDF_NAME = 'Тех.лист — Комплект декоративных ременных накладок (4 детали).pdf';

// Общее для всех деталей — таблица «Технические характеристики» тех.листа
const COMMON = [
  ['Материал', 'Нержавеющая сталь'],
  ['Толщина металла', '0,9 мм'],
  ['Диаметр монтажных отверстий', 'Ø4 мм'],
  ['Технология изготовления', 'Лазерная резка'],
  ['Покрытие', 'Без покраски'],
  ['Особенности', 'Острые лазерные вырезы орнамента'],
];

// Размеры и число отверстий — с чертежей деталей на том же листе
const PARTS = [
  { n: 1, l: 140, w: 18, orn: 43, holes: 4, img: 'Накладка ременная декоративная (140×18 мм) — Деталь 1.png',
    about: 'длинная, орнамент из трёх элементов с центральной розеткой' },
  { n: 2, l: 120, w: 18, orn: 30, holes: 3, img: 'Накладка ременная декоративная (120х18 мм) - Деталь 2.png',
    about: 'орнамент из двух элементов у края' },
  { n: 3, l: 120, w: 25, orn: 20, holes: 4, img: 'Накладка ременная декоративная (120х25 мм) - Деталь 3.png',
    about: 'расширенная середина 25 мм с двумя орнаментами, концы 18 мм' },
  { n: 4, l: 40, w: 18, orn: 28, holes: 2, img: 'Накладка ременная декоративная (40х18 мм) - Деталь 4.png',
    about: 'короткая, орнамент из двух элементов между отверстиями' },
];

async function findSetAndCategory() {
  const db = mongoose.connection.db;
  // Сет ищем по товарам и по любым коллекциям с описаниями сетов — где он заведён, заранее не знаем
  const fromProducts = await db.collection('products').aggregate([
    { $match: { set: /poly|fabrik/i } }, { $group: { _id: { set: '$set', brand: '$brand' } } },
  ]).toArray();
  const found = fromProducts.map(r => r._id);
  if (!found.length) {
    for (const { name } of await db.listCollections().toArray()) {
      if (!/set|brand/i.test(name)) continue;
      const docs = await db.collection(name).find({ $or: [
        { key: /poly|fabrik/i }, { slug: /poly|fabrik/i }, { label: /poly|fabrik/i }, { name: /poly|fabrik/i },
        { 'sets.key': /poly|fabrik/i }, { 'sets.label': /poly|fabrik/i },
      ] }).limit(5).toArray();
      docs.forEach(d => console.log(`   найдено в ${name}:`, JSON.stringify(d).slice(0, 300)));
      docs.forEach(d => {
        const s = (d.sets || []).find(x => /poly|fabrik/i.test(`${x.key} ${x.label}`)) || d;
        found.push({ set: s.key || s.slug, brand: d.brand || d.brandKey || s.brand });
      });
    }
  }
  const cat = await db.collection('categoryspecs').findOne({ $or: [{ category: /декоратив/i }, { label: /декоратив/i }] });
  return { found, category: cat?.category || 'декоративная-деталь', catLabel: cat?.label || '(новая)' };
}

async function upload(file, opts) {
  const r = await cloudinary.uploader.upload(file, opts);
  return r.secure_url;
}

(async () => {
  await mongoose.connect(MONGO_URI);
  const { found, category, catLabel } = await findSetAndCategory();
  console.log('Сет:', JSON.stringify(found), '\nКатегория:', category, '—', catLabel);
  const uniq = [...new Map(found.filter(f => f.set).map(f => [`${f.brand}|${f.set}`, f])).values()];
  if (uniq.length !== 1 || !uniq[0].brand) {
    console.log('⚠ Сет не определён однозначно — укажите brand/set вручную');
    await mongoose.disconnect(); return;
  }
  const { brand, set } = uniq[0];

  const exists = await Product.find({ set, name: /Накладка ременная декоративная/ }).select('fullName').lean();
  if (exists.length) {
    console.log('⚠ Уже заведены:', exists.map(e => e.fullName).join('; '));
    await mongoose.disconnect(); return;
  }

  // Артикулы сета — MKS-PF-NNN; берём следующие свободные номера
  const used = await Product.find({ sku: /^MKS-PF-\d+$/ }).select('sku').lean();
  let next = Math.max(0, ...used.map(u => +u.sku.slice(7))) + 1;

  const cards = PARTS.map(p => {
    const fullName = `Накладка ременная декоративная (${p.l}×${p.w} мм) — Деталь ${p.n}`;
    return {
      p, doc: {
        name: fullName, fullName, brand, set, category,
        sku: `MKS-PF-${String(next++).padStart(3, '0')}`,
        price: 0, priceUndefined: true,
        stock: 0, inStock: false, stockStatus: 'out_of_stock', isOnOrder: true,
        productStatus: 'for_sale',
        dimensions: `${p.l}×${p.w}×0,9 мм`,
        description: `Декоративная ременная накладка из нержавеющей стали 0,9 мм, ${p.about}. `
          + `Орнамент вырезан лазером, покрытие не наносится. Крепится через ${p.holes} монтажных `
          + `отверстия Ø4 мм. Деталь ${p.n} из комплекта из четырёх накладок.`,
        specs: [
          ['Длина', `${p.l} мм`], ['Ширина', `${p.w} мм`],
          ...COMMON.slice(0, 2),
          ['Длина орнамента', `${p.orn} мм`],
          ['Кол-во монтажных отверстий', String(p.holes)],
          ...COMMON.slice(2),
          ['Комплект', `Деталь ${p.n} из 4`],
        ].map(([key, value]) => ({ key, value, options: [] })),
      },
    };
  });

  cards.forEach(({ doc }) => {
    console.log(`\n■ ${doc.sku} ${doc.fullName}\n   ${doc.brand} / ${doc.set} / ${doc.category} · ${doc.dimensions} · под заказ, цена не определена`);
    doc.specs.forEach(s => console.log(`     ${s.key}: ${s.value}`));
  });

  if (!APPLY) { console.log('\nПредпросмотр. Для записи — с флагом --apply'); await mongoose.disconnect(); return; }

  const pdfUrl = await upload(PDF, { folder: 'matkasym/tech-sheets', resource_type: 'auto',
    public_id: 'poly-fabrikat-nakladki-4-detali', overwrite: true });
  console.log('\nТех.лист:', pdfUrl);

  for (const { p, doc } of cards) {
    const img = await upload(path.join(DL, p.img), { folder: `matkasym/${set}` });
    const now = new Date();
    // createdAt руками: поле isNew в схеме ломает timestamps (см. CLAUDE.md)
    const created = await Product.create({ ...doc, images: [img], techSheet: { files: [{ name: PDF_NAME, url: pdfUrl }] } });
    // через коллекцию: Mongoose при timestamps выбрасывает createdAt из $set
    await Product.collection.updateOne({ _id: created._id }, { $set: { createdAt: now, updatedAt: now } });
    console.log(`✓ ${doc.fullName} — ${created._id}`);
  }
  await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
