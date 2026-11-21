// Пробные PDF для «Правок сайта»: если дизайнер поменял вёрстку каталога, воркфлоу
// .github/workflows/site-change.yml собирает затронутые каталоги кодом из ветки правки
// и кладёт их отдельно от боевых (Cloudinary raw matkasym/site-change-previews/<id>/).
// Боевой реестр каталогов (lib/catalogFiles.js) не трогается.
//
//   node scripts/catalog-preview.js --detect <base>   какие каталоги затронуты (JSON в stdout)
//   node scripts/catalog-preview.js --build <id> <base>  собрать и залить, JSON [{title,url}|{title,error}]
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const MAX = 3;   // больше трёх каталогов за раз не собираем — долго и дорого по фото

// script → set slug (как SETS в lib/catalogFiles.js; модуль не берём, чтобы --detect не тянул mongoose)
const SET_BY_SCRIPT = {
  'uzak-koldon': ['uzak-koldon', 'UZAK KOLDON'], 'mazza-seyil': ['mazza-seyil', 'MAZZA SEYIL'],
  'onoy-sakta': ['onoi-sakta', 'ONOY SAKTA'], '0-tastandy': ['0-tashtandy', '0-TASTANDY'],
  'bilim-kelechek': ['bilim-kelechek', 'BILIM KELECHEK'], 'bekem-fasad': ['bekem-fasad', 'BEKEM FASAD'],
  'kooz-koopsuzduk': ['kooz-koopsuzduk', 'KOOZ KOOPSUZDUK'], 'bekem-tosmo': ['bekem-tosmo', 'BEKEM TOSMO'],
};

function detect(base) {
  const files = execFileSync('git', ['diff', '--name-only', base, 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  const jobs = new Map();
  const set = script => { const [slug, title] = SET_BY_SCRIPT[script]; jobs.set(`set:${slug}`, { kind: 'set', script, name: slug, title: `Каталог ${title}` }); };
  const brand = (b, title) => jobs.set(`brand:${b}`, { kind: 'brand', brand: b, name: b, title: `Каталог ${title} (розница)` });
  for (const f of files) {
    const m = f.match(/^server\/scripts\/build-(.+)-catalog\.js$/);
    if (m && SET_BY_SCRIPT[m[1]]) set(m[1]);
    else if (/^server\/lib\/catalog(Layout|Fonts)\.js$/.test(f)) set('0-tastandy');   // общая вёрстка сетов — образец
    else if (/^(client\/src\/pages\/admin\/(catalogPrint|brandPdfGroups)\.js|server\/scripts\/build-generated-catalog\.js)$/.test(f)) brand('matkasym-home', 'MATKASYM HOME');
    else if (f === 'client/src/pages/admin/kyzmatPrint.js') brand('matkasym-kyzmat', 'MATKASYM KYZMAT');
  }
  return [...jobs.values()].slice(0, MAX);
}

async function build(id, base) {
  const jobs = detect(base);
  if (!jobs.length) return [];
  const cloudinary = require('cloudinary').v2;
  cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-preview-'));
  const res = [];
  for (const j of jobs) {
    try {
      const out = path.join(work, j.name);
      let pdf;
      if (j.kind === 'set') {
        execFileSync(process.execPath, [path.join(__dirname, `build-${j.script}-catalog.js`), out], { stdio: ['ignore', 2, 2], timeout: 900000 });
        pdf = path.join(out, fs.readdirSync(out).find(f => f.endsWith('.pdf')) || '');
      } else {
        execFileSync(process.execPath, [path.join(__dirname, 'build-generated-catalog.js'), j.brand, 'price', out], { stdio: ['ignore', 2, 2], timeout: 1800000 });
        pdf = path.join(out, 'catalog.pdf');
      }
      if (!fs.existsSync(pdf) || !pdf.endsWith('.pdf')) throw new Error('PDF не создан');
      const up = await cloudinary.uploader.upload(pdf, {
        resource_type: 'raw', public_id: `matkasym/site-change-previews/${id}/${j.name}.pdf`, overwrite: true, invalidate: true, timeout: 300000,
      });
      res.push({ title: j.title, url: up.secure_url });
    } catch (e) {
      res.push({ title: j.title, error: String(e.message || e).slice(0, 300) });
    }
  }
  return res;
}

(async () => {
  const [mode, a, b] = process.argv.slice(2);
  if (mode === '--detect') console.log(JSON.stringify(detect(a)));
  else if (mode === '--build') console.log(JSON.stringify(await build(a, b)));
  else { console.error('usage: --detect <base> | --build <id> <base>'); process.exit(2); }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
