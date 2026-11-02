// Сборка готовых PDF-каталогов и запись в реестр (lib/catalogFiles.js). Запускает GitHub Actions.
//
//   node scripts/catalog-build.js --pending          всё, что запросили кнопки на сайте
//   node scripts/catalog-build.js <ключ> [--force]   один каталог
//   node scripts/catalog-build.js --all [--force]    все каталоги
//   node scripts/catalog-build.js --check            есть ли работа (пишет work=true в GITHUB_OUTPUT)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const cloudinary = require('cloudinary').v2;
const { parseKey, allKeys, fingerprint, getFile, col, SETS } = require('../lib/catalogFiles');

cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET });

const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'catalogs-'));
const force = process.argv.includes('--force');

async function publish(key, k, file, fp) {
  const up = await cloudinary.uploader.upload(file, { resource_type: 'raw', public_id: `matkasym/catalogs/${k.name}.pdf`, overwrite: true, invalidate: true });
  await col().updateOne({ _id: key }, { $set: { url: up.secure_url, fingerprint: fp, filename: k.filename, bytes: up.bytes, builtAt: new Date(), requested: false },
    $unset: { buildError: '', errorFingerprint: '' } }, { upsert: true });
  console.log(`  ✓ ${key}: ${(up.bytes / 1048576).toFixed(1)} МБ`);
  return up.secure_url;
}

// Каталог уже свежий — ничего не делаем: сборка стоит сотни обращений к Cloudinary за фото
async function isFresh(key, fp) {
  const doc = await getFile(key);
  return !force && doc?.url && doc.fingerprint === fp;
}

async function buildSet(key, k) {
  const fp = await fingerprint(key);
  if (await isFresh(key, fp)) return (await getFile(key)).url;
  const out = path.join(WORK, k.name);
  execFileSync(process.execPath, [path.join(__dirname, `build-${k.meta.script}-catalog.js`), out], { stdio: 'inherit', timeout: 900000 });
  const pdf = fs.readdirSync(out).find(f => f.endsWith('.pdf'));
  if (!pdf) throw new Error('PDF не создан: ' + key);
  return publish(key, k, path.join(out, pdf), fp);
}

async function buildMerged(key, k) {
  const fp = await fingerprint(key);
  if (await isFresh(key, fp)) return;
  // Сначала свежие сеты, затем склейка их файлов
  const src = path.join(WORK, 'merged-src');
  const { SETS: MERGE } = require('./build-shaar-catalog.js');
  const bySetTitle = Object.fromEntries(Object.entries(SETS).map(([slug, m]) => [m.title, slug]));
  for (const s of MERGE) {
    const setKey = `set:${bySetTitle[s.name]}`;
    const url = await buildSet(setKey, parseKey(setKey));
    const dest = path.join(src, s.file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const r = await fetch(url);
    if (!r.ok) throw new Error(`не скачан ${s.name}: ${r.status}`);
    fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
  }
  const out = path.join(WORK, 'merged');
  execFileSync(process.execPath, [path.join(__dirname, 'build-shaar-catalog.js'), src, out], { stdio: 'inherit', timeout: 1200000 });
  await publish(key, k, path.join(out, 'Каталог MATKASYM SHAAR (лёгкий).pdf'), fp);
}

async function buildGenerated(key, k) {
  const fp = await fingerprint(key);
  if (await isFresh(key, fp)) return;
  // Генератор держит состояние браузера в глобальных переменных: каждый каталог — отдельным процессом
  const work = path.join(WORK, k.name);
  execFileSync(process.execPath, [path.join(__dirname, 'build-generated-catalog.js'), k.brand, k.priceType, work], { stdio: 'inherit', timeout: 1800000 });
  await publish(key, k, path.join(work, 'catalog.pdf'), fp);
}

async function build(key) {
  const k = parseKey(key);
  if (!k) throw new Error('Неизвестный каталог: ' + key);
  console.log('→', key);
  if (k.kind === 'set') await buildSet(key, k);
  else if (k.merged) await buildMerged(key, k);
  else await buildGenerated(key, k);
  await col().updateOne({ _id: key }, { $set: { requested: false } }, { upsert: true });
}

(async () => {
  await mongoose.connect(MONGO_URI);
  const pending = (await col().find({ requested: true }).project({ _id: 1 }).toArray()).map(d => d._id);
  if (process.argv.includes('--check')) {
    const key = process.argv.find(a => parseKey(a));
    const work = pending.length > 0 || !!key || process.argv.includes('--all');
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `work=${work}\n`);
    console.log(work ? `Запрошено: ${pending.join(', ') || key || 'все'}` : 'Запросов нет');
    process.exit(0);
  }
  const named = process.argv.slice(2).filter(a => parseKey(a));
  const keys = process.argv.includes('--all') ? allKeys() : [...new Set([...named, ...pending])];
  let failed = 0;
  for (const key of keys) {
    try { await build(key); } catch (e) {
      failed++;
      console.error(`✗ ${key}:`, e.message);
      const fp = await fingerprint(key).catch(() => null);
      await col().updateOne({ _id: key }, { $set: { requested: false, buildError: String(e.message).slice(0, 500), errorFingerprint: fp } }, { upsert: true });
    }
  }
  console.log(`Готово: ${keys.length - failed} из ${keys.length}`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
