/**
 * Единый артикул по чертежу: MKS-ДУNNNN-CLR.
 *
 * Одно и то же изделие лежит в трёх базах 1С под разными именами номенклатуры
 * («Сушилка для белья COMFORT (Черная)» в Make-in, «…COMFORT(Черная)» в Q-top),
 * и на сайте оно превращалось в две карточки с задвоенным остатком. Общего у них
 * ровно одно — код чертежа, по которому изделие разрабатывали. Он и становится
 * артикулом: одинаковый в каждой базе 1С и на сайте, к нему привязывается загрузка
 * остатков (Product.sku → skuMap выгрузки в lib/stockSync.js).
 *
 * Коды берём из server/data/du-index.json (см. scripts/scan-du-index.js).
 * Соответствие «карточка → чертёж» — таблица MAP ниже: сверял руками по названию
 * модели и цвету, автоматом тут ошибиться дороже.
 *
 *   node scripts/assign-du-skus.js           # показать, что изменится
 *   node scripts/assign-du-skus.js --apply   # записать (бэкап в scripts/backups)
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const Product = require('../models/Product');

const APPLY = process.argv.includes('--apply');
const DU = require('../data/du-index.json');

// Цвет в артикуле — три буквы, как уже заведено в 1С (MKS-ДУ0014-GRY)
const COLOR = { black: 'BLK', white: 'WHT', grey: 'GRY', pink: 'PNK' };

// Пока размечаем один сет: чертежи ДУ разложены по сетам, и проверять
// соответствие «карточка → чертёж» имеет смысл тоже посетно.
const SET = 'taza-kiym';

/**
 * Карточка (по текущему артикулу) → чертёж и цвет.
 * `expect` — кусок fullName: страховка от того, что артикул за это время переехал
 * на другой товар. Не совпало — позиция пропускается, а не переписывается вслепую.
 */
const MAP = [
  // ── Гладильные доски ──
  { sku: 'MKS-SD-I2',      du: '0011',    color: 'white', expect: 'ECO (Белая)' },
  { sku: 'MKS-TK-012',     du: '0011',    color: 'black', expect: 'ECO (Черная)' },
  { sku: 'MKS-SD-S1-STD',  du: '0010',    color: 'white', expect: 'ECO с удлинителем (Белая)' },
  { sku: 'MKS-TK-013',     du: '0010',    color: 'black', expect: 'ECO с удлинителем (Черная)' },
  { sku: 'MKS-SD-E2R',     du: '0012',    color: '',      expect: 'Гладильная доска SAKURA' },
  { sku: 'MKS-SD-S1-BLU2', du: '0013',    color: 'black', expect: 'SAKURA с удлинителем' },

  // ── Сушилки ──
  { sku: 'MKS-SD-202',     du: '0014',    color: 'grey',  expect: 'COMFORT(Серая)' },
  { sku: 'MKS-SD-201',     du: '0014',    color: 'black', expect: 'COMFORT (Черная)' },
  { sku: 'MKS-SD-101',     du: '0015',    color: 'white', expect: 'SAKURA' },
  { sku: 'MKS-SD-I1R-01',  du: '0015',    color: 'pink',  expect: 'SAKURA (розовая)' },
  { sku: 'MKS-TK-024',     du: '0127',    color: 'white', expect: 'Keremet+" (Белая)' },

  // ── Гардеробные вешалки ──
  { sku: 'MKS-SC-S1-GRN',  du: '0020',    color: 'white', expect: 'ENIGMA белый' },
  { sku: 'MKS-SC-S-STD',   du: '0020',    color: 'black', expect: 'ENIGMA черный' },
  { sku: 'MKS-SC-S1-ORG',  du: '0021',    color: 'white', expect: 'INFINITY белый' },
  { sku: 'MKS-SC-S1-RED',  du: '0021',    color: 'black', expect: 'INFINITY черный' },
  { sku: 'MKS-SC-S1-TIK',  du: '0022',    color: 'white', expect: 'FENIX белый' },
  { sku: 'MKS-SC-S1-BLU',  du: '0022',    color: 'black', expect: 'FENIX черный' },
  { sku: 'MKS-TK-010',     du: '0122',    color: 'white', expect: 'KERBEN белый' },
  { sku: 'MKS-TK-008',     du: '0122',    color: 'black', expect: 'KERBEN черный' },

  // ── Костюмные вешалки ──
  { sku: 'MKS-TK-016',     du: '0114',    color: 'white', expect: 'MURAS 1 (Белая)' },
  { sku: 'MKS-TK-017',     du: '0114',    color: 'black', expect: 'MURAS 1 (Черная)' },

  // ── Корзины ──
  { sku: 'MKS-SD-S2-STD',  du: '0027',    color: 'white', expect: 'WASHDAY' },
];

