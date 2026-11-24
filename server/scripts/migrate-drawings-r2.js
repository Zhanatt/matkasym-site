// Перенос чертежей из Cloudinary в R2 (Cloudinary отключён 24.11.2026 за неуплату).
// Файл берём из локального бэкапа ~/matkasym-photos-backup (по манифестам), иначе — по ссылке Cloudinary.
//
//   node scripts/migrate-drawings-r2.js            — показать, что будет перенесено
//   node scripts/migrate-drawings-r2.js --apply    — перенести и переписать ссылки (бэкап документов — рядом)
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const storage = require('../lib/storage');
const Drawing = require('../models/Drawing');

const APPLY = process.argv.includes('--apply');
const BK = path.join(process.env.HOME, 'matkasym-photos-backup');
const pid = u => { const a = String(u).split('/upload/')[1]; if (!a) return null; const p = a.split('/'); while (p.length > 1 && /[,=]/.test(p[0])) p.shift(); if (/^v\d+$/.test(p[0])) p.shift(); return decodeURIComponent(p.join('/')); };

// public_id → путь к файлу в бэкапе
const local = new Map();
(function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p);
    else if (f.name === '_manifest.json') for (const r of JSON.parse(fs.readFileSync(p))) {
      const k = r.public_id || pid(r.url); const file = path.join(dir, r.file);
      if (k && fs.existsSync(file)) { local.set(k, file); local.set(k.replace(/\.pdf$/i, ''), file); }
    }
  }
})(BK);

async function source(url, publicId) {
  const f = local.get(publicId) || local.get(publicId.replace(/\.pdf$/i, '')) || local.get(pid(url) || '');
  if (f) return { buf: fs.readFileSync(f), from: 'бэкап' };
  const r = await fetch(url);
  if (!r.ok) throw new Error(`нет в бэкапе, Cloudinary ответил ${r.status}`);
  return { buf: Buffer.from(await r.arrayBuffer()), from: 'Cloudinary' };
}
const keyOf = publicId => publicId.replace(/^matkasym\//, '');

(async () => {
  if (!storage.isConfigured()) { console.error('Нет R2_* в server/.env'); process.exit(1); }
  await mongoose.connect(MONGO_URI);
  const list = await Drawing.find({}).lean();
  const todo = list.filter(d => !storage.isOurUrl(d.url));
  console.log(`чертежей: ${list.length}, перенести: ${todo.length}`);
  if (APPLY) fs.writeFileSync(path.join(__dirname, `backup-drawings-${Date.now()}.json`), JSON.stringify(todo, null, 1));
  let ok = 0, bad = 0;
  for (const d of todo) {
    try {
      const items = [{ url: d.url, publicId: d.publicId, main: true }, ...(d.versions || []).map((v, i) => ({ ...v, i }))];
      const set = {};
      for (const it of items) {
        const { buf, from } = await source(it.url, it.publicId);
        const key = keyOf(it.publicId);
        console.log(`  ${d.title || d.fileName} ${it.main ? '' : `(версия ${it.i + 1}) `}← ${from}, ${(buf.length / 1024) | 0} КБ → ${key}`);
        if (!APPLY) continue;
        const url = await storage.put(key, buf, 'application/pdf', { noCache: !!it.main, fileName: it.fileName || d.fileName });
        if (it.main) { set.url = url; set.publicId = key; } else { set[`versions.${it.i}.url`] = url; set[`versions.${it.i}.publicId`] = key; }
      }
      if (APPLY) await Drawing.collection.updateOne({ _id: d._id }, { $set: set });
      ok++;
    } catch (e) { bad++; console.log(`  ✗ ${d.title || d.fileName}: ${e.message}`); }
  }
  console.log(`${APPLY ? 'перенесено' : 'готово к переносу'}: ${ok}, ошибок: ${bad}`);
  process.exit(0);
})();
