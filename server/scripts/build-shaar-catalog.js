// Общий каталог MATKASYM SHAAR (02.11.2026): склейка готовых PDF сетов в порядке списка сетов, без замороженного
// JASHYL SHAAR. Спереди фирменная обложка и общее содержание, в конце фирменная последняя страница.
// Страница «Как заказать» у сетов убрана, кроме ONOY SAKTA и BILIM KELECHEK: там на ней ещё и товар.
// Внутри сета нумерация своя (на неё ссылаются содержания сетов), поэтому поверх печатается сквозной «лист».
//
//   node scripts/build-shaar-catalog.js <папка каталогов> <рабочая папка>
//
// Сначала пересобрать изменившиеся сеты, этот скрипт берёт уже готовые файлы.
// Результат: полная версия (для печати) и лёгкая (фото сжаты Ghostscript, для телефона и кнопки «PDF»).
// --upload заливает лёгкую в Cloudinary raw matkasym/catalogs/shaar.pdf.
// Ссылки и закладки ставятся ПОСЛЕ сжатия, чтобы Ghostscript их не потерял.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { PDFDocument, PDFName, PDFHexString, PDFNumber } = require('pdf-lib');
const { FONT_CSS, LIGHT_META } = require('../lib/catalogFonts');
const { compressPdf } = require('../lib/catalogLayout');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const { shaarSetOrder } = require('../lib/catalogFiles');

