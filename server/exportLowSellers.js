/**
 * exportLowSellers.js
 * Товары с наименьшими продажами → Word (.docx) на рабочий стол.
 * node exportLowSellers.js
 */

const mongoose = require('mongoose');
const fs       = require('fs');
const path     = require('path');
const {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, WidthType, AlignmentType,
  BorderStyle, ShadingType, TableLayoutType,
} = require('docx');

const MONGO_URI = 'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym?appName=M0';
const OUT_PATH  = path.join('/Users/zhanat/Desktop', 'low_sellers.docx');

const StockLog = require('./models/StockLog');
const Product  = require('./models/Product');

const BORDER = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
const CELL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

function cell(text, { bold = false, center = false, shade = false, width } = {}) {
  return new TableCell({
    borders: CELL_BORDERS,
    shading: shade ? { type: ShadingType.SOLID, color: 'F5F5F5' } : undefined,
    width: width ? { size: width, type: WidthType.DXA } : undefined,
    children: [new Paragraph({
      alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT,
      children: [new TextRun({ text: String(text ?? ''), bold, font: 'Arial', size: 18 })],
    })],
  });
}

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Подключено к MongoDB');

  const salesAgg = await StockLog.aggregate([
    { $match: { delta: { $lt: 0 }, createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } },
    { $group: { _id: '$productId', sold: { $sum: { $abs: '$delta' } } } },
  ]);

  const soldMap = {};
  salesAgg.forEach(r => { if (r._id) soldMap[r._id.toString()] = r.sold; });

  const products = await Product.find({}).lean();

  const withSales = products.map(p => ({
    ...p,
    sold: soldMap[p._id.toString()] || 0,
  }));

  withSales.sort((a, b) => a.sold - b.sold);

  const top = withSales.slice(0, 100);
  console.log(`Всего товаров: ${products.length}, выводим: ${top.length}`);

  const today  = new Date().toLocaleDateString('ru-RU');
  const from30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toLocaleDateString('ru-RU');

  // --- Header row ---
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      cell('№',        { bold: true, center: true, shade: true, width: 480 }),
      cell('Название', { bold: true, shade: true,                width: 3800 }),
      cell('SKU',      { bold: true, center: true, shade: true, width: 1200 }),
      cell('Сет',      { bold: true, center: true, shade: true, width: 1600 }),
      cell('Продано',  { bold: true, center: true, shade: true, width: 960 }),
      cell('Остаток',  { bold: true, center: true, shade: true, width: 960 }),
      cell('Цена',     { bold: true, center: true, shade: true, width: 1466 }),
    ],
  });

  // --- Data rows ---
  const dataRows = top.map((p, i) =>
    new TableRow({
      children: [
        cell(i + 1,                                   { center: true, width: 480 }),
        cell(p.fullName || p.name || '—',             {               width: 3800 }),
        cell(p.sku || '—',                            { center: true, width: 1200 }),
        cell(p.set || '—',                            { center: true, width: 1600 }),
        cell(p.sold,                                  { center: true, width: 960 }),
        cell(p.stock ?? '—',                          { center: true, width: 960 }),
        cell(p.price > 0 ? `${p.price.toLocaleString('ru')} сом` : '—', { center: true, width: 1466 }),
      ],
    })
  );

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 720, bottom: 720, left: 720, right: 720 },
        },
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
          children: [new TextRun({
            text: `Товары с наименьшими продажами (${from30} — ${today})`,
            bold: true, font: 'Arial', size: 28,
          })],
        }),
        new Paragraph({
          alignment: AlignmentType.LEFT,
          spacing: { after: 240 },
          children: [new TextRun({
            text: `Всего товаров в БД: ${products.length}, выведено: ${top.length} (продажи за 30 дней, сортировка по возрастанию)`,
            font: 'Arial', size: 18, color: '666666',
          })],
        }),
        new Table({
          width: { size: 10466, type: WidthType.DXA },
          layout: TableLayoutType.FIXED,
          columnWidths: [480, 3800, 1200, 1600, 960, 960, 1466],
          rows: [headerRow, ...dataRows],
        }),
      ],
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(OUT_PATH, buffer);
  console.log(`\nФайл сохранён: ${OUT_PATH}`);

  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
