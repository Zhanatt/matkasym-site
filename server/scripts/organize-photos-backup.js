// Раскладка выгруженных фотографий по брендам и сетам, с человеческими именами.
//
// Cloudinary хранит файлы под случайными public_id («dtpfgczns6ppbgidyfjb.png»),
// потому что в пресете загрузки стоит use_filename: false. В плоской папке
// из 3369 таких файлов найти что-либо невозможно, поэтому раскладываем так же,
// как товары устроены на сайте:
//
//   MATKASYM HOME/Taza Kiym/Сушилка для белья SAKURA (розовая) 1.png
//   MATKASYM SHAAR/Kooz Koopsuzduk/Электрощит 50х40х20 1.png
//   _не привязано к товару/dtpfgczns6ppbgidyfjb.png
//
// Файлы ПЕРЕМЕЩАЮТСЯ, а не копируются. Если одна и та же картинка используется
// несколькими товарами, для второго и далее создаётся жёсткая ссылка — на диске
// это те же байты, без дублирования.
//
//   node scripts/organize-photos-backup.js [папка]
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const os = require('os');
const mongoose = require('mongoose');

const OUT = process.argv[2] || path.join(os.homedir(), 'matkasym-photos-backup');
const MONGO = process.env.MONGODB_ATLAS_URI
  || require('../lib/atlas');

const BRAND_DIRS = { 'matkasym-home': 'MATKASYM HOME', 'matkasym-shaar': 'MATKASYM SHAAR' };

const SET_NAMES = {
  'onuguu-set': 'Onuguu Set', 'dayar-tutuk': 'Dayar Tutuk', 'achyk-asman': 'Achyk Asman',
  'den-sooluk': 'Den Sooluk', 'zhashyl-omur': 'Zhashyl Omur', 'zhashyl-omur-shaar': 'Zhashyl Omur (Shaar)',
  'jenil-ashkana': 'Jenil Ashkana', 'konok-keldi': 'Konok Keldi', 'korkom-aiym': 'Korkom Aiym',
  'kosh-keliniz': 'Kosh Keliniz', 'onoi-sakta': 'Onoi Sakta', 'baary-oorunda': 'Baary Oorunda',
  'sanarip-tv': 'Sanarip TV', 'shirin-balalyk': 'Shirin Balalyk', 'taza-kiym': 'Taza Kiym',
  'uydo-ishtoo': 'Uydo Ishtoo', 'mazza-seyil': 'Mazza Seyil', 'bekem-fasad': 'Bekem Fasad',
  'bekem-tosmo': 'Bekem Tosmo', 'bilim-kelechek': 'Bilim Kelechek', 'kooz-koopsuzduk': 'Kooz Koopsuzduk',
  'uzak-koldon': 'Uzak Koldon', '0-tashtandy': '0-Tashtandy', '0-tashtandy-home': '0-Tashtandy (Home)',
  'poly-fabrikat': 'Polufabrikat', 'equipment': 'Oborudovanie', 'misc': 'Raznoe',
};

const setDir = (slug) => !slug ? 'Без сета'
  : (SET_NAMES[slug] || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));