const [SRC, OUT] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const LIGHT_DPI = 130;
if (require.main === module) {
  if (!SRC || !OUT) { console.error('Укажите папку каталогов и рабочую папку'); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
}
const CV = 'https://res.cloudinary.com/dnbg21ef8/image/upload/f_jpg,q_auto:good,w_1654';
const TITLE = `${CV}/v1780894225/matkasym/covers/title-page-shaar.png`;
const END = `${CV}/v1780894228/matkasym/covers/end-page-shaar.png`;
const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PHONES = ['+996 501 111 726', '+996 504 200 067', '+996 703 939 070'];

// keepLast — последняя страница сета содержит товар, а не только контакты
const SETS = [
  { key: 'uzak-koldon', name: 'UZAK KOLDON', sub: 'Шкафы и тумбы', file: 'узак колдон/Каталог UZAK KOLDON 2026.pdf' },
  { key: 'mazza-seyil', name: 'MAZZA SEYIL', sub: 'Скамейки, освещение, велопарковки', file: 'мазза сейил/Каталог MAZZA SEYIL.pdf' },
  { key: 'onoi-sakta', name: 'ONOY SAKTA', sub: 'Стеллажи', file: 'оной сакта/Каталог ONOY SAKTA.pdf', keepLast: true },
  { key: '0-tashtandy', name: '0-TASTANDY', sub: 'Урны, контейнеры, баки', file: '0 таштанды/Каталог 0-TASTANDY.pdf' },
  { key: 'bilim-kelechek', name: 'BILIM KELECHEK', sub: 'Мебель для школ и учебных классов', file: 'билим келечек/Каталог BILIM KELECHEK 2026.pdf', keepLast: true },
  { key: 'bekem-fasad', name: 'BEKEM FASAD', sub: 'Корзины, кронштейны, решётки', file: 'бекем фасад/Каталог BEKEM FASAD.pdf' },
  { key: 'kooz-koopsuzduk', name: 'KOOZ KOOPSUZDUK', sub: 'Электрощиты и шкафы', file: 'кооз коопсуздук/Каталог KOOZ KOOPSUZDUK.pdf' },
  { key: 'bekem-tosmo', name: 'BEKEM TOSMO', sub: 'Ограждения и перегородки', file: 'бекем тосмо/Каталог BEKEM TOSMO.pdf' },
];

// Геометрия содержания в мм: по ней же ставятся ссылки на карточках
const G = { x: 16, y: 58, w: 85, h: 50, gx: 8, gy: 6 };
const MM = 72 / 25.4;
const chrome = (html, pdf) => execFileSync(CHROME, [...(process.env.CI ? ['--no-sandbox'] : []),'--headless=new', '--disable-gpu', '--no-pdf-header-footer',
  '--virtual-time-budget=60000', `--print-to-pdf=${pdf}`, `file://${html}`], { stdio: 'ignore', timeout: 180000 });
const css = `${FONT_CSS}
@page { size:A4; margin:0; } * { box-sizing:border-box; margin:0; padding:0; }
html, body { color-scheme:only light; font-family:Roboto, Helvetica, Arial, sans-serif; color:#000; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.page { width:210mm; height:297mm; position:relative; overflow:hidden; break-after:page; }
.page:last-child { break-after:auto; }`;

module.exports = { SETS };
if (require.main !== module) return;

(async () => {
  // Порядок — из списка сетов на сайте: переставили там, каталог собирается в новом порядке
  await mongoose.connect(MONGO_URI);
  const order = await shaarSetOrder();
  await mongoose.disconnect();
  const ordered = order.map(k => SETS.find(s => s.key === k)).filter(Boolean);
  if (!ordered.length) throw new Error('Пустой список сетов SHAAR');

  const docs = [];
  let sheet = 3; // 1 — обложка, 2 — содержание
  for (const s of ordered) {
    const bytes = fs.readFileSync(path.join(SRC, s.file));
    const doc = await PDFDocument.load(bytes);
    const take = doc.getPageCount() - (s.keepLast ? 0 : 1);
    docs.push({ ...s, doc, take, first: sheet });
    sheet += take;
    const thumb = path.join(OUT, `thumb-${docs.length}`);
    execFileSync('pdftoppm', ['-r', '70', '-jpeg', '-singlefile', '-f', '1', '-l', '1', path.join(SRC, s.file), thumb]);
    docs[docs.length - 1].thumb = fs.readFileSync(thumb + '.jpg').toString('base64');
  }
  const total = sheet; // последний лист — фирменная концовка

  const card = (d, i) => `<a class="c" style="left:${G.x + (i % 2) * (G.w + G.gx)}mm;top:${G.y + Math.floor(i / 2) * (G.h + G.gy)}mm">
    <img src="data:image/jpeg;base64,${d.thumb}" alt="">
    <div><span class="n">${String(i + 1).padStart(2, '0')}</span><b>${d.name}</b><p>${d.sub}</p><span class="l">лист ${d.first}</span></div></a>`;
  const frontHtml = `<!doctype html><html lang="ru"><head><meta charset="utf-8">${LIGHT_META}<title>Каталог MATKASYM SHAAR</title><style>${css}
.full img { width:100%; height:100%; object-fit:cover; display:block; }
.h { position:absolute; left:16mm; right:16mm; top:18mm; padding-bottom:6mm; border-bottom:1px solid #7d96a0; display:grid; grid-template-columns:1fr 1fr; gap:10mm; align-items:end; }
.h h1 { font-family:Montserrat, Helvetica, sans-serif; font-weight:700; font-size:24pt; line-height:1.1; }
.h p { color:#4d4d4d; font-size:9.5pt; line-height:1.5; }
.c { position:absolute; width:${G.w}mm; height:${G.h}mm; display:grid; grid-template-columns:35.4mm 1fr; gap:5mm; }
.c img { width:35.4mm; height:50mm; object-fit:cover; display:block; border:.2mm solid #dfe5e7; }
.c div { display:flex; flex-direction:column; min-width:0; border-top:1px solid #7d96a0; padding-top:2.5mm; }
.c .n { font-family:Montserrat, Helvetica, sans-serif; font-weight:600; font-size:10pt; color:#e10523; }
.c b { font-family:Montserrat, Helvetica, sans-serif; font-weight:600; font-size:11pt; line-height:1.2; margin-top:1.5mm; }
.c p { color:#4d4d4d; font-size:8.4pt; line-height:1.35; margin-top:1.5mm; }
.c .l { margin-top:auto; color:#7d96a0; font-size:9pt; }
.ph-cover { position:absolute; left:91mm; top:278.5mm; width:50mm; height:16.5mm; background:#bf0723; }
.ph { position:absolute; left:95.1mm; top:279.6mm; color:#fff; font-family:Montserrat, Helvetica, sans-serif; font-weight:600; font-size:9.6pt; line-height:4.8mm; white-space:nowrap; }
.foot { position:absolute; left:16mm; right:16mm; bottom:10mm; color:#7d96a0; font-size:7.4pt; }
</style></head><body>
<section class="page full"><img src="${TITLE}" alt=""></section>
<section class="page">
  <div class="h"><h1>Содержание</h1><p>Восемь направлений MATKASYM SHAAR: товары для улиц, дворов, школ, офисов и строек.</p></div>
  ${docs.map(card).join('')}
  <div class="foot">Сквозной номер листа стоит внизу по центру. Справа внизу — страница внутри раздела.</div>
</section>
<section class="page full"><img src="${END}" alt="">
  <div class="ph-cover"></div><div class="ph">${PHONES.join('<br>')}</div></section></body></html>`;
  const frontFile = path.join(OUT, 'front.html'), frontPdf = path.join(OUT, 'front.pdf');
  fs.writeFileSync(frontFile, frontHtml);
  chrome(frontFile, frontPdf);

  // Сквозные номера: прозрачные страницы из Chrome, чтобы шрифт был тот же и остался TrueType (не Type 3)
  const stamps = [];
  docs.forEach(d => { for (let i = 1; i < d.take; i++) stamps.push(d.first + i); });
  const stampFile = path.join(OUT, 'stamps.html'), stampPdf = path.join(OUT, 'stamps.pdf');
  fs.writeFileSync(stampFile, `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>${css}
.s { position:absolute; left:0; right:0; bottom:10mm; text-align:center; font-size:6.8pt; letter-spacing:.12em; color:#7d96a0; }
html, body { background:transparent; }</style></head><body>${stamps.map(n => `<section class="page"><div class="s">ЛИСТ ${n}</div></section>`).join('')}</body></html>`);
  chrome(stampFile, stampPdf);

  const out = await PDFDocument.create();
  out.setTitle('Каталог MATKASYM SHAAR');
  const front = await PDFDocument.load(fs.readFileSync(frontPdf));
  const stampDoc = await PDFDocument.load(fs.readFileSync(stampPdf));
  if (stampDoc.getPageCount() !== stamps.length) throw new Error('число страниц с номерами не сошлось');
  const [title, toc, end] = await out.copyPages(front, [0, 1, 2]);
  out.addPage(title); out.addPage(toc);
  const stampIdx = new Map(stamps.map((n, i) => [n, i]));
  for (const d of docs) {
    const pages = await out.copyPages(d.doc, [...Array(d.take).keys()]);
    for (let i = 0; i < pages.length; i++) {
      const pg = out.addPage(pages[i]);
      const n = d.first + i;
      if (stampIdx.has(n)) {
        const [emb] = await out.embedPdf(stampDoc, [stampIdx.get(n)]);
        pg.drawPage(emb, { x: 0, y: 0, width: pg.getWidth(), height: pg.getHeight() });
      }
    }
  }
  out.addPage(end);
  if (out.getPageCount() !== total) throw new Error(`листов ${out.getPageCount()}, ожидалось ${total}`);

  const basePdf = path.join(OUT, 'base.pdf');
  fs.writeFileSync(basePdf, await out.save());

  // Ссылки с карточек содержания и закладки
  const withNav = async bytes => {
    const pdf = await PDFDocument.load(bytes);
    const ctx = pdf.context, tocPage = pdf.getPage(1), H = tocPage.getHeight();
    const dest = n => ctx.obj([pdf.getPage(n - 1).ref, PDFName.of('Fit')]);
    const annots = docs.map((d, i) => {
      const x = (G.x + (i % 2) * (G.w + G.gx)) * MM, y = H - (G.y + Math.floor(i / 2) * (G.h + G.gy) + G.h) * MM;
      return ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [x, y, x + G.w * MM, y + G.h * MM], Border: [0, 0, 0], Dest: dest(d.first) }));
    });
    tocPage.node.set(PDFName.of('Annots'), ctx.obj(annots));
    const rootRef = ctx.nextRef();
    const refs = docs.map(() => ctx.nextRef());
    docs.forEach((d, i) => {
      const o = ctx.obj({ Parent: rootRef, Dest: dest(d.first) });
      o.set(PDFName.of('Title'), PDFHexString.fromText(d.name));
      if (i) o.set(PDFName.of('Prev'), refs[i - 1]);
      if (i < refs.length - 1) o.set(PDFName.of('Next'), refs[i + 1]);
      ctx.assign(refs[i], o);
    });
    const root = ctx.obj({ Type: 'Outlines', First: refs[0], Last: refs[refs.length - 1] });
    root.set(PDFName.of('Count'), PDFNumber.of(refs.length));
    ctx.assign(rootRef, root);
    pdf.catalog.set(PDFName.of('Outlines'), rootRef);
    pdf.setTitle('Каталог MATKASYM SHAAR');
    return pdf.save();
  };

  const full = path.join(OUT, 'Каталог MATKASYM SHAAR.pdf');
  fs.writeFileSync(full, await withNav(fs.readFileSync(basePdf)));

  // Лёгкая версия: сжимаются только картинки, текст и шрифты остаются
  const gsPdf = path.join(OUT, 'gs.pdf');
  compressPdf(basePdf, gsPdf, LIGHT_DPI);
  const light = path.join(OUT, 'Каталог MATKASYM SHAAR (лёгкий).pdf');
  fs.writeFileSync(light, await withNav(fs.readFileSync(gsPdf)));

  const mb = f => (fs.statSync(f).size / 1048576).toFixed(1);
  console.log(`${total} листов. Полная: ${mb(full)} МБ, лёгкая: ${mb(light)} МБ`);
  docs.forEach(d => console.log(`  ${d.name}: лист ${d.first}, страниц ${d.take}`));
  if (process.argv.includes('--upload')) {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
    const cloudinary = require('../lib/cloudinary');
    const up = await cloudinary.uploader.upload(light, { resource_type: 'raw', public_id: 'matkasym/catalogs/shaar.pdf', overwrite: true, invalidate: true });
    console.log('Залит на сайт:', up.secure_url);
  }
})().catch(e => { console.error(e); process.exit(1); });
