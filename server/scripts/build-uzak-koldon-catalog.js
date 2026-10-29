// Каталог UZAK KOLDON в PDF (29.10.2026) — отдельная вёрстка под один сет.
//
// Всё берётся с сайта: товары, цены и размеры — из базы, фото — из Cloudinary
// (images[0] товара и групповой кадр серии matkasym/uzak-koldon/series-<серия>),
// логотип — с matkasym-site.onrender.com. Локальные файлы не читаются.
// Порядок разделов и тексты серий заданы здесь, цифры — нет.
//
// В каталоге нет ни поставщика, ни страны, ни остатков: это правило для всех
// каталогов наружу (см. IMPORT_KEY в client/src/pages/admin/catalogPrint.js).
//
//   node scripts/build-uzak-koldon-catalog.js <папка для HTML и PDF>

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');

const OUT = process.argv[2];
if (!OUT) { console.error('Укажите папку вывода'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

const SITE = 'https://matkasym-site.onrender.com';
const CLOUD = 'https://res.cloudinary.com/dnbg21ef8/image/upload';
const img = (url, w) => url ? url.replace('/upload/', `/upload/f_jpg,q_auto:good,w_${w},c_limit/`) : '';
const seriesImg = (key, w) => `${CLOUD}/f_jpg,q_auto:good,w_${w},c_limit/matkasym/uzak-koldon/series-${key}.jpg`;
// Интерьерные кадры с карточек товаров на сайте: обложка — IS K в офисе,
// страница GK — GK 9 в раздевалке, содержание — тумба T 4 у рабочего стола
const mood = (id, w) => `${CLOUD}/f_jpg,q_auto:good,w_${w},c_limit/${id}`;
const MOOD_COVER = mood('v1784694884/md0a944uwiosxsymrovm.png', 2000);
const MOOD_GK = mood('v1784621268/vxtmdltin3w3ggianrys.png', 1800);
const MOOD_TOC = mood('v1784694205/jsa5cppyxyoq81ckb7ta.png', 1800);

const CARD_ID = '6aa7ae3943f109a689024caa';

// ── Структура каталога ─────────────────────────────────────────────────────
const SECTIONS = [
  { n: '01', title: 'Гардеробные шкафы', note: 'Для раздевалок, спортзалов, школ и производств' },
  { n: '02', title: 'Офисные шкафы', note: 'Для документов, папок и архива' },
  { n: '03', title: 'Тумбы для документов', note: 'Картотечные тумбы с выдвижными ящиками' },
  { n: '04', title: 'Карточные шкафы', note: 'Для картотек и мелкого хранения' },
];

const SERIES = {
  gk: { sec: '01', name: 'AICHUROK GK', kind: 'Гардеробный шкаф',
    lead: 'Шкафы на 2–12 ячеек. Кофейный корпус, белые дверцы, глубина 50 см — помещается верхняя одежда и сумка.',
    skus: ['MKS-W082K', 'MKS-W080K', 'MKS-W078K', 'MKS-W076K', 'MKS-W075K', 'MKS-W074K'] },
  mr: { sec: '01', name: 'AICHUROK M R', kind: 'Раздевальный шкаф',
    lead: 'Светло-серые шкафы на 3, 4 и 6 ячеек. Узкая секция — 38 см.',
    skus: ['MKS-W078', 'MKS-W001-3', 'MKS-W001-4'] },
  go: { sec: '02', name: 'AICHUROK GO', kind: 'Шкаф со стеклянными дверцами',
    lead: 'Двухстворчатые шкафы с прозрачными дверцами: папки и документы видно, не открывая.',
    skus: ['MKS-W052', 'MKS-W052H', 'MKS-W052K', 'MKS-W052ZY'] },
  mo: { sec: '02', name: 'AICHUROK MO', kind: 'Шкаф для документов',
    lead: 'Двухстворчатые шкафы с глухими дверцами.',
    skus: ['MKS-W060', 'MKS-W060H', 'MKS-W060K', 'MKS-W060ZY'] },
  ds: { sec: '02', name: 'AICHUROK DS', kind: 'Двухсекционный шкаф',
    lead: 'Четыре глухие дверцы: верхняя и нижняя секции открываются отдельно.',
    skus: ['MKS-W062H', 'MKS-W062K', 'MKS-W062ZY'] },
  bi: { sec: '02', name: 'AICHUROK BI', kind: 'Комбинированный шкаф',
    lead: 'Сверху — полки за стеклом, снизу — закрытая секция.',
    skus: ['MKS-W053K', 'MKS-W053H', 'MKS-W053ZY'] },
  is: { sec: '02', name: 'AICHUROK IS', kind: 'Комбинированный шкаф с ящиками',
    lead: 'Стеклянные дверцы, два выдвижных ящика и закрытая нижняя секция.',
    skus: ['MKS-W055H', 'MKS-W055K', 'MKS-W055ZY'] },
  t: { sec: '03', name: 'AICHUROK T', kind: 'Картотечная тумба',
    lead: 'Тумбы на 2, 3 и 4 ящика для подвесных папок.',
    skus: ['MKS-W010A-4', 'MKS-W010A-3', 'MKS-W010A-2'] },
  tp: { sec: '03', name: 'AICHUROK TP', kind: 'Тумба с накладной ручкой',
    lead: 'Белые тумбы с прямой накладной ручкой на каждом ящике.',
    skus: ['MKS-TP-4', 'MKS-TP-3'] },
  tr: { sec: '03', name: 'AICHUROK TR', kind: 'Тумба в чёрной раме',
    lead: 'Чёрная рама и белые ящики — контрастная тумба для современного офиса.',
    skus: ['MKS-TR-4', 'MKS-TR-3'] },
  tsh: { sec: '03', name: 'AICHUROK TSh', kind: 'Широкая тумба',
    lead: 'Ширина 90 см: в ящик папки встают боком, в два ряда.',
    skus: ['MKS-TSh-4', 'MKS-TSh-3'] },
};
const SINGLES_WARDROBE = ['MKS-UK-W001-1', 'MKS-UK-W074', 'MKS-UK-001'];

// ── Данные ─────────────────────────────────────────────────────────────────
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const plural = (n, a, b, c) => { const m = n % 10, h = n % 100;
  return `${n} ${m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c}`; };
const money = n => n > 0 ? `${n.toLocaleString('ru-RU').replace(/ |,/g, ' ')} сом` : 'по запросу';
const tag = p => `<span class="tag">${money(p.price)}</span>`;
const spec = (p, re) => (p.specs || []).find(s => re.test(s.key || ''))?.value || '';

// Размеры: «H1850*W900*D500» в поле или в номенклатуре 1С → [В, Ш, Г] в см
function dims(p) {
  for (const src of [p.dimensions, p.nomenclature1C, p.name]) {
    const m = String(src || '').match(/H\s*(\d{3,4})\D+W?\s*(\d{3,4})\D+D?\s*(\d{3,4})/i);
    if (m) return [m[1], m[2], m[3]].map(v => Math.round(v / 10));
  }
  return null;
}
const dimsText = p => { const d = dims(p); return d ? d.join(' × ') : ''; };

const FINISH = { 'серый / белый': 'серый / белый', 'кофейный / белый': 'кофейный / белый', 'трансферная печать': 'под дерево' };
function finish(p) {
  const f = spec(p, /отделк/i).toLowerCase();
  if (f) return FINISH[f] || f;
  if (/W05[2]$|W060$/.test(p.sku)) return 'светло-серый';
  if (/^MKS-TR-/.test(p.sku)) return 'чёрный / белый';
  const c = spec(p, /^цвет$/i);
  return c;
}
function count(p, cells) {
  const doors = +spec(p, /дверей/i);
  if (doors) return cells ? plural(doors, 'ячейка', 'ячейки', 'ячеек') : plural(doors, 'дверь', 'двери', 'дверей');
  const dr = +spec(p, /ящик/i) || +(String(p.nomenclature1C || '').match(/(\d+)\s+(?:выдвижными\s+)?ящик/) || [])[1];
  return dr ? plural(dr, 'ящик', 'ящика', 'ящиков') : '';
}
// Подпись варианта: «GK 4» из pdfVariant, у тумб без цифры ящиков из названия
const variant = p => p.pdfVariant || p.name;

// ── Вёрстка ────────────────────────────────────────────────────────────────
const LOGO = `${SITE}/logos/logo-main.png`;
let pageNo = 0;
const page = (body, cls = '') => {
  pageNo++;
  return `<section class="page ${cls}">${body}
    <footer class="foot"><span>MATKASYM · UZAK KOLDON</span><span>${String(pageNo).padStart(2, '0')}</span></footer></section>`;
};
const secHead = n => { const s = SECTIONS.find(x => x.n === n);
  return `<div class="sec"><span class="sec-n">${s.n}</span><span class="sec-t">${s.title}</span><span class="sec-note">${s.note}</span></div>`; };

function seriesHead(s) {
  const material = s.items.some(p => /холоднокатан/i.test(spec(p, /материал/i))) ? 'Холоднокатаная сталь' : '';
  return `<div class="s-head">
    <div><div class="s-kind">${esc(s.kind)}</div><h2>${esc(s.name)}</h2></div>
    <p class="s-lead">${esc(s.lead)}${material ? `<span class="s-mat">${material}</span>` : ''}</p>
  </div>`;
}
// Одинаковое у всей серии исполнение (GK — всё кофейное) в колонках не повторяем
const sameFinish = s => new Set(s.items.map(finish)).size === 1;
const vdesc = (s, p, cells, sep) => [count(p, cells), sameFinish(s) ? '' : finish(p)].filter(Boolean).join(sep);
function variantCols(s, cells) {
  return `<div class="vars" style="--n:${s.items.length}">${s.items.map(p => `
    <div class="var">
      <div class="v-name">${esc(variant(p))}</div>
      <div class="v-desc">${esc(vdesc(s, p, cells, ' · '))}</div>
      <div class="v-dim">${dimsText(p)}</div>
      <div class="v-price">${tag(p)}</div>
    </div>`).join('')}</div>`;
}
// Серия: групповой кадр + колонки моделей в том же порядке, что на кадре
function seriesBlock(s, { cells = false, big = false } = {}) {
  return `<article class="series${big ? ' series--big' : ''}">
    ${seriesHead(s)}
    <div class="s-photo"><img src="${seriesImg(s.key, big ? 2400 : 1800)}" alt=""></div>
    ${variantCols(s, cells)}
  </article>`;
}
// Серия «фото слева — таблица справа» для узких кадров
function seriesSplit(s, { cells = false } = {}) {
  return `<article class="series series--split">
    ${seriesHead(s)}
    <div class="split">
      <div class="s-photo"><img src="${seriesImg(s.key, 1400)}" alt=""></div>
      <table class="tbl">
        <thead><tr><th>Модель</th><th>Исполнение</th><th>В × Ш × Г</th><th class="r">Цена</th></tr></thead>
        <tbody>${s.items.map(p => `<tr>
          <td class="b">${esc(variant(p))}</td>
          <td>${esc(vdesc(s, p, cells, ', '))}</td>
          <td>${dimsText(p)}</td>
          <td class="r">${tag(p)}</td></tr>`).join('')}</tbody>
      </table>
    </div>
  </article>`;
}
function singleCard(p, title, desc) {
  return `<article class="one">
    <div class="one-photo"><img src="${img(p.images[0], 900)}" alt=""></div>
    <div class="s-kind">${esc(p.category)}</div>
    <h3>${esc(title)}</h3>
    <p class="one-desc">${esc(desc)}</p>
    <div class="one-row"><span>${dimsText(p)} см</span>${tag(p)}</div>
  </article>`;
}
function singleWide(p, title, kind, desc, dimText) {
  return `<article class="series series--one">
    <div class="split split--one">
      <div class="s-photo"><img src="${img(p.images[0], 1400)}" alt=""></div>
      <div>
        <div class="s-kind">${esc(kind)}</div><h2>${esc(title)}</h2>
        <p class="s-lead">${esc(desc)}</p>
        <dl class="dl">
          <dt>Размеры</dt><dd>${esc(dimText)}</dd>
          <dt>Цена</dt><dd>${tag(p)}</dd>
        </dl>
      </div>
    </div>
  </article>`;
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Montserrat:wght@500;600;700&display=block');
@page { size: A4; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
/* брендбук MATKASYM 2024: красный — акцент, металлический серый — заполнение/линии,
   чёрный — заголовки, серый 80% — текст */
:root { --ink:#000; --text:#4d4d4d; --mute:#7d96a0; --metal:#7d96a0; --line:#dfe5e7; --red:#e10523; --pad:16mm; }
html, body { background:#fff; color:var(--ink); font-family:Roboto, Helvetica, Arial, sans-serif; font-size:8.6pt; line-height:1.4;
  -webkit-print-color-adjust:exact; print-color-adjust:exact; }
img { display:block; max-width:100%; }
.page { width:210mm; height:297mm; padding:var(--pad) var(--pad) 22mm; position:relative; overflow:hidden;
  break-after:page; display:flex; flex-direction:column; gap:9mm; }
.page:last-child { break-after:auto; }
.foot { position:absolute; left:var(--pad); right:var(--pad); bottom:10mm; display:flex; justify-content:space-between;
  font-size:6.8pt; letter-spacing:.12em; color:var(--mute); text-transform:uppercase; }
h2 { font-family:Montserrat, Helvetica, sans-serif; font-weight:600; font-size:17pt; letter-spacing:.01em; line-height:1.1; }
h3 { font-family:Montserrat, Helvetica, sans-serif; font-weight:600; font-size:11pt; line-height:1.2; margin:1.5mm 0 1.5mm; }
.s-kind { font-size:6.8pt; letter-spacing:.14em; text-transform:uppercase; color:var(--mute); margin-bottom:1.5mm; }
.tag { display:inline-block; background:var(--red); color:#fff; font-family:Roboto, Helvetica, Arial, sans-serif;
  font-weight:500; font-size:9pt; line-height:1; padding:1.5mm 2.4mm; border-radius:.8mm; white-space:nowrap; }

/* раздел */
.sec { display:flex; align-items:baseline; gap:4mm; padding-bottom:3mm; border-bottom:1px solid var(--metal); }
.sec-n { font-family:Montserrat, Helvetica, sans-serif; font-weight:600; font-size:9pt; color:var(--red); }
.sec-t { font-family:Montserrat, Helvetica, sans-serif; font-weight:600; font-size:9pt; letter-spacing:.14em; text-transform:uppercase; }
.sec-note { margin-left:auto; color:var(--mute); font-size:7.6pt; }

/* серия */
.series { display:flex; flex-direction:column; gap:5mm; flex:1 1 0; min-height:0; }
.series + .series { border-top:1px solid var(--line); padding-top:8mm; }
.s-head { display:grid; grid-template-columns:1fr 1fr; gap:8mm; align-items:end; }
.s-lead { color:var(--text); font-size:8.6pt; max-width:80mm; justify-self:end; }
.s-mat { display:block; margin-top:1.5mm; color:var(--mute); font-size:7.4pt; }
.s-photo { flex:1 1 0; min-height:0; display:flex; align-items:center; justify-content:center; }
.s-photo img { max-height:100%; width:auto; object-fit:contain; }
.series--big .s-photo { flex:0 0 auto; }
.series--big .s-photo img { width:100%; height:auto; }
.vars { display:grid; grid-template-columns:repeat(var(--n), 1fr); border-top:1px solid var(--line); }
.var { padding:3mm 2mm 0 0; }
.var + .var { padding-left:3mm; border-left:1px solid var(--line); }
.v-name { font-family:Montserrat, Helvetica, sans-serif; font-weight:600; font-size:10pt; }
.v-desc { color:var(--text); margin-top:.6mm; min-height:2.6em; }
.v-dim { color:var(--mute); font-size:7.6pt; margin-top:1mm; }
.v-price { margin-top:2mm; }

/* фото слева — таблица справа */
.split { display:grid; grid-template-columns:50% 1fr; gap:9mm; align-items:center; flex:1 1 0; min-height:0; }
.split .s-photo { height:100%; }
.split--one { grid-template-columns:50% 1fr; }
.tbl { width:100%; border-collapse:collapse; font-size:8.4pt; }
.tbl th { text-align:left; font-weight:500; font-size:6.8pt; letter-spacing:.1em; text-transform:uppercase; color:var(--mute);
  padding:0 0 2mm; border-bottom:1px solid var(--metal); }
.tbl td { padding:2.4mm 2mm 2.4mm 0; vertical-align:middle; border-bottom:1px solid var(--line); vertical-align:top; }
.tbl .b { font-family:Montserrat, Helvetica, sans-serif; font-weight:600; white-space:nowrap; }
.tbl .r { text-align:right; white-space:nowrap; font-weight:600; padding-right:0; }
.dl { display:grid; grid-template-columns:auto 1fr; margin-top:6mm; border-top:1px solid var(--metal); }
.dl dt, .dl dd { padding:2.4mm 0; border-bottom:1px solid var(--line); }
.dl dt { color:var(--mute); font-size:7.4pt; text-transform:uppercase; letter-spacing:.1em; padding-right:8mm; }
.dl dd { text-align:right; font-weight:600; }

/* три отдельных товара */
.ones { display:grid; grid-template-columns:repeat(3, 1fr); gap:7mm; border-top:1px solid var(--line); padding-top:7mm; flex:1 1 0; min-height:0; }
.one { display:flex; flex-direction:column; min-height:0; }
.one-photo { flex:1 1 0; min-height:0; display:flex; align-items:center; justify-content:center; margin-bottom:4mm; }
.one-photo img { max-height:100%; width:auto; }
.one h3 { min-height:2.4em; display:flex; align-items:flex-end; }
.one-desc { color:var(--text); min-height:2.8em; }
.one-row { display:flex; justify-content:space-between; align-items:center; margin-top:3mm; padding-top:2.4mm; border-top:1px solid var(--line); }
.one-row span:first-child { color:var(--mute); }


/* обложка */
.cover { padding:0; gap:0; }
.cover-photo { height:178mm; overflow:hidden; }
.cover-photo img { width:100%; height:100%; object-fit:cover; object-position:50% 40%; }
.cover-body { flex:1 1 0; padding:12mm var(--pad) 12mm; display:flex; flex-direction:column; justify-content:space-between; }
.cover .logo { height:5.2mm; width:auto; align-self:flex-start; }
.cover h1 { font-family:Montserrat, Helvetica, sans-serif; font-weight:700; font-size:44pt; letter-spacing:.02em; line-height:1; }
.cover .sub { font-size:12pt; color:var(--text); margin-top:4mm; }
.cover .meta { display:flex; justify-content:space-between; padding-top:4mm; border-top:1px solid var(--metal);
  font-size:7.6pt; letter-spacing:.12em; text-transform:uppercase; color:var(--mute); }
.cover .foot { display:none; }

/* содержание */
.mood { height:125mm; overflow:hidden; flex:0 0 auto; }
.mood--fill { height:auto; flex:1 1 0; min-height:0; }
.mood img { width:100%; height:100%; object-fit:cover; }
.toc { display:grid; grid-template-columns:1fr 1fr; gap:10mm; }
.toc h2 { margin-bottom:5mm; }
.toc-row { display:grid; grid-template-columns:9mm 1fr auto; padding:2.6mm 0; border-bottom:1px solid var(--line); align-items:baseline; }
.toc-row .n { font-family:Montserrat, Helvetica, sans-serif; font-weight:600; color:var(--red); font-size:8pt; }
.toc-row .t { font-weight:500; }
.toc-row .m { display:block; color:var(--mute); font-size:7.4pt; font-weight:400; }
.toc-row .p { color:var(--mute); }
.legend { display:flex; flex-direction:column; gap:3.4mm; }
.sw { display:grid; grid-template-columns:12mm 1fr; gap:4mm; align-items:center; }
.sw i { display:block; height:8mm; border:1px solid var(--line); }
.sw b { font-family:Montserrat, Helvetica, sans-serif; font-weight:600; }
.sw span { display:block; color:var(--mute); font-size:7.6pt; }
.notes { color:var(--text); font-size:8pt; border-top:1px solid var(--line); padding-top:4mm; display:grid; gap:1.6mm; }

/* цифры */
.stats { margin-top:auto; display:grid; grid-template-columns:repeat(4,1fr); border-top:1px solid var(--metal); }
.stats div { padding:5mm 4mm 0 0; }
.stats div + div { padding-left:5mm; border-left:1px solid var(--line); }
.stats b { display:block; font-family:Montserrat, Helvetica, sans-serif; font-weight:600; font-size:22pt; line-height:1; }
.stats span { display:block; margin-top:2mm; color:var(--mute); font-size:7.6pt; }

/* как заказать */
.order { display:grid; grid-template-columns:1fr 1fr; gap:10mm; border-top:1px solid var(--metal); padding-top:7mm; }
.order h2 { margin-bottom:4mm; }
.steps { counter-reset:s; display:grid; gap:3mm; }
.steps li { list-style:none; display:grid; grid-template-columns:7mm 1fr; }
.steps li::before { counter-increment:s; content:counter(s, decimal-leading-zero); font-family:Montserrat, Helvetica, sans-serif; font-weight:600; color:var(--red); font-size:8pt; }
.contacts { display:grid; gap:3.4mm; }
.contacts div { display:grid; grid-template-columns:24mm 1fr; padding-bottom:3mm; border-bottom:1px solid var(--line); }
.contacts dt { color:var(--mute); font-size:7.2pt; text-transform:uppercase; letter-spacing:.1em; }
.contacts dd { font-weight:500; }
.contacts .big { font-family:Montserrat, Helvetica, sans-serif; font-weight:600; font-size:12pt; }
`;

(async () => {
  await mongoose.connect(MONGO_URI);
  const col = mongoose.connection.db.collection('products');
  const all = await col.find({ set: 'uzak-koldon', hideInPdf: { $ne: true } }).toArray();
  const bySku = Object.fromEntries(all.filter(p => p.sku && p.images?.length).map(p => [p.sku, p]));
  const card = all.find(p => String(p._id) === CARD_ID);

  for (const [key, s] of Object.entries(SERIES)) {
    s.key = key;
    s.items = s.skus.map(sku => { if (!bySku[sku]) throw new Error('нет товара ' + sku); return bySku[sku]; });
  }
  const S = SERIES;
  const [w001, w074, kiyim] = SINGLES_WARDROBE.map(s => bySku[s]);
  const w066 = bySku['MKS-UK-W066'];

  const models = Object.values(SERIES).reduce((a, x) => a + x.items.length, 0) + SINGLES_WARDROBE.length + 2; // + W066 и карточный
  // Номера страниц разделов — для содержания (обложка 1, содержание 2)
  const TOC_PAGES = { '01': 3, '02': 5, '03': 8, '04': 10 };

  const pages = [];
  // 1. Обложка
  pages.push(page(`
    <div class="cover-photo"><img src="${MOOD_COVER}" alt=""></div>
    <div class="cover-body">
      <img class="logo" src="${LOGO}" alt="MATKASYM">
      <div>
        <h1>UZAK KOLDON</h1>
        <p class="sub">Металлические шкафы и тумбы для офиса, раздевалок и архива</p>
      </div>
      <div class="meta"><span>Каталог 2026</span><span>Бренд MATKASYM SHAAR</span></div>
    </div>`, 'cover'));

  // 2. Содержание и обозначения
  pages.push(page(`
    <div class="mood"><img src="${MOOD_TOC}" alt=""></div>
    <div class="toc">
      <div>
        <h2>Содержание</h2>
        ${SECTIONS.map(s => `<div class="toc-row"><span class="n">${s.n}</span>
          <span class="t">${s.title}<span class="m">${s.note}</span></span><span class="p">${String(TOC_PAGES[s.n]).padStart(2, '0')}</span></div>`).join('')}
      </div>
      <div>
        <h2>Исполнения</h2>
        <div class="legend">
          <div class="sw"><i style="background:linear-gradient(90deg,#5f6468 0 35%,#f4f4f2 35%)"></i><div><b>H</b> — серый / белый<span>Графитовый корпус, белые дверцы</span></div></div>
          <div class="sw"><i style="background:linear-gradient(90deg,#6e4b36 0 35%,#f4f4f2 35%)"></i><div><b>K</b> — кофейный / белый<span>Корпус цвета кофе, белые дверцы</span></div></div>
          <div class="sw"><i style="background:linear-gradient(90deg,#5f6468 0 35%,#c98b50 35%)"></i><div><b>Z</b> — под дерево<span>Дверцы с текстурой дерева (трансферная печать)</span></div></div>
          <div class="notes">
            <span>Размеры — высота × ширина × глубина, в сантиметрах.</span>
            <span>Цены — розничные, в сомах. Для оптовых заказов — отдельные условия.</span>
          </div>
        </div>
      </div>
    </div>
    <div class="stats">
      <div><b>${models}</b><span>моделей в каталоге</span></div>
      <div><b>${Object.keys(SERIES).length}</b><span>серий AICHUROK</span></div>
      <div><b>3</b><span>исполнения корпуса</span></div>
      <div><b>185 см</b><span>высота шкафов</span></div>
    </div>`));

  // 3. GK во всю полосу
  pages.push(page(`${secHead('01')}${seriesBlock(S.gk, { cells: true, big: true })}
    <div class="mood mood--fill"><img src="${MOOD_GK}" alt=""></div>`));
  // 4. M R + отдельные шкафы
  pages.push(page(`${seriesSplit(S.mr, { cells: true })}
    <div class="ones">
      ${singleCard(w001, 'Шкаф на одну секцию', 'Одна дверца, внутри штанга для плечиков и полка для обуви.')}
      ${singleCard(w074, 'Шкаф для одежды на две секции', 'Две дверцы: слева — для одежды, справа — полки.')}
      ${singleCard(kiyim, 'KiyimBox', 'Раздевальный шкаф на четыре секции, серебристый.')}
    </div>`));
  // 5–7. Офисные
  pages.push(page(`${secHead('02')}${seriesBlock(S.go)}${seriesBlock(S.mo)}`));
  pages.push(page(`${seriesBlock(S.ds)}${seriesBlock(S.bi)}`));
  pages.push(page(`${seriesBlock(S.is)}${singleWide(w066, 'Шкаф для документов', 'Шкаф для документов',
    'Двухстворчатый шкаф с глухими дверцами и шестью полками — вмещает много папок при ширине 85 см.', `${dimsText(w066)} см`)}`));
  // 8–9. Тумбы
  pages.push(page(`${secHead('03')}${seriesBlock(S.t)}${seriesSplit(S.tp)}`));
  pages.push(page(`${seriesSplit(S.tr)}${seriesBlock(S.tsh)}`));
  // 10. Карточный шкаф + как заказать
  pages.push(page(`${secHead('04')}
    ${singleWide({ ...card, images: card.images }, 'Карточный шкаф', 'Карточный шкаф',
      'Восемь выдвижных ящиков с ячейками и держателями для подписей — для карточек, образцов и мелочей.', '890 × 646 × 512 мм')}
    <div class="order">
      <div>
        <h2>Как заказать</h2>
        <ol class="steps">
          <li>Выберите модель и исполнение по каталогу.</li>
          <li>Позвоните или напишите нам — уточним наличие и сроки.</li>
          <li>Приезжайте в шоурум посмотреть шкафы вживую.</li>
        </ol>
      </div>
      <dl class="contacts">
        <div><dt>Телефон</dt><dd class="big">+996 501 111 726<br>+996 504 200 067</dd></div>
        <div><dt>Instagram</dt><dd>@matkasym_shaar</dd></div>
        <div><dt>Почта</dt><dd>matkasymovllc@gmail.com</dd></div>
        <div><dt>Адрес</dt><dd>с. Маевка, ул. Тепличная, уч. 1/2</dd></div>
      </dl>
    </div>`));

  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Каталог UZAK KOLDON</title>
<style>${CSS}</style></head><body>${pages.join('\n')}</body></html>`;
  const htmlFile = path.join(OUT, 'uzak-koldon.html');
  fs.writeFileSync(htmlFile, html);
  const pdf = path.join(OUT, 'Каталог UZAK KOLDON.pdf');
  execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--virtual-time-budget=90000',
    `--print-to-pdf=${pdf}`, `file://${htmlFile}`], { stdio: 'ignore', timeout: 240000 });
  console.log('PDF:', pdf, `(${pageNo} стр.)`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