const duTitle = code => {
  const hits = DU.filter(d => d.code === code && !d.archive);
  return hits.length ? hits[0].title : null;
};

const buildSku = (du, color) => `MKS-ДУ${du}` + (color ? `-${COLOR[color]}` : '');

(async () => {
  await mongoose.connect(MONGO_URI);

  const planned = [];
  const skipped = [];

  for (const row of MAP) {
    const title = duTitle(row.du);
    if (!title) { skipped.push(`ДУ${row.du} нет в индексе чертежей — ${row.sku}`); continue; }
    if (row.color && !COLOR[row.color]) { skipped.push(`неизвестный цвет ${row.color} — ${row.sku}`); continue; }

    // Ищем в пределах сета: старые артикулы (MKS-SD-201 и такие же) успели
    // разойтись по разным товарам — та же парта в bilim-kelechek носит этот номер.
    const found = await Product.find({ sku: row.sku, set: SET }).select('name fullName sku color set').lean();
    if (found.length !== 1) {
      skipped.push(`${row.sku}: карточек с таким артикулом в сете ${SET} — ${found.length}, жду ровно одну`);
      continue;
    }
    const p = found[0];
    if (!String(p.fullName || p.name || '').includes(row.expect)) {
      skipped.push(`${row.sku}: ждали «${row.expect}», в базе «${p.fullName || p.name}» — пропуск`);
      continue;
    }
    const newSku = buildSku(row.du, row.color);
    const clash = await Product.findOne({ sku: newSku, _id: { $ne: p._id } }).select('fullName').lean();
    if (clash) {
      skipped.push(`${newSku} уже занят карточкой «${clash.fullName}» — пропуск`);
      continue;
    }
    planned.push({
      id: p._id, from: p.sku, to: newSku,
      // Цвет проставляем заодно: он часть артикула, и в карточках он местами пуст
      color: row.color || p.color || '',
      name: p.fullName || p.name, drawing: `ДУ${row.du} ${title}`,
    });
  }

  console.log(`Готово к записи: ${planned.length} из ${MAP.length}\n`);
  planned.forEach(t => console.log(
    `  ${t.from.padEnd(20)} → ${t.to.padEnd(18)} ${t.name.padEnd(46).slice(0, 46)}  (${t.drawing})`));
  if (skipped.length) {
    console.log(`\nПропущено (${skipped.length}):`);
    skipped.forEach(s => console.log(`  ⚠  ${s}`));
  }

  if (!APPLY) {
    console.log('\nПредпросмотр. Для записи — с флагом --apply');
    await mongoose.disconnect();
    return;
  }

  const dir = path.join(__dirname, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const backup = path.join(dir, `du-skus-${Date.now()}.json`);
  fs.writeFileSync(backup, JSON.stringify(planned, null, 2));
  console.log(`\nБэкап: ${backup}`);

  for (const t of planned) {
    await Product.updateOne({ _id: t.id }, { $set: { sku: t.to, color: t.color } });
    console.log(`✓  ${t.name}: ${t.from} → ${t.to}`);
  }

  await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
