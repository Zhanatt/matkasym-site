// Выгрузка всех оригиналов из Cloudinary в локальную папку.
//
// Зачем: фотографии товаров существуют в единственном экземпляре — в чужом
// облаке. Когда аккаунт заблокировали за превышение лимита, скачать их было
// нельзя вообще: CDN и Admin API одинаково отвечали 401 «disabled customer».
//
// Скрипт возобновляемый: уже скачанные файлы пропускаются, так что при обрыве
// достаточно запустить его снова. Скачиваются ОРИГИНАЛЫ, без трансформаций —
// иначе бэкап окажется хуже исходника.
//
//   node scripts/backup-cloudinary.js [папка]
//
// По умолчанию — ~/matkasym-photos-backup
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const os = require('os');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const OUT = process.argv[2] || path.join(os.homedir(), 'matkasym-photos-backup');

const mb = (n) => (n / 1024 / 1024).toFixed(1);

// Admin API отдаёт ресурсы страницами по 500; на Small PAYG лимит вызовов 2000
// за цикл, поэтому берём максимальный размер страницы, а не мелкими порциями.
async function listAll() {
  const out = [];
  let cursor;
  do {
    const r = await cloudinary.api.resources({
      type: 'upload', resource_type: 'image', max_results: 500, next_cursor: cursor,
    });
    out.push(...r.resources);
    cursor = r.next_cursor;
    process.stdout.write(`\rСписок ресурсов: ${out.length}`);
  } while (cursor);
  console.log('');
  return out;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  console.log('Папка выгрузки:', OUT, '\n');

  const resources = await listAll();
  const total = resources.reduce((s, r) => s + (r.bytes || 0), 0);
  console.log(`Найдено ${resources.length} файлов, ${mb(total)} МБ\n`);

  let done = 0, skipped = 0, failed = 0, bytes = 0;
  const manifest = [];

  for (const r of resources) {
    // public_id может содержать «/» — сохраняем структуру папок Cloudinary
    const rel  = `${r.public_id}.${r.format}`;
    const dest = path.join(OUT, rel);
    manifest.push({ public_id: r.public_id, format: r.format, bytes: r.bytes, url: r.secure_url, file: rel });

    if (fs.existsSync(dest) && fs.statSync(dest).size === r.bytes) { skipped++; continue; }

    try {
      const resp = await fetch(r.secure_url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const buf = Buffer.from(await resp.arrayBuffer());
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, buf);
      done++; bytes += buf.length;
    } catch (e) {
      failed++;
      console.log(`\n  ✗ ${r.public_id}: ${e.message}`);
    }
    if ((done + skipped) % 25 === 0) {
      process.stdout.write(`\rСкачано ${done} | пропущено ${skipped} | ошибок ${failed} | ${mb(bytes)} МБ`);
    }
  }

  fs.writeFileSync(path.join(OUT, '_manifest.json'), JSON.stringify(manifest, null, 1));
  console.log(`\n\nГотово. Скачано ${done}, пропущено ${skipped}, ошибок ${failed}. Объём: ${mb(bytes)} МБ`);
  console.log('Карта файлов:', path.join(OUT, '_manifest.json'));
}

main().catch(e => { console.error('\nОШИБКА:', e.error?.message || e.message); process.exit(1); });
