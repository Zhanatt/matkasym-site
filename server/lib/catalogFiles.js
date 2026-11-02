// Реестр готовых PDF-каталогов. Кнопка «PDF» спрашивает сервер: отпечаток данных совпал с файлом —
// отдаём файл, запросов к Cloudinary за фото нет. Не совпал — товар реально изменился, просим сборку
// (GitHub Actions, scripts/catalog-build.js), следующие скачивания снова идут из сохранённого файла.
//
// Ключи: set:<сет SHAAR> — свёрстанный каталог, розница;
//        brand:<бренд>:<price|priceWholesale|priceDealer|none> — каталог бренда целиком.
const crypto = require('crypto');
const mongoose = require('mongoose');

const COLLECTION = 'catalogfiles';
// Менять при правке вёрстки: все файлы станут устаревшими и пересоберутся при следующем нажатии
const LAYOUT_REV = '2026-11-02';
const SHAAR = 'matkasym-shaar';

// script — build-<script>-catalog.js, name — файл в Cloudinary raw matkasym/catalogs/, deps — сеты, из которых берутся товары
const SETS = {
  'uzak-koldon':     { script: 'uzak-koldon', name: 'uzak-koldon', title: 'UZAK KOLDON', deps: ['uzak-koldon'] },
  'mazza-seyil':     { script: 'mazza-seyil', name: 'mazza-seyil', title: 'MAZZA SEYIL', deps: ['mazza-seyil'] },
  'onoi-sakta':      { script: 'onoy-sakta', name: 'onoy-sakta', title: 'ONOY SAKTA', deps: ['onoi-sakta', 'baary-oorunda'] },
  '0-tashtandy':     { script: '0-tastandy', name: '0-tastandy', title: '0-TASTANDY', deps: ['0-tashtandy'] },
  'bilim-kelechek':  { script: 'bilim-kelechek', name: 'bilim-kelechek', title: 'BILIM KELECHEK', deps: ['bilim-kelechek'] },
  'bekem-fasad':     { script: 'bekem-fasad', name: 'bekem-fasad', title: 'BEKEM FASAD', deps: ['bekem-fasad'] },
  'kooz-koopsuzduk': { script: 'kooz-koopsuzduk', name: 'kooz-koopsuzduk', title: 'KOOZ KOOPSUZDUK', deps: ['kooz-koopsuzduk'] },
  'bekem-tosmo':     { script: 'bekem-tosmo', name: 'bekem-tosmo', title: 'BEKEM TOSMO', deps: ['bekem-tosmo'] },
};
const BRANDS = { 'matkasym-home': 'MATKASYM HOME', 'matkasym-shaar': 'MATKASYM SHAAR', 'matkasym-kyzmat': 'MATKASYM KYZMAT' };
const PRICE_TYPES = { price: '', priceWholesale: ' (оптовые цены)', priceDealer: ' (дилерские цены)', none: ' (без цен)' };

function parseKey(key) {
  const [kind, a, b] = String(key || '').split(':');
  if (kind === 'set' && SETS[a]) return { kind, set: a, meta: SETS[a], name: SETS[a].name, filename: `Каталог ${SETS[a].title}.pdf` };
  if (kind === 'brand' && BRANDS[a] && b in PRICE_TYPES) {
    const merged = a === SHAAR && b === 'price'; // SHAAR в рознице — склейка свёрстанных каталогов
    return { kind, brand: a, priceType: b, merged, name: merged ? 'shaar' : `gen-${a}-${b}`, filename: `Каталог ${BRANDS[a]}${PRICE_TYPES[b]}.pdf` };
  }
  return null;
}
const allKeys = () => [...Object.keys(SETS).map(s => `set:${s}`),
  ...Object.keys(BRANDS).flatMap(b => Object.keys(PRICE_TYPES).map(p => `brand:${b}:${p}`))];

const sha = v => crypto.createHash('sha1').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex');
const CONTENT = ['name', 'fullName', 'sku', 'set', 'category', 'color', 'dimensions', 'unit', 'productStatus', 'isKit', 'kitType', 'kitParts',
  'images', 'specs', 'hideInPdf', 'pdfGroup', 'pdfVariant', 'pdfSeries', 'pdfPage', 'pdfRange', 'pdfRangeExtra', 'pdfOrder', 'pdfNote', 'maker'];
