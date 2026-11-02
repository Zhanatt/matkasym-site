// Каталог бренда из генератора админки (catalogPrint.js / kyzmatPrint.js), но вне браузера: тот же код
// собирается esbuild под Node, HTML перехватывается и печатается headless Chrome, фото сжимаются.
//
//   node scripts/build-generated-catalog.js <brand> <price|priceWholesale|priceDealer|none> <папка>
//
// Подключение к базе — у вызывающего (catalog-build.js) или здесь, если запуск отдельный.
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { execFileSync } = require('child_process');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const { compressPdf } = require('../lib/catalogLayout');
const { BRIEF_FIELDS, attachKitPrices } = require('../lib/productBrief');
const { attachUrnVolume } = require('../lib/urnVolume');
const Product = require('../models/Product');
const { BRANDS } = require('../lib/catalogFiles');

const ROOT = path.join(__dirname, '..', '..');
const CLIENT = path.join(ROOT, 'client', 'src');
const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const esbuildPath = () => { try { return require.resolve('esbuild'); } catch { return path.join(ROOT, 'client', 'node_modules', 'esbuild'); } };

async function bundle(work) {
  const entry = path.join(work, 'entry.js');
  fs.writeFileSync(entry, `
    export { printCatalog, fitsCatalog } from ${JSON.stringify(path.join(CLIENT, 'pages/admin/catalogPrint.js'))};
    export { printKyzmatCatalog } from ${JSON.stringify(path.join(CLIENT, 'pages/admin/kyzmatPrint.js'))};
    export { brandPdfGroups } from ${JSON.stringify(path.join(CLIENT, 'pages/admin/brandPdfGroups.js'))};`);
  const stub = path.join(work, 'api-stub.js');
  fs.writeFileSync(stub, `export const adminGetCustomCategories = async () => ({ data: globalThis.__CUSTOM_CATS });
    export const adminGetPdfDetails = async ids => ({ data: { products: await globalThis.__PDF_DETAILS(ids) } });`);
  const out = path.join(work, 'bundle.cjs');
  await require(esbuildPath()).build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', outfile: out, logLevel: 'warning',
    plugins: [{ name: 'api-stub', setup(b) { b.onResolve({ filter: /api\/index$/ }, () => ({ path: stub })); } }] });
  return out;
}

