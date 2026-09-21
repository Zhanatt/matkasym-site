// Характеристики шкафов и тумб AICHUROK (поставщик Оудэбао, 欧德堡) из прайса.
//
// Карточки завели по названиям, а характеристики так и остались пустыми: в
// карточке не видно ни материала, ни веса, ни объёма коробки — а это ровно то,
// что спрашивают при заказе и без чего не посчитать доставку.
//
// Источник — «Оудэбао_прайс_RU.xlsx»: в нём на каждый артикул есть материал,
// вес брутто и объём упаковки. Ничего не выдумываем: чего нет в прайсе, того
// не будет и в карточке.
//
// Запуск (из server/):
//   node scripts/import-oudebao-specs.js
//   node scripts/import-oudebao-specs.js --apply
//   node scripts/import-oudebao-specs.js --file="/путь/к/прайсу.xlsx" --apply
//
// Без --apply только печатает, что изменится. Перед записью затронутые товары
// выгружаются в scripts/backup-oudebao-specs-<дата>.json.
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const XLSX = require('xlsx');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const Product = require('../models/Product');

const args  = process.argv.slice(2);
const APPLY = args.includes('--apply');
const FILE  = (args.find(a => a.startsWith('--file=')) || '').slice(7)
  || path.join(os.homedir(), 'Desktop', 'упаковки шкафов', 'Оудэбао_прайс_RU.xlsx');

// Отделка зашита в хвост артикула пиньинем: H = 灰 серый, K = 咖啡 кофейный,
// ZY = 转印 термопечать. Расшифровка уже стоит в описании карточек — здесь она
// нужна отдельной характеристикой, чтобы по ней можно было искать и сравнивать.
const FINISH = { K: 'Кофейный / белый', H: 'Серый / белый', ZY: 'Трансферная печать' };
const finishOf = (code) => {
  const m = String(code).match(/(ZY|[KH])$/);
  return m ? FINISH[m[1]] : '';
};

// Сколько дверей или ящиков — написано в описании прайса словами:
// «Одиночный 3-дверный шкаф», «Шкаф с черными ручками, 4 ящика»,
// «Инструментальный шкаф с 2 средн. ящиками».
const countsOf = (descr) => {
  const out = [];
  const doors = String(descr).match(/(\d+)\s*-?\s*дверн/i);
  if (doors) out.push({ key: 'Кол-во дверей', value: doors[1] });
  const boxes = String(descr).match(/(\d+)\s*(?:средн\.?\s*)?ящик/i);
  if (boxes) out.push({ key: 'Кол-во ящиков', value: boxes[1] });
  return out;
};

function rowsFromPrice(file) {
  const wb = XLSX.readFile(file, { cellText: true });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false, defval: '' });
  const out = new Map();
  rows.forEach(r => {
    const code = String(r[1] || '').trim();
    // Строки-заголовки и итоги артикула не имеют, а размеры у товара есть всегда.
    if (!code || !/^W\d/i.test(code) || !String(r[3] || '').trim()) return;
    out.set(code.toUpperCase(), {
      code,
      descr:    String(r[2] || '').trim(),
      size:     String(r[3] || '').trim(),
      material: String(r[4] || '').trim(),
      volume:   String(r[5] || '').trim(),
      weight:   String(r[7] || '').trim(),
    });
  });
  return out;
}

function specsFor(row) {
  const out = [];
  // «Высококач. холоднокатаная сталь» — оценка продавца пополам с фактом.
  // В характеристику идёт факт: марка проката.
  if (/холоднокатан/i.test(row.material)) out.push({ key: 'Материал', value: 'Холоднокатаная сталь' });
  else if (row.material)                  out.push({ key: 'Материал', value: row.material });

  const finish = finishOf(row.code);
  if (finish) out.push({ key: 'Отделка', value: finish });

  countsOf(row.descr).forEach(s => out.push(s));

  // Вес в прайсе брутто, с упаковкой — так и подписываем: «вес 48 кг» о самом
  // шкафе было бы неправдой, а для расчёта доставки нужен именно брутто.
  if (row.weight) out.push({ key: 'Вес брутто', value: `${row.weight} кг` });
  if (row.volume) out.push({ key: 'Объём упаковки', value: `${row.volume} м³` });
  return out;
}

(async () => {
  if (!fs.existsSync(FILE)) {
    console.error(`Не нашёл прайс: ${FILE}\nУкажите путь: --file="..."`);
    process.exit(1);
  }
  const price = rowsFromPrice(FILE);
  console.log(`Прайс: ${path.basename(FILE)} — ${price.size} артикулов\n`);

  await mongoose.connect(MONGO_URI);
  const products = await Product.find({ 'supplier.company': /Оудэбао|欧德堡/ })
    .select('sku fullName name specs supplier dimensions').lean();

  const planned = [];
  const missed  = [];
  for (const p of products) {
    // Матчим по артикулу поставщика; у части карточек он пуст (тумбы с
    // временными SKU), тогда пробуем код из нашего артикула MKS-<код>.
    const code = String(p.supplier?.sku || '').trim().toUpperCase()
      || String(p.sku || '').replace(/^MKS-/i, '').toUpperCase();
    const row = price.get(code);
    if (!row) { missed.push(p); continue; }

    const have = new Map((p.specs || []).map(s => [String(s.key).trim().toLowerCase(), s]));
    // Заполняем только пустое: руками вписанное значение всегда точнее прайса.
    const add = specsFor(row).filter(s => {
      const cur = have.get(s.key.trim().toLowerCase());
      return !cur || !String(cur.value || '').trim();
    });
    if (!add.length) continue;

    const specs = [...(p.specs || []).filter(s => String(s.value || '').trim()), ...add];
    planned.push({ p, code, add, specs });
  }

  planned.forEach(({ p, code, add }) => {
    console.log(`${(p.sku || '—').padEnd(14)} ${code.padEnd(8)} ${(p.fullName || p.name || '').slice(0, 42).padEnd(42)} + ${add.map(s => `${s.key}: ${s.value}`).join(' · ')}`);
  });
  console.log(`\nИтого: ${planned.length} карточек получат характеристики, ${products.length - planned.length} без изменений`);
  if (missed.length) {
    console.log(`\nНет в прайсе (${missed.length}) — характеристики не трогаем:`);
    missed.forEach(p => console.log(`  ${(p.sku || '—').padEnd(14)} ${(p.fullName || p.name || '')}`));
  }

  if (!APPLY) {
    console.log('\nЭто предпросмотр. Запустите с --apply, чтобы записать.');
    await mongoose.disconnect();
    return;
  }

  const stamp  = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const backup = path.join(__dirname, `backup-oudebao-specs-${stamp}.json`);
  fs.writeFileSync(backup, JSON.stringify(planned.map(({ p }) => ({ _id: p._id, sku: p.sku, specs: p.specs || [] })), null, 1));
  console.log(`\nБэкап прежних характеристик: ${path.basename(backup)}`);

  let done = 0;
  for (const { p, specs } of planned) {
    await Product.updateOne({ _id: p._id }, { $set: { specs } });
    done++;
  }
  console.log(`Записано: ${done}`);
  await mongoose.disconnect();
})().catch(e => { console.error('Ошибка:', e.message); process.exit(1); });