const pick = (p, fields) => fields.map(f => p[f] ?? null);
const db = () => mongoose.connection.db;

async function fingerprintSet(meta) {
  const fields = [...CONTENT, 'price', 'priceWholesale', 'description'];
  const rows = await db().collection('products').find({ set: { $in: meta.deps } }).project(Object.fromEntries(fields.map(f => [f, 1]))).sort({ _id: 1 }).toArray();
  return sha([LAYOUT_REV, meta.name, rows.map(p => [String(p._id), pick(p, fields)])]);
}

async function fingerprintBrand(brand, priceType) {
  // Сам остаток не считается: он меняется постоянно, а в каталоге важно только, попадает ли товар в печать
  const fields = [...CONTENT, ...(priceType === 'none' ? [] : [priceType])];
  const proj = { ...Object.fromEntries(fields.map(f => [f, 1])), inStock: 1, stock: 1, isOnOrder: 1 };
  const rows = await db().collection('products').find({ brand, pendingReceive: { $ne: true } }).project(proj).sort({ _id: 1 }).toArray();
  const brandDoc = await db().collection('brands').findOne({ key: brand }, { projection: { sets: 1 } });
  const sets = (brandDoc?.sets || []).map(s => [s.key, s.label, !!s.frozen, s.pdfOrder ?? null]);
  const layouts = await db().collection('setlayouts').find({ brand }).project({ set: 1, categories: 1, productOrder: 1 }).sort({ set: 1 }).toArray();
  return sha([LAYOUT_REV, brand, priceType, sets, layouts.map(l => [l.set, l.categories, l.productOrder]),
    rows.map(p => [String(p._id), pick(p, fields), !!(p.inStock || p.stock > 0 || p.isOnOrder)])]);
}

async function fingerprint(key) {
  const k = parseKey(key);
  if (!k) throw new Error('Неизвестный каталог: ' + key);
  if (k.kind === 'set') return fingerprintSet(k.meta);
  if (k.merged) return sha([LAYOUT_REV, await Promise.all(Object.values(SETS).map(fingerprintSet))]);
  return fingerprintBrand(k.brand, k.priceType);
}

const col = () => db().collection(COLLECTION);
const getFile = key => col().findOne({ _id: key });

async function dispatchBuild(key) {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) return false;
  const r = await fetch('https://api.github.com/repos/Zhanatt/matkasym-site/dispatches', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_type: 'build-catalog', client_payload: { key } }),
  });
  if (!r.ok) console.error('Сборка каталога не запущена:', r.status, await r.text());
  return r.ok;
}

// Что отдать кнопке. requestBuild=false — для опроса, пока идёт уже запрошенная сборка.
const BUILD_TIMEOUT = 25 * 60 * 1000;
async function resolveFile(key) {
  const k = parseKey(key);
  if (!k) return null;
  const fp = await fingerprint(key);
  const doc = await getFile(key);
  if (doc?.url && doc.fingerprint === fp) return { status: 'ready', url: doc.url, filename: k.filename };
  const last = { url: doc?.url || null, filename: k.filename };
  // Эта версия данных уже не собралась: не гоняем сборку по кругу, отдаём последний файл
  if (doc?.buildError && doc.errorFingerprint === fp) return { status: 'stale', ...last, instant: false };
  const already = doc?.requestedFingerprint === fp && doc.requestedAt && Date.now() - new Date(doc.requestedAt).getTime() < BUILD_TIMEOUT;
  let instant = !!process.env.GITHUB_DISPATCH_TOKEN;
  if (!already) {
    await col().updateOne({ _id: key }, { $set: { requested: true, requestedFingerprint: fp, requestedAt: new Date() }, $unset: { buildError: '', errorFingerprint: '' } }, { upsert: true });
    instant = await dispatchBuild(key).catch(e => { console.error(e.message); return false; });
  }
  return { status: 'building', ...last, instant };
}

module.exports = { parseKey, allKeys, fingerprint, getFile, resolveFile, col, SETS, BRANDS, PRICE_TYPES };
