/**
 * Индекс чертежей ДУ с сервера отдела разработки.
 *
 * Каждое серийное изделие разрабатывалось у нас, и у его чертежа есть код ДУNNNN —
 * это единственный идентификатор, общий для всех баз 1С (Make-in, Matkasym, Q-top).
 * На нём и держится артикул товара: MKS-ДУ0014-GRY.
 *
 * Скрипт обходит `03 Серийное производство (ДУ)` и складывает пары «код → изделие»
 * в server/data/du-index.json, чтобы остальные скрипты работали без смонтированного диска.
 *
 *   node scripts/scan-du-index.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = '/Volumes/Отдел Разработки/03 Серийное производство (ДУ)';
const OUT  = path.join(__dirname, '..', 'data', 'du-index.json');

// «ДУ 0014 Сушилка COMFORT (3 мм)», «ДУ0119_Стул_для_походов», «ДУ 0027-01 Корзина …»
const FOLDER_RE = /^ДУ[\s_]*0*(\d{1,4})(-\d{2})?[\s_]+(.+)$/i;

function walk(dir, depth, out) {
  if (depth > 3) return out;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const full = path.join(dir, e.name);
    const m = e.name.match(FOLDER_RE);
    if (m) {
      out.push({
        code:    m[1].padStart(4, '0') + (m[2] || ''),
        title:   m[3].trim().replace(/\s+/g, ' '),
        section: path.relative(ROOT, full).split(path.sep)[0],
        // Архивные чертежи — снятые с производства версии, артикул с них не берём
        archive: /архив/i.test(full),
      });
    }
    walk(full, depth + 1, out);
  }
  return out;
}

if (!fs.existsSync(ROOT)) {
  console.error(`Не смонтирован диск отдела разработки: ${ROOT}`);
  process.exit(1);
}

const index = walk(ROOT, 0, []).sort((a, b) => a.code.localeCompare(b.code));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(index, null, 2) + '\n');

const live = index.filter(d => !d.archive);
console.log(`Чертежей: ${index.length} (в работе ${live.length}, в архиве ${index.length - live.length})`);

// Один код на два разных изделия — значит в номенклатуре он больше не уникален,
// и артикул по нему собирать нельзя. Такие случаи чинятся на сервере, а не тут.
const byCode = {};
live.forEach(d => { (byCode[d.code] = byCode[d.code] || []).push(d); });
const clashes = Object.entries(byCode).filter(([, arr]) =>
  new Set(arr.map(d => d.title.toLowerCase())).size > 1);
if (clashes.length) {
  console.log(`\n⚠  Один код — разные изделия (${clashes.length}):`);
  clashes.forEach(([code, arr]) => {
    console.log(`   ДУ${code}`);
    arr.forEach(d => console.log(`      ${d.title}   << ${d.section}`));
  });
}
console.log(`\n→ ${OUT}`);