// macOS запрещает «/» и «:» в именах файлов; остальное чистим от управляющих
// символов и схлопываем пробелы, чтобы имена оставались читаемыми.
function safeName(s) {
  return String(s || '')
    .replace(/[/:\\?%*|"<>]/g, '-')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 120) || 'Без названия';
}

// https://res.cloudinary.com/<cloud>/image/upload/v123/<public_id>.png → public_id
function publicIdFromUrl(url) {
  const m = String(url || '').match(/\/upload\/(?:[^/]+\/)*?(?:v\d+\/)?(.+)$/);
  if (!m) return null;
  return m[1].replace(/\.[a-z0-9]+$/i, '');
}

async function main() {
  if (!fs.existsSync(OUT)) { console.error('Нет папки', OUT); process.exit(1); }

  await mongoose.connect(MONGO);
  const products = await mongoose.connection.db.collection('products')
    .find({ images: { $elemMatch: { $regex: 'res.cloudinary.com' } } },
          { projection: { fullName: 1, name: 1, sku: 1, brand: 1, set: 1, images: 1 } })
    .toArray();
  await mongoose.disconnect();
  console.log(`Товаров с картинками: ${products.length}`);

  // public_id → куда положить (может быть несколько мест: картинка у нескольких товаров)
  const targets = new Map();
  const used = new Set();
  for (const p of products) {
    const urls = (p.images || []).filter(u => u && u.includes('res.cloudinary.com'));
    const dir  = path.join(OUT, BRAND_DIRS[p.brand] || 'Прочие бренды', setDir(p.set));
    const base = safeName(p.fullName || p.name);
    urls.forEach((u, i) => {
      const pid = publicIdFromUrl(u);
      if (!pid) return;
      // Номер добавляем только когда фотографий у товара больше одной.
      let name = urls.length > 1 ? `${base} ${i + 1}` : base;
      let dest = path.join(dir, name);
      // Разные товары могут называться одинаково — разводим по артикулу.
      if (used.has(dest.toLowerCase())) dest = path.join(dir, `${name} (${safeName(p.sku || p._id)})`);
      used.add(dest.toLowerCase());
      if (!targets.has(pid)) targets.set(pid, []);
      targets.get(pid).push(dest);
    });
  }
  console.log(`Привязок картинка→товар: ${targets.size}`);

  // Обход рекурсивный: public_id может содержать «/», и тогда backup-cloudinary.js
  // сохранил файл в подпапке (matkasym/covers/…, samples/… и т.п.).
  // Уже разложенные каталоги пропускаем, чтобы скрипт можно было запускать повторно.
  const SKIP = new Set([...Object.values(BRAND_DIRS), 'Прочие бренды', '_не привязано к товару']);
  const flat = [];
  (function walk(dir, rel) {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      if (d.name.startsWith('.')) continue;
      const r = rel ? `${rel}/${d.name}` : d.name;
      if (d.isDirectory()) { if (!SKIP.has(r)) walk(path.join(dir, d.name), r); continue; }
      if (d.name.startsWith('_')) continue;   // _manifest.json
      flat.push({ name: r });
    }
  })(OUT, '');

  let moved = 0, linked = 0, orphan = 0;
  const orphanDir = path.join(OUT, '_не привязано к товару');

  for (const f of flat) {
    const src = path.join(OUT, f.name);
    const ext = path.extname(f.name);
    const pid = f.name.slice(0, -ext.length);   // public_id = путь от корня без расширения
    const dests = targets.get(pid);

    if (!dests || !dests.length) {
      fs.mkdirSync(orphanDir, { recursive: true });
      const dest = path.join(orphanDir, path.basename(f.name));
      if (!fs.existsSync(dest)) fs.renameSync(src, dest);
      orphan++;
      continue;
    }

    dests.forEach((d, i) => {
      const dest = d + ext;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      if (fs.existsSync(dest)) return;
      if (i === 0) { fs.renameSync(src, dest); moved++; }
      // Одна картинка на несколько товаров: жёсткая ссылка вместо копии —
      // те же байты на диске, но файл виден в папке каждого товара.
      else { fs.linkSync(dests[0] + ext, dest); linked++; }
    });
  }

  // После переноса от структуры Cloudinary остаются пустые каталоги — убираем,
  // иначе в Finder рядом с понятными папками висят «matkasym-tz», «samples» и т.п.
  let removed = 0;
  (function prune(dir, rel) {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const r = rel ? `${rel}/${d.name}` : d.name;
      if (SKIP.has(r)) continue;
      const full = path.join(dir, d.name);
      prune(full, r);
      if (!fs.readdirSync(full).length) { fs.rmdirSync(full); removed++; }
    }
  })(OUT, '');

  console.log(`\nПеремещено: ${moved} | ссылок на общие фото: ${linked} | без товара: ${orphan} | удалено пустых папок: ${removed}`);
  console.log('Папка:', OUT);
}

main().catch(e => { console.error('ОШИБКА:', e.message); process.exit(1); });