// Chrome не успевает догрузить сотни картинок: хвост каталога выходил пустым, без ошибки. Поэтому фото качаем
// заранее (с повторами, общий кэш на все варианты: у опта и розницы одни и те же кадры), печатаем из файлов.
async function localizeImages(html, work) {
  const urls = [...new Set([...html.matchAll(/https:\/\/res\.cloudinary\.com\/[^"'\s)]+/g)].map(m => m[0]))];
  const cache = path.join(path.dirname(path.resolve(work)), 'img-cache');
  fs.mkdirSync(cache, { recursive: true });
  const fileOf = u => path.join(cache, crypto.createHash('sha1').update(u).digest('hex'));
  const failed = [];
  const one = async u => {
    const f = fileOf(u);
    if (fs.existsSync(f)) return;
    for (let i = 0; i < 5; i++) {
      try {
        const r = await fetch(u);
        if (r.ok) { fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); return; }
        if (r.status === 404) break;
      } catch { /* повтор */ }
      await new Promise(z => setTimeout(z, 2000 * (i + 1)));
    }
    failed.push(u);
  };
  let next = 0;
  await Promise.all(Array.from({ length: 10 }, async () => { while (next < urls.length) await one(urls[next++]); }));
  console.log(`  фото: ${urls.length}, не скачано: ${failed.length}`);
  if (failed.length > urls.length * 0.02) throw new Error(`не скачано ${failed.length} фото из ${urls.length}, например ${failed[0]}`);
  const bad = new Set(failed);
  return html.replace(/https:\/\/res\.cloudinary\.com\/[^"'\s)]+/g, u => (bad.has(u) ? u : `file://${fileOf(u)}`));
}

async function generate(brand, priceType, work) {
  fs.mkdirSync(work, { recursive: true });
  const db = mongoose.connection.db;
  const products = await Product.find({ brand, pendingReceive: { $ne: true } }).select(BRIEF_FIELDS)
    .slice('images', 1).slice('specs', 2).sort({ stock: -1, createdAt: -1 }).limit(5000).lean();
  await attachUrnVolume(products);
  await attachKitPrices(products);
  products.forEach(p => { delete p.kitParts; });
  const rows = await db.collection('setlayouts').find({ brand }).toArray();
  const layouts = {};
  rows.forEach(l => { const pr = {}; (l.productOrder || []).forEach(r => { pr[r.category] = r.names || []; }); layouts[l.set] = { categories: l.categories || [], products: pr }; });
  const brandDoc = await db.collection('brands').findOne({ key: brand });
  const sets = brandDoc?.sets || [];
  const cats = await db.collection('categoryspecs').find({ label: { $nin: ['', null] } }).project({ category: 1, label: 1 }).toArray();

  // Окружение браузера, которое ждёт генератор
  globalThis.__CUSTOM_CATS = cats.map(c => ({ value: c.category, label: c.label }));
  globalThis.__PDF_DETAILS = ids => Product.find({ _id: { $in: ids } }).select('specs images').slice('images', 6).lean()
    .then(list => JSON.parse(JSON.stringify(list)));
  globalThis.location = { origin: 'https://matkasym-site.onrender.com' };
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 0 }, configurable: true });
  let html = '';
  globalThis.window = { open: () => ({
    document: { open() {}, write(s) { html += s; }, close() {}, readyState: 'complete', images: [], fonts: { ready: Promise.resolve() } },
    addEventListener() {}, focus() {}, print() {},
  }) };

  const G = require(await bundle(work));
  const isKyzmat = brand === 'matkasym-kyzmat';
  const plain = JSON.parse(JSON.stringify(products));
  const frozen = new Set(sets.filter(s => s.frozen).map(s => s.key));
  const available = plain.filter(isKyzmat ? (p => p.productStatus !== 'kit_part') : G.fitsCatalog).filter(p => !frozen.has(p.set));
  if (!available.length) throw new Error('нечего печатать: ' + brand);
  const groups = G.brandPdfGroups(available, sets.map(s => ({ key: s.key, label: s.label, frozen: s.frozen, pdfOrder: s.pdfOrder })), layouts);
  if (isKyzmat) await G.printKyzmatCatalog(groups, priceType);
  else await G.printCatalog(groups, BRANDS[brand].replace('MATKASYM ', ''), priceType, brand === 'matkasym-shaar' ? 'shaar' : 'home', 'сом');
  // Плашка с подсказкой для печати из браузера в файл не идёт
  html = html.replace('</head>', '<style>.bar{display:none!important}</style></head>');
  // Логотип без прозрачности: /SMask ломает картинки на iPhone
  html = html.split('/logos/logo-main.png').join('https://res.cloudinary.com/dnbg21ef8/image/upload/matkasym/catalog-assets/logo-main.jpg');

  html = await localizeImages(html, work);

  const htmlFile = path.join(work, 'catalog.html');
  fs.writeFileSync(htmlFile, html);
  const raw = path.join(work, 'raw.pdf');
  execFileSync(CHROME, [...(process.env.CI ? ['--no-sandbox'] : []), '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
    '--allow-file-access-from-files', '--virtual-time-budget=120000', `--print-to-pdf=${raw}`, `file://${htmlFile}`], { stdio: 'ignore', timeout: 1200000 });
  const pdf = path.join(work, 'catalog.pdf');
  compressPdf(raw, pdf);
  return { pdf, groups: groups.map(g => [g.groupName, g.products.length]), size: fs.statSync(raw).size };
}

module.exports = { generate };

if (require.main === module) {
  const [brand, priceType, work] = process.argv.slice(2);
  (async () => {
    await mongoose.connect(MONGO_URI);
    const r = await generate(brand, priceType, work);
    console.log(r);
    process.exit(0);
  })().catch(e => { console.error(e); process.exit(1); });
}
