/**
 * Обновление остатков в выгрузке для Ммаркет.
 *
 * Файл для площадки собирается один раз, а остатки живут своей жизнью: пока карточки
 * проходят модерацию, половина позиций успевает разойтись. Пересобирать книгу целиком
 * ради одной колонки дорого — здесь она правится на месте.
 *
 * Что делает: в каждом листе находит колонку артикула («Уникальный идентификатор
 * товара») и колонку склада (заголовок начинается с «Город» — так Ммаркет называет
 * колонку остатка адресом склада), тянет Product.stock по артикулу и переписывает
 * число. Остальные колонки, ширины, заливки и формулы не трогаются: книга читается
 * и пишется через exceljs, а не пересобирается заново.
 *
 * Заодно, ничего не меняя, предупреждает о расхождении цены: в файле должна лежать
 * розница из базы + 10% с округлением вверх (договорённость по Ммаркет). Если в базе
 * цену подвинули — это видно в отчёте, но правится руками: наценку могли поменять.
 *
 *   node scripts/mmarket-update-stock.js ~/Desktop/Ммаркет_JenilAshkana_2026.09.09.xlsx
 *   node scripts/mmarket-update-stock.js <файл> --apply   # записать (копия в scripts/backups)
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const MONGO_URI = require('../lib/atlas');
const Product = require('../models/Product');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const FILE = args.find((a) => !a.startsWith('--'));

// Наценка площадки: розница × 1.1, вверх до целого сома. Целочисленно —
// на float 1680 * 1.1 даёт 1848.0000000000002 и цена уезжает на сом вверх.
const mmarketPrice = (retail) => Math.ceil((Math.round(retail * 100) * 11) / 1000);

const SKU_HEADER = 'Уникальный идентификатор товара';
const isStockHeader = (h) => /^Город/i.test(String(h || '').trim());

async function main() {
  if (!FILE) {
    console.error('\n❌ Не указан файл выгрузки.\n   node scripts/mmarket-update-stock.js <файл.xlsx> [--apply]\n');
    process.exit(1);
  }
  const file = path.resolve(FILE.replace(/^~/, process.env.HOME));
  if (!fs.existsSync(file)) {
    console.error(`\n❌ Файл не найден: ${file}\n`);
    process.exit(1);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);

  await mongoose.connect(MONGO_URI);

  const changes = [];
  const missing = [];   // артикул из файла, которого нет в базе
  const zeroed = [];    // остаток стал нулём — карточка уедет из продажи
  const priceDrift = []; // цена в базе разошлась с ценой в файле
  let checked = 0;

  for (const ws of wb.worksheets) {
    const head = ws.getRow(1);
    let skuCol = null;
    const stockCols = [];
    head.eachCell((cell, col) => {
      const title = String(cell.value || '').trim();
      if (title.startsWith(SKU_HEADER)) skuCol = col;
      if (isStockHeader(title)) stockCols.push({ col, title });
    });

    if (!skuCol || !stockCols.length) {
      // `metadata` — служебный лист шаблона со словарями, товаров там нет и быть не должно
      if (ws.name !== 'metadata') {
        console.log(`⚠️  «${ws.name}»: не нашёл ${!skuCol ? 'колонку артикула' : 'колонку склада'} — лист пропущен`);
      }
      continue;
    }
    if (stockCols.length > 1) {
      // Несколько складов — какой остаток куда, скрипт решить не может.
      console.error(
        `\n❌ «${ws.name}»: складских колонок больше одной ` +
        `(${stockCols.map((c) => c.title).join(' | ')}).\n` +
        '   Разложить остаток по складам автоматически нельзя — правьте вручную.\n'
      );
      process.exit(1);
    }
    const stockCol = stockCols[0].col;

    // Цена нужна только для предупреждения о расхождении
    let priceCol = null;
    head.eachCell((cell, col) => {
      if (String(cell.value || '').trim().startsWith('Цена товара')) priceCol = col;
    });

    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const sku = String(row.getCell(skuCol).value || '').trim();
      if (!sku) continue;
      checked++;

      const product = await Product.findOne({ sku }).select('sku name stock price').lean();
      if (!product) { missing.push({ sheet: ws.name, sku }); continue; }

      const was = Number(row.getCell(stockCol).value) || 0;
      const now = Number(product.stock) || 0;
      if (was !== now) {
        changes.push({ sheet: ws.name, sku, name: product.name, was, now });
        if (APPLY) row.getCell(stockCol).value = now;
      }
      if (now === 0) zeroed.push({ sku, name: product.name });

      if (priceCol) {
        const inFile = Number(row.getCell(priceCol).value) || 0;
        const should = mmarketPrice(Number(product.price) || 0);
        if (inFile && should && inFile !== should) {
          priceDrift.push({ sku, name: product.name, inFile, should, retail: product.price });
        }
      }
    }
  }

  await mongoose.disconnect();

  console.log(`\nПроверено позиций: ${checked}`);

  if (!changes.length) console.log('Остатки в файле совпадают с базой — менять нечего.');
  else {
    console.log(`\nОстатки (${changes.length}):`);
    for (const c of changes) {
      const mark = c.now === 0 ? '  ← обнулился' : '';
      console.log(`  ${c.sku.padEnd(16)} ${String(c.was).padStart(4)} → ${String(c.now).padStart(4)}   ${c.name}${mark}`);
    }
  }

  if (zeroed.length) {
    console.log(`\n⚠️  Нулевой остаток, ${zeroed.length} шт. — на площадке уйдут из продажи:`);
    for (const z of zeroed) console.log(`  ${z.sku.padEnd(16)} ${z.name}`);
  }

  if (missing.length) {
    console.log(`\n⚠️  Нет в базе, ${missing.length} шт. — строки оставлены как есть:`);
    for (const m of missing) console.log(`  ${m.sku.padEnd(16)} лист «${m.sheet}»`);
  }

  if (priceDrift.length) {
    console.log(`\n⚠️  Цена в базе разошлась с файлом, ${priceDrift.length} шт. (не меняю — решайте сами):`);
    for (const p of priceDrift) {
      console.log(`  ${p.sku.padEnd(16)} в файле ${p.inFile}, розница ${p.retail} → должно быть ${p.should}   ${p.name}`);
    }
  }

  if (!APPLY) {
    console.log('\nЭто предпросмотр. Записать: тот же вызов с --apply\n');
    return;
  }
  if (!changes.length) { console.log(''); return; }

  const backupDir = path.join(__dirname, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const backup = path.join(backupDir, `${path.basename(file, '.xlsx')}-${stamp}.xlsx`);
  fs.copyFileSync(file, backup);

  await wb.xlsx.writeFile(file);
  console.log(`\n✅ Записано в ${file}`);
  console.log(`   копия до правки: ${backup}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
