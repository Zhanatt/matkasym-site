// Каталог KOOZ KOOPSUZDUK в PDF (31.10.2026) — для строительных компаний.
// Порядок по просьбе пользователя: IP-щиты → сантехнические → этажные → пожарные, затем ВРУ и прочее.
// Упор на ГОСТ: какие стандарты соблюдаем (материал, крепёж, замки, IP, пожарные шкафы) и что
// делаем под заказ по техлисту. Источник фактов — техлисты на NAS отдела разработки
// (02_Спец_заказ/03_Щиты, 03 Серийное/07_Щиты), только чтение.
//
// Товары — из базы по сету kooz-koopsuzduk; дубли карточек (одинаковый размер) сводятся в одну
// строку таблицы, цена — с карточки, где она есть; нет цены — «индивидуальный».
//
//   node scripts/build-kooz-koopsuzduk-catalog.js <папка> [--upload]

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const { FONT_CSS, LIGHT_META } = require('../lib/catalogFonts');

const OUT = process.argv[2];
if (!OUT) { console.error('Укажите папку вывода'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

const SITE = 'https://matkasym-site.onrender.com';
const CLOUD = 'https://res.cloudinary.com/dnbg21ef8/image/upload';
const cut = (url, w) => url.replace('/upload/', `/upload/b_white/e_trim:10/f_jpg,q_auto:good,w_${w},c_limit/`);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = n => n > 0 ? `${n.toLocaleString('ru-RU').replace(/ |,/g, ' ')} сом` : 'индивидуальный';
const tag = n => `<span class="tag">${money(n)}</span>`;

const SECTIONS = [
  { n: '01', title: 'IP-щиты', note: 'Электрощиты IP31, IP54, IP30, IP44, уличные и газовые' },
  { n: '02', title: 'Щиты сантехнические', note: 'Одно- и двухдверные, встраиваемые' },
  { n: '03', title: 'Щиты этажные', note: 'С окошками под счётчики, 1–3 двери' },
  { n: '04', title: 'Щиты и шкафы пожарные', note: 'ШПК, щиты для инвентаря' },
  { n: '05', title: 'ВРУ и комплектующие', note: 'Вводно-распределительные устройства, боксы, люки' },
  { n: '06', title: 'Под заказ по проекту', note: 'Изготовление по техлисту заказчика' },
];

// Главные фото разделов (id карточек на сайте)
const PHOTO = {
  ip31: '6a599ed97ea85014c74f6e87', ip54: '6a0d469f7b357c1c052d4c20', ip30: '6a2c2f88599b2d1c30936ac3',
  ip44: '6a2c2f8a599b2d1c30936ad7', gas: '69f2d85050420bce3b53b736',
  san1: '69f49790028b571f055a2396', san2: '6a72f6e2583b96ba59308519', san3: '69f49791028b571f055a239a',
  et1: '69f2d85050420bce3b53b73b', et2: '6a7ec10c65f3c690d0e5d4a0', et3: '69f2d85050420bce3b53b73c',
  f1: '6a2374cc547875f908ac75ba', f5: '69f496fd028b571f055a1fd6', f6: '6a599ee17ea85014c74f6ee0', f2: '6a2374cc547875f908ac75b4', f3: '69f496fe028b571f055a1fdc', f4: '6a599ee27ea85014c74f6ee2',
  vru: '6a2c2f8f599b2d1c30936b09', vru2: '6a599ed67ea85014c74f6e6d', box1: '6a2c2f8b599b2d1c30936ae1', box2: '6a2c2f8e599b2d1c30936aff',
  luk: '6a672690e871489c0884269d',
};

// Размер из названия: «50*40*20», «500×400×200», «50х40 18» → [В, Ш, Г] в см (≥250 считаем мм)
function sizeOf(name) {
  const m = String(name || '').match(/(\d{2,4})\s*[x×х*]\s*(\d{2,4})\s*(?:[x×х*]|\s)\s*(\d{1,4})/i);
  if (!m) return null;
  let v = [m[1], m[2], m[3]].map(Number);
  if (Math.max(...v) >= 250) v = v.map(x => x / 10);
  return v.map(x => String(Math.round(x * 10) / 10).replace('.', ','));
}
const sizeText = s => s ? s.join(' × ') : '—';

const CSS = `
${FONT_CSS}
@page { size: A4; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
:root { --ink:#000; --text:#4d4d4d; --mute:#7d96a0; --metal:#7d96a0; --line:#dfe5e7; --red:#e10523; --pad:16mm; }
html, body { background:#fff; color:var(--ink); font-family:Roboto, Helvetica, Arial, sans-serif; font-size:8.6pt; line-height:1.4;
  -webkit-print-color-adjust:exact; print-color-adjust:exact; }
img { display:block; max-width:100%; }
.page { width:210mm; height:297mm; padding:var(--pad) var(--pad) 22mm; position:relative; overflow:hidden;
  break-after:page; display:flex; flex-direction:column; gap:8mm; }
.page:last-child { break-after:auto; }
.foot { position:absolute; left:var(--pad); right:var(--pad); bottom:10mm; display:flex; justify-content:space-between;
  font-size:6.8pt; letter-spacing:.12em; color:var(--mute); text-transform:uppercase; }
.foot-l { display:flex; align-items:center; gap:3mm; }
.foot-l img { height:3.4mm; width:auto; }
.foot-l i { font-style:normal; }
h2 { font-family:Montserrat, Helvetica, sans-serif; font-weight:600; font-size:17pt; letter-spacing:.01em; line-height:1.1; }
.s-kind { font-size:6.8pt; letter-spacing:.14em; text-transform:uppercase; color:var(--mute); margin-bottom:1.5mm; }
.tag { display:inline-block; background:var(--red); color:#fff; font-weight:500; font-size:9pt; line-height:1;
  padding:1.5mm 2.4mm; border-radius:.8mm; white-space:nowrap; }

.sec { display:flex; align-items:baseline; gap:4mm; padding-bottom:3mm; border-bottom:1px solid var(--metal); }
.sec-n { font-family:Montserrat, Helvetica, sans-serif; font-weight:600; font-size:9pt; color:var(--red); }
.sec-t { font-family:Montserrat, Helvetica, sans-serif; font-weight:600; font-size:9pt; letter-spacing:.14em; text-transform:uppercase; }
.sec-note { margin-left:auto; color:var(--mute); font-size:7.6pt; }

.series { display:flex; flex-direction:column; gap:5mm; flex:1 1 0; min-height:0; }
.series + .series { border-top:1px solid var(--line); padding-top:7mm; }
.s-head { display:grid; grid-template-columns:1fr 1fr; gap:8mm; align-items:end; }
.s-lead { color:var(--text); max-width:82mm; justify-self:end; }
.s-lead--l { justify-self:start; margin-top:3mm; }

/* колонки моделей */
.mdls { display:grid; grid-template-columns:repeat(var(--n), 1fr); flex:1 1 0; min-height:0; }
.mdl { display:flex; flex-direction:column; min-height:0; padding:0 4mm; }
.mdl:first-child { padding-left:0; }
.mdl:last-child { padding-right:0; }
.mdl + .mdl { border-left:1px solid var(--line); }
.m-photo { flex:1 1 0; min-height:0; display:flex; align-items:flex-end; justify-content:center; padding-bottom:4mm; }
.m-photo img { max-height:100%; max-width:100%; width:auto; object-fit:contain; }
.m-name { font-family:Montserrat, Helvetica, sans-serif; font-weight:600; font-size:11pt; padding-top:3mm; border-top:1px solid var(--metal); }
.m-desc { color:var(--text); margin-top:.6mm; }
.m-dl { display:grid; grid-template-columns:auto 1fr; margin-top:2mm; font-size:8pt; }
.m-dl dt { color:var(--mute); padding:1.2mm 0; border-bottom:1px solid var(--line); }
.m-dl dd { text-align:right; padding:1.2mm 0; border-bottom:1px solid var(--line); white-space:nowrap; }
.m-dl .ghost { visibility:hidden; }
.m-prices { display:grid; gap:1.6mm; margin-top:2.6mm; align-content:start; min-height:calc(var(--rows, 2) * 7.6mm); }
.m-pr { display:flex; justify-content:space-between; align-items:center; }
.m-pr > span:first-child { display:flex; align-items:center; gap:2mm; color:var(--text); }
.m-pr i { width:3.4mm; height:3.4mm; border-radius:50%; border:1px solid #c9d2d5; display:inline-block; }

/* фото слева — таблица справа */
.split { display:grid; grid-template-columns:52% 1fr; gap:9mm; align-items:center; flex:1 1 0; min-height:0; }
.s-photo { height:100%; min-height:0; display:flex; align-items:center; justify-content:center; }
.s-photo img { max-height:100%; max-width:100%; width:auto; object-fit:contain; }
.s-extra { height:30mm; margin-top:4mm; overflow:hidden; }
.s-extra img { width:100%; height:100%; object-fit:cover; object-position:55% 50%; }
.banner { height:78mm; flex:0 0 auto; overflow:hidden; }
.banner img { width:100%; height:100%; object-fit:cover; object-position:50% 55%; }
.dl { display:grid; grid-template-columns:auto 1fr; margin-top:4mm; border-top:1px solid var(--metal); }
.dl dt, .dl dd { padding:1.7mm 0; border-bottom:1px solid var(--line); }
.dl dt { color:var(--mute); font-size:7.4pt; text-transform:uppercase; letter-spacing:.1em; padding-right:8mm; }
.dl dd { text-align:right; font-weight:600; }

/* интерьер + список */
.uses { display:grid; grid-template-columns:1fr 1fr; gap:10mm; }
/* подбор по назначению */
.purp { display:grid; grid-template-columns:repeat(3,1fr); grid-template-rows:repeat(3,1fr); gap:6mm 7mm; flex:1 1 0; min-height:0; }
.pp { border-top:1px solid var(--metal); padding-top:3mm; display:flex; flex-direction:column; min-height:0; }
.pp--wide { grid-column:span 2; }
.pp h3 { font-family:Montserrat, Helvetica, sans-serif; font-weight:600; font-size:11pt; line-height:1.2; }
.pp > p { color:var(--mute); font-size:7.6pt; margin:.8mm 0 2mm; min-height:2.6em; }
.pp ul { list-style:none; display:grid; gap:1.6mm; }
.pp li { display:grid; grid-template-columns:15mm 1fr auto; gap:3mm; align-items:center; padding-bottom:1.6mm; border-bottom:1px solid var(--line); }
.pp-img { width:15mm; height:15mm; display:flex; align-items:center; justify-content:center; }
.pp-img img, .pp-img svg { max-width:100%; max-height:100%; width:auto; height:auto; }
.pp-img svg { width:15mm; height:15mm; }
.pp-n b { display:block; font-family:Montserrat, Helvetica, sans-serif; font-weight:600; font-size:8.2pt; white-space:nowrap; }
.pp-n i { display:block; font-style:normal; color:var(--red); font-size:7.6pt; font-weight:500; margin-top:.4mm; }
.pp-p { color:var(--mute); font-size:8pt; }
/* индивидуальные заказы */
.cust-top { display:grid; grid-template-columns:1fr 82mm; gap:10mm; align-items:center; }
.cust-h { font-size:24pt; font-weight:700; margin-bottom:5mm; }
.cust-lead { color:var(--text); font-size:10pt; line-height:1.55; }
.cust-ask { margin-top:7mm; }
.cust-draw svg { width:100%; height:auto; display:block; }
.cust-cols { display:grid; grid-template-columns:1fr 1fr; gap:10mm; }
.cust-steps { margin-top:auto; }
.cust-stats { display:grid; grid-template-columns:repeat(4,1fr); border-top:1px solid var(--metal); }
.cust-stats div { padding:4mm 4mm 0 0; }
.cust-stats div + div { padding-left:4mm; border-left:1px solid var(--line); }
.cust-stats b { display:block; font-family:Montserrat, Helvetica, sans-serif; font-weight:600; font-size:10.5pt; line-height:1.2; }
.cust-stats span { display:block; margin-top:1.5mm; color:var(--mute); font-size:7.6pt; }
.list { list-style:none; display:grid; margin-top:1.5mm; border-top:1px solid var(--metal); }
.list li { padding:2.4mm 0; border-bottom:1px solid var(--line); font-size:9pt; }

/* под заказ */
.proj { display:grid; grid-template-columns:1fr 1fr; gap:8mm; flex:1 1 0; min-height:0; }
.proj article { display:flex; flex-direction:column; gap:3mm; min-height:0; }
.proj .p-photo { flex:1 1 0; min-height:0; display:flex; align-items:center; justify-content:center; }
.proj .p-photo img { max-width:100%; max-height:100%; object-fit:contain; }
.proj p { color:var(--text); }
.ask { display:flex; justify-content:space-between; align-items:center; padding-top:2.4mm; border-top:1px solid var(--line); color:var(--mute); }

/* обложка */
.cover { padding:0; gap:0; }
.cover .foot { display:none; }
.cover-grid { position:absolute; inset:0; display:grid; grid-template-columns:1fr 1fr; grid-template-rows:1fr 1fr; }
.cover-grid div { overflow:hidden; }
.cover-grid img { width:100%; height:100%; object-fit:cover; }
.cover-tab { position:absolute; top:0; left:50%; transform:translateX(-50%); }
.cover-tab img { width:36mm; height:auto; }
.cover-plate { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); background:var(--metal); color:#fff;
  font-family:Montserrat, Helvetica, sans-serif; font-weight:700; font-size:30pt; letter-spacing:.04em; line-height:1;
  padding:5mm 10mm; border-radius:3mm; white-space:nowrap; text-align:center; }
.cover-plate small { display:block; font-size:9pt; font-weight:600; letter-spacing:.16em; margin-top:2.4mm; text-transform:uppercase; }

/* содержание и подбор */
.intro { display:grid; grid-template-columns:1fr 1fr; gap:10mm; align-items:end; padding-bottom:5mm; border-bottom:1px solid var(--metal); }
.intro h2 { font-size:30pt; font-weight:700; }
.intro p { color:var(--text); font-size:10pt; line-height:1.5; }
.toc-row { display:grid; grid-template-columns:12mm 1fr auto; padding:1.3mm 0; border-bottom:1px solid var(--line); align-items:baseline; }
.toc-row .n { font-family:Montserrat, Helvetica, sans-serif; font-weight:600; color:var(--red); font-size:11pt; }
.toc-row .t { font-family:Montserrat, Helvetica, sans-serif; font-weight:600; font-size:12pt; }
.toc-row .m { display:block; font-family:Roboto, Helvetica, Arial, sans-serif; font-weight:400; color:var(--mute); font-size:8pt; margin-top:.6mm; }
.toc-row .p { color:var(--mute); font-size:11pt; }
.tbl { width:100%; border-collapse:collapse; font-size:8pt; }
.tbl th { text-align:left; font-weight:500; font-size:6.8pt; letter-spacing:.1em; text-transform:uppercase; color:var(--mute);
  padding:0 2mm 2mm 0; border-bottom:1px solid var(--metal); white-space:nowrap; }
.tbl td { padding:1mm 2mm 1.25mm 0; border-bottom:1px solid var(--line); white-space:nowrap; }
.tbl .b { font-family:Montserrat, Helvetica, sans-serif; font-weight:600; }
.tbl .r { text-align:right; padding-right:0; }
.tbl .c { text-align:center; }
.tbl .g td { padding-top:2mm; color:var(--red); font-family:Montserrat, Helvetica, sans-serif; font-weight:600; font-size:7pt; letter-spacing:.12em; text-transform:uppercase; }
.notes { color:var(--mute); font-size:7.6pt; display:flex; gap:8mm; }

/* как заказать */
/* групповой кадр: все стеллажи без фона, сзади высокие, спереди низкие */
.kz-ex { flex:1 1 0; min-height:0; grid-template-columns:repeat(4,1fr); }
.kz-why { margin-top:0; }
.p-vru .duo2 .fam-photo { flex:0 0 110mm; }
.p-vru .duo2 .fam-photo img { max-height:110mm; }
.p-vru .fam-photo--s { flex:0 0 70mm; }
.p-vru .fam-photo--s img { max-height:70mm; }
.cust-steps { margin-top:0; }
.end-logo { flex:1 1 0; display:flex; align-items:center; justify-content:center; }
.end-logo img { width:70mm; height:auto; }
.end-photo { flex:1 1 0; min-height:0; overflow:hidden; }
.end-photo img { width:100%; height:100%; object-fit:cover; }
/* групповое фото: во всю ширину листа, светлый фон кадра растворяется в белом (multiply) */
.end-photo--fit { flex:0 0 auto; margin:0 calc(-1 * var(--pad)); overflow:visible; }
.end-photo--fit img { width:100%; height:auto; mix-blend-mode:multiply; }
.end-photo--fit + .order { margin-top:auto; }
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
// Семейства: что относится к таблице, подпись исполнения строки
const FAMILIES = {
  ip31: { test: n => /электрощит|щрн|щмп ip31/i.test(n) && !/этаж|EKF|IP54|IP5|IP30|IP44|IP40|нерж|дожд|GGD|коробк|газ|ЩР IP31 40х30х155/i.test(n),
    variant: n => /фальш/i.test(n) ? 'с фальшпанелью' : /щрн/i.test(n) ? 'ЩРн, 2 замка, сальники' : /щмп/i.test(n) ? 'ЩМП' : '' },
  ip54: { test: n => /IP ?54/i.test(n) && !/EKF/i.test(n), variant: () => '' },
  ip30: { test: n => /К\.?\s?IP30/i.test(n) && !/GGD/i.test(n), variant: n => /монтаж/i.test(n) ? 'с монтажной панелью' : '' },
  ip44: { test: n => /IP44|нерж/i.test(n), variant: () => 'нержавеющая сталь, козырёк' },
  rain: { test: n => /дожд/i.test(n), variant: n => /Шкаф/i.test(n) ? 'напольный шкаф' : 'навесной, с козырьком' },
  gas: { test: n => /газ/i.test(n), variant: n => /горизонт/i.test(n) ? 'горизонтальный' : /вертик/i.test(n) ? 'вертикальный' : '' },
  san: { test: (n, p) => p.cat === 'Щиты сантехнические' && !/ВРУ/i.test(n) || /^Сантехнический щит двухдверный 1160/i.test(n),
    variant: n => /2-х|двух|2х|2 двер/i.test(n) ? '2 двери' : '1 дверь' },
  et: { test: (n, p) => p.cat === 'Щиты этажные' || /этаж/i.test(n) && p.cat === 'other',
    variant: n => [(n.match(/(?:^|[\s(])(\d)\s*окош/i) || [])[1] ? `${n.match(/(?:^|[\s(])(\d)\s*окош/i)[1]} окошек` : /кут/i.test(n) ? 'окошки, проект «Кут»' : '', (n.match(/(\d)х?\s*дверн/i) || [])[1] ? `${n.match(/(\d)х?\s*дверн/i)[1]} двери` : '', /фальш/i.test(n) ? 'с фальшпанелью' : ''].filter(Boolean).join(', ') },
  fire: { test: (n, p) => p.cat === 'Шкафы пожарные', variant: n => /ШПК/i.test(n) ? (/встраив/i.test(n) ? 'ШПК встраиваемый' : /2-двер/i.test(n) ? 'ШПК 2 двери, навесной' : 'ШПК-310') : 'щит для инвентаря' },
};

(async () => {
  await mongoose.connect(MONGO_URI);
  const all = (await mongoose.connection.db.collection('products').find({ set: 'kooz-koopsuzduk', hideInPdf: { $ne: true } }).toArray())
    .map(p => ({ ...p, cat: p.category, nm: String(p.name || '').replace(/\s+/g, ' ').trim() }));
  const byId = Object.fromEntries(all.map(p => [String(p._id), p]));
  const ph = (k, w = 1200) => { const p = byId[PHOTO[k]]; if (!p?.images?.[0]) throw new Error('нет фото ' + k); return cut(p.images[0], w); };

  // Строки таблицы семейства: одна на размер+исполнение, цена — максимальная из найденных (>0)
  const used = new Set();
  function rows(key) {
    const f = FAMILIES[key], map = new Map();
    for (const p of all) {
      if (used.has(p._id) || !f.test(p.nm, p)) continue;
      const s = sizeOf(p.nm) || sizeOf(p.dimensions); if (!s) continue;
      used.add(p._id);
      const v = f.variant(p.nm), k = s.join('x') + '|' + v;
      const r = map.get(k) || { s, v, price: 0 };
      r.price = Math.max(r.price, p.price || 0); map.set(k, r);
    }
    return [...map.values()].sort((a, b) => (+a.s[0].replace(',', '.') * +a.s[1].replace(',', '.')) - (+b.s[0].replace(',', '.') * +b.s[1].replace(',', '.')));
  }
  const R = {}; for (const k of Object.keys(FAMILIES)) R[k] = rows(k);

  const table = (rs, { variant = true } = {}) => `<table class="tbl kz-tbl"><thead><tr><th>В × Ш × Г, см</th>${variant ? '<th>Исполнение</th>' : ''}<th class="r">Цена</th></tr></thead>
    <tbody>${rs.map(r => `<tr><td class="b">${sizeText(r.s)}</td>${variant ? `<td>${esc(r.v)}</td>` : ''}<td class="r">${money(r.price)}</td></tr>`).join('')}</tbody></table>`;
  const specs = list => `<dl class="dl">${list.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
  const gost = t => `<div class="gost"><b>ГОСТ</b><span>${t}</span></div>`;

  let pageNo = 0;
  const LOGO = `${SITE}/logos/logo-main.png`;
  const page = (body, cls = '') => { pageNo++; return `<section class="page ${cls}">${body}
    <footer class="foot"><span class="foot-l"><img src="${LOGO}" alt="MATKASYM"><i>KOOZ KOOPSUZDUK</i></span><span>${String(pageNo).padStart(2, '0')}</span></footer></section>`; };
  const secHead = n => { const s = SECTIONS.find(x => x.n === n);
    return `<div class="sec"><span class="sec-n">${s.n}</span><span class="sec-t">${s.title}</span><span class="sec-note">${s.note}</span></div>`; };
  const head = (kind, title, lead) => `<div class="s-head"><div><div class="s-kind">${esc(kind)}</div><h2>${esc(title)}</h2></div><p class="s-lead">${esc(lead)}</p></div>`;
  // Блок «фото слева — характеристики и таблица справа»
  const fam = ({ kind, title, lead, photo, photos, sp, rs, variant = true, note = '' }) => `<article class="fam">
    ${head(kind, title, lead)}
    <div class="fam-body"><div class="fam-photo"><img src="${photos ? photos[0] : photo}" alt=""></div>
      <div class="fam-right">${specs(sp)}${note}${rs?.length ? table(rs, { variant }) : ''}</div></div>
    ${photos ? `<div class="fam-strip">${photos.slice(1).map(u => `<div><img src="${u}" alt=""></div>`).join('')}</div>` : ''}</article>`;

  const COLORS = [['#d7d7d7', 'RAL 7035', 'светло-серый — стандарт'], ['#f1f0ea', 'RAL 9016', 'белый'], ['#a5a5a5', 'RAL 9006', 'серебристый'],
    ['#383e42', 'RAL 7016', 'антрацит'], ['#0e0e10', 'RAL 9005', 'чёрный матовый'], ['#4a3526', 'RAL 8019', 'коричневый'],
    ['#a72920', 'RAL 3000', 'красный — пожарные'], ['#e6b400', 'RAL 1018', 'жёлтый — газовые']];
  const STEEL = 'х/к прокат по ГОСТ 16523-97';
  const pages = [];

  // 1. Обложка: 2×2 изделия на белом
  pages.push(page(`<div class="cover-grid cover-grid--white">${['et1', 'ip54', 'san1', 'f3'].map(k => `<div><img src="${ph(k, 1100)}" alt=""></div>`).join('')}</div>
    <div class="cover-tab"><img src="${CLOUD}/f_png,w_600,c_limit/matkasym/uzak-koldon/logo-tab" alt="MATKASYM"></div>
    <div class="cover-plate">KOOZ KOOPSUZDUK<small>Электрощиты и шкафы · по ГОСТ</small></div>`, 'cover'));

  // 2. Вступление, содержание, ГОСТ
  const TOC = { '01': 4, '02': 7, '03': 8, '04': 9, '05': 10, '06': 11 };
  const G = [
    ['ГОСТ 16523-97', 'Прокат тонколистовой из углеродистой стали', 'Корпуса и двери — холоднокатаная сталь 0,5–1,2 мм'],
    ['ГОСТ 14254-2015', 'Степени защиты оболочек (код IP)', 'Исполнения IP31, IP54 — уплотнитель, замки IP54'],
    ['ГОСТ 32397-2020', 'Щитки распределительные для производственных и общественных зданий', 'Конструкция ЩРн, ЩМП, этажных щитов'],
    ['ГОСТ Р 51628-2000', 'Щитки распределительные для жилых зданий', 'Этажные щиты с окошками под счётчики'],
    ['ГОСТ Р 51844-2009', 'Шкафы пожарные. Общие технические требования', 'Шкафы ШПК и пожарные щиты, красный RAL 3000'],
    ['ГОСТ 5089-2011', 'Замки и защёлки для дверей', 'Почтовые замки ЗП 16–20 мм, ригельные и IP54'],
    ['ГОСТ 17475, ГОСТ 5927', 'Винты и гайки (DIN 965, DIN 934)', 'Крепёж монтажных панелей и петель'],
  ];
  pages.push(page(`
    <div class="intro"><h2>KOOZ KOOPSUZDUK</h2>
      <p>«Надёжная защита» — электрощиты, сантехнические, этажные и пожарные щиты MATKASYM для жилых комплексов и коммерческих объектов. Собственное производство в Бишкеке: серийно и по техлисту застройщика, с учётом требований ГОСТ.</p></div>
    <div>${SECTIONS.map(s => `<div class="toc-row"><span class="n">${s.n}</span><span class="t">${s.title}<span class="m">${s.note}</span></span><span class="p">${String(TOC[s.n]).padStart(2, '0')}</span></div>`).join('')}</div>
    <div><h2 style="margin-bottom:3mm">Производим по ГОСТ</h2>
    <table class="tbl gost-tbl"><thead><tr><th>Стандарт</th><th>Что регулирует</th><th>Как применяем</th></tr></thead>
      <tbody>${G.map(g => `<tr><td class="b">${g[0]}</td><td>${g[1]}</td><td>${g[2]}</td></tr>`).join('')}</tbody></table></div>
    <div class="stats kz-stats">
      <div><b>${all.length}+</b><span>типоразмеров на сайте</span></div>
      <div><b>0,5–1,2 мм</b><span>холоднокатаная сталь</span></div>
      <div><b>IP31 – IP54</b><span>степень защиты</span></div>
      <div><b>RAL</b><span>любой цвет по каталогу</span></div>
    </div>`));

  // 3. Исполнения: цвета, материалы, опции, примеры
  pages.push(page(`
    ${head('Исполнения', 'Цвета, материалы и опции', 'Каждое изделие сопровождается техлистом на согласование. Цвет и комплектацию подбираем под проект здания; стандарт — светло-серый RAL 7035 шагрень.')}
    <div class="swatches">${COLORS.map(([c, n, t]) => `<div class="sw2"><i style="background:${c}"></i><b>${n}</b><span>${t}</span></div>`).join('')}</div>
    <div class="cust-cols">
      <div><div class="s-kind">Материалы</div><ul class="list"><li>Холоднокатаная сталь 0,5–1,2 мм (${STEEL})</li><li>Оцинкованная сталь 0,7 мм — для улицы</li><li>Нержавеющая сталь — IP44 с козырьком</li><li>Монтажная панель — оцинковка 1,5 мм</li></ul></div>
      <div><div class="s-kind">Опции под заказ</div><ul class="list"><li>Фальшпанель, DIN-рейки, монтажная панель</li><li>Окошки под счётчики, 3–8 шт.</li><li>Замки: почтовый ЗП, ригельный, IP54, кодовый</li><li>Логотип застройщика, нумерация квартир</li><li>Сальники, кабельные вводы, вентиляция</li></ul></div>
    </div>
    <div class="fam-strip kz-ex">${['et1', 'f4', 'gas', 'ip44'].map(k => `<div><img src="${ph(k, 600)}" alt=""></div>`).join('')}</div>
    <div class="kz-why">
      <div><b>Техлист на согласование</b><span>Чертёж и спецификация до запуска партии</span></div>
      <div><b>Порошковая покраска</b><span>Шагрень или мат, любой цвет RAL</span></div>
      <div><b>Партии под объект</b><span>От одного щита до всего ЖК</span></div>
      <div><b>Доставка на объект</b><span>По Бишкеку и регионам</span></div>
    </div>`));

  // 5–8. IP-щиты
  pages.push(page(`${secHead('01')}${fam({ kind: 'Навесные электрощиты', title: 'Электрощиты IP31', photo: ph('ip31'),
    lead: 'Для квартир, офисов, подъездов и торговых помещений. Собственное серийное производство.',
    sp: [['Степень защиты', 'IP31'], ['Материал', `сталь ${STEEL}, 0,5–0,9 мм`], ['Покрытие', 'порошковая краска, RAL 7035 / 9006 шагрень'], ['Замок', 'почтовый ЗП 16 мм; у ЩРн — IP54'], ['Внутри', 'монтажная панель, по заказу фальшпанель']],
    rs: R.ip31 })}`));
  pages.push(page(`<div class="duo2">
    ${fam({ kind: 'Щиты монтажные', title: 'ЩМП IP54', photo: ph('ip54', 900), lead: 'Пыле- и влагозащищённые — подвалы, паркинги, техпомещения.',
      sp: [['Степень защиты', 'IP54'], ['Материал', 'сталь х/к 0,9 мм, ГОСТ 16523-97'], ['Монтажная панель', 'оцинковка 1,5 мм'], ['Дверь', 'уплотнитель, замок IP54'], ['Цвет', 'RAL 7035']], rs: R.ip54, variant: false })}
    ${fam({ kind: 'С монтажной панелью', title: 'Электрощиты IP30', photo: ph('ip30', 900), lead: 'Навесные щиты увеличенной глубины для щитовых и техпомещений.',
      sp: [['Степень защиты', 'IP30'], ['Покрытие', 'порошковая краска'], ['Цвет', 'светло-серый'], ['Дверь', 'одна, с замком']], rs: R.ip30, variant: false })}
  </div>`));
  pages.push(page(`<div class="duo2">
    ${fam({ kind: 'Нержавейка и сталь', title: 'Уличные IP44', photo: ph('ip44', 900), lead: 'Для улицы, стройплощадок и наружного освещения: козырёк, вентиляция.',
      sp: [['Степень защиты', 'IP44'], ['Материал', 'нержавейка или сталь с покрытием'], ['Защита', 'козырёк, вентрешётки'], ['Замок', 'ручка с замком']],
      rs: [...R.ip44.map(r => ({ ...r, v: 'нержавейка' })), ...R.rain.map(r => ({ ...r, v: r.v.replace('навесной, с козырьком', 'с козырьком') }))] })}
    ${fam({ kind: 'Газовое оборудование', title: 'Щиты газовые', photo: ph('gas', 900), lead: 'Для газовых счётчиков и кранов на фасадах домов. Размер — по проекту газоснабжения.',
      sp: [['Материал', 'сталь 0,5 мм'], ['Покрытие', 'порошковая краска'], ['Цвет', 'жёлтый RAL 1018'], ['Замок', 'почтовый ЗП 20 мм'], ['Исполнение', 'вертикальный, горизонтальный']], rs: R.gas })}
  </div>`));
  // 9. Сантехнические
  pages.push(page(`${secHead('02')}${fam({ kind: 'Ревизионные щиты', title: 'Щиты сантехнические', photo: ph('san1'),
    lead: 'Закрывают стояки и узлы учёта воды в квартирах и подъездах. Встраиваемые, с рамкой, одно- и двухдверные.',
    sp: [['Материал', `сталь ${STEEL}, 0,7–0,9 мм`], ['Двери', '1 или 2, петли пружинные или мебельные'], ['Замок', 'почтовый ЗП 16 мм'], ['Цвет', 'RAL 7035 / 9006 / 9016, по проекту'], ['Размер', 'любой — по нише заказчика']],
    rs: R.san })}`));

  // 10. Этажные
  pages.push(page(`${secHead('03')}${fam({ kind: 'Для жилых домов', title: 'Щиты этажные', photo: ph('et1'),
    lead: 'Отсек под счётчики с окошками и отсек слаботочки. Делаем по проекту дома: число квартир на этаже, двери, окошки, фальшпанели.',
    sp: [['Материал', `сталь ${STEEL}, 0,9 мм`], ['Окошки', '3–8 под счётчики, по заказу с логотипом'], ['Двери', '1–3, замки IP54 или ригельные'], ['Степень защиты', 'IP31'], ['Цвет', 'RAL 7035, 9006, по проекту']],
    rs: R.et })}`));

  // 11. Пожарные
  pages.push(page(`${secHead('04')}${fam({ kind: 'По ГОСТ Р 51844-2009', title: 'Шкафы и щиты пожарные', photos: ['f3', 'f4', 'f5', 'f6'].map(k => ph(k, 700)),
    lead: 'Шкафы для пожарных кранов (ШПК) и щиты для огнетушителей и инвентаря — навесные и встраиваемые.',
    sp: [['Материал', `сталь ${STEEL}, 0,9 мм`], ['Цвет', 'красный RAL 3000 / 3002, шагрень'], ['Двери', '1–2, откидные или распашные'], ['Замок', 'ригельный 84×72 или под ключ'], ['Комплектация', 'полки, паз под рукав, окно — по заказу']],
    rs: R.fire })}`));

  // 12. ВРУ, боксы, люки
  const vru = byId[PHOTO.vru], box = all.filter(p => /коробка обратной цепи/i.test(p.nm)), luk = all.filter(p => /люк/i.test(p.nm));
  const boxRow = p => [(p.nm.match(/(\d+)\s*(цеп|контур)/i) || [])[1] + ' модулей', /наружн/i.test(p.nm) ? 'накладной' : 'встраиваемый', p.price];
  pages.push(page(`${secHead('05')}<div class="duo2">
    ${fam({ kind: 'Вводно-распределительные', title: 'ВРУ', photo: ph('vru', 900), lead: 'Напольные ВРУ для жилых и коммерческих зданий, в т. ч. реверсивные с боковыми панелями.',
      sp: [['GGD 220 × 80 × 60 см', tag(vru?.price || 0)], ['ВРУ 180 × 80 × 45 см', tag(0)], ['ВРУ 150 × 140 × 40 см (наружный)', tag(0)], ['Материал', 'сталь 1,2 мм, ГОСТ 16523-97']] })}
    <article class="fam">${head('Модульные боксы', 'Распределительные IP40', 'Металлопластиковые боксы под автоматы.')}
      <div class="fam-photo fam-photo--s"><img src="${ph('box2', 900)}" alt=""></div>
      <table class="tbl kz-tbl"><thead><tr><th>Модулей</th><th>Монтаж</th><th class="r">Цена</th></tr></thead><tbody>
      ${box.map(boxRow).sort((a, b) => parseInt(a[0]) - parseInt(b[0]) || a[1].localeCompare(b[1])).map(r => `<tr><td class="b">${r[0]}</td><td>${r[1]}</td><td class="r">${money(r[2])}</td></tr>`).join('')}
      ${luk.map(p => `<tr><td class="b">Люк ${sizeText(sizeOf(p.nm))}</td><td>потолочный, магнитный</td><td class="r">${money(p.price)}</td></tr>`).join('')}</tbody></table></article>
  </div>`, 'p-vru'));

  // 13. Под заказ по проекту — типы с NAS отдела разработки
  const NAS = [['Щиты ВРУ', '1500×1400×400, 1800×800×450, реверсивные'], ['Щит распределительный встраиваемый', 'до 1200×1500×150'],
    ['Щиты серверные (IT)', '550×320×350, слаботочные 400×300×100'], ['ЩМП IP31 / IP54', 'до 1800×1200×300'], ['Щиты пожарные', 'до 1700×600×300, в т. ч. для вентиляции'],
    ['Этажные щиты', 'до 1300×800×150, до 8 окошек'], ['Сантехнические щиты', 'до 1250×890×150, 1–2 двери'], ['Наружные щиты ЩПС', 'IP54, оцинковка'],
    ['Почтовые ящики, постаматы', 'кодовый замок, RAL 9005'], ['Люки и вентрешётки', 'ревизионные, магнитные']];
  pages.push(page(`${secHead('06')}
    <div class="cust-top"><div><div class="s-kind">Производство по техлисту</div>
      <h2 class="cust-h">Щиты под ваш объект</h2>
      <p class="cust-lead">Конструкторский отдел MATKASYM разработал больше 40 типов щитов для застройщиков Бишкека. Пришлите проект или спецификацию — подготовим техлист на согласование и изготовим партию с учётом требований ГОСТ.</p>
      <div class="ask cust-ask"><span>Стоимость партии</span>${tag(0)}</div></div></div>
    <table class="tbl gost-tbl"><thead><tr><th>Что делаем</th><th>Размеры и исполнение, мм</th></tr></thead>
      <tbody>${NAS.map(n => `<tr><td class="b">${n[0]}</td><td>${n[1]}</td></tr>`).join('')}</tbody></table>
    <div class="fam-strip kz-ex">${['et3', 'vru2', 'san3', 'f6'].map(k => `<div><img src="${ph(k, 600)}" alt=""></div>`).join('')}</div>
    <div class="order cust-steps"><div><h2>Как работаем</h2></div>
      <ol class="steps"><li>Присылаете проект, спецификацию или размеры и количество.</li><li>Готовим техлист с чертежом на согласование.</li>
        <li>Подписываем техлист, делаем образец.</li><li>Производим партию и доставляем на объект.</li></ol></div>`));

  // 14. Логотип и контакты
  pages.push(page(`<div class="end-logo"><img src="${SITE}/logos/logo-vertical.png" alt="MATKASYM"></div>
    <div class="order"><div><h2>Как заказать</h2><ol class="steps"><li>Выберите щиты по каталогу или пришлите проект.</li>
      <li>Позвоните или напишите — подготовим техлист и расчёт.</li><li>Приезжайте на производство посмотреть образцы.</li></ol></div>
      <dl class="contacts"><div><dt>Телефон</dt><dd class="big">+996 501 111 726<br>+996 504 200 067</dd></div>
        <div><dt>Instagram</dt><dd>@matkasym_shaar</dd></div><div><dt>Почта</dt><dd>matkasymovllc@gmail.com</dd></div>
        <div><dt>Адрес</dt><dd>с. Маевка, ул. Тепличная, уч. 1/2</dd></div></dl></div>`));

  const EXTRA = `
.cover-grid--white { background:#fff; gap:6mm; padding:28mm 10mm 10mm; }
.cover-grid--white div { display:flex; align-items:center; justify-content:center; }
.cover-grid--white img { width:auto !important; height:auto !important; max-width:100%; max-height:100%; object-fit:contain; }
.fam { flex:1 1 0; min-height:0; display:flex; flex-direction:column; gap:5mm; }
.fam-body { display:grid; grid-template-columns:44% 1fr; gap:8mm; align-items:center; flex:1 1 0; min-height:0; }
.fam-photo { height:100%; min-height:0; display:flex; align-items:center; justify-content:center; }
.fam-photo img { max-width:100%; max-height:100%; object-fit:contain; }
.fam-photo--s { flex:0 0 40mm; }
.fam-strip { flex:0 0 62mm; display:grid; grid-template-columns:repeat(3,1fr); gap:6mm; border-top:1px solid var(--line); padding-top:5mm; }
.fam-strip div { min-height:0; display:flex; align-items:center; justify-content:center; }
.fam-strip img { max-width:100%; max-height:100%; object-fit:contain; }
.fam-grid { display:grid; grid-template-columns:1fr 1fr; grid-template-rows:1fr 1fr; gap:5mm; min-height:0; }
.fam-grid div { min-height:0; display:flex; align-items:center; justify-content:center; }
.fam-grid img { max-width:100%; max-height:100%; object-fit:contain; }
.fam .dl { margin-top:0; }
.fam-right { display:flex; flex-direction:column; gap:6mm; align-self:start; }
.fam-body { align-items:stretch; }
.duo2 .fam-body { display:flex; flex-direction:column; }
.duo2 .fam-photo { flex:0 0 92mm; min-height:0; max-height:none; }
.duo2 .fam-photo img { max-height:100%; }
.mini { display:grid; grid-template-columns:30mm 1fr 1fr; gap:6mm; align-items:center; border-top:1px solid var(--line); padding-top:5mm; }
.mini-photo img { width:100%; height:auto; }
.kz-tbl { font-size:8.2pt; }
.kz-tbl td { padding:1.1mm 2mm 1.1mm 0; }
.duo2 { flex:1 1 0; min-height:0; display:grid; grid-template-columns:1fr 1fr; gap:9mm; }
.duo2 .fam-body { grid-template-columns:1fr; grid-template-rows:auto auto; }
.duo2 .fam-photo img { max-height:92mm; }
.duo2 h2 { font-size:14pt; }
.gost-tbl td { white-space:normal; padding:1.6mm 3mm 1.6mm 0; vertical-align:top; }
.gost-tbl td.b { white-space:nowrap; }
.kz-why, .kz-stats { display:grid; grid-template-columns:repeat(4,1fr); border-top:1px solid var(--metal); margin-top:auto; }
.kz-why div, .kz-stats div { padding:4mm 4mm 0 0; }
.kz-why div + div, .kz-stats div + div { padding-left:4mm; border-left:1px solid var(--line); }
.kz-why b { display:block; font-family:Montserrat, Helvetica, sans-serif; font-weight:600; font-size:10pt; }
.kz-why span, .kz-stats span { display:block; margin-top:1.5mm; color:var(--mute); font-size:7.6pt; }
.kz-stats b { display:block; font-family:Montserrat, Helvetica, sans-serif; font-weight:600; font-size:18pt; line-height:1; }
.swatches { display:grid; grid-template-columns:repeat(4,1fr); gap:6mm; }
.sw2 i { display:block; height:22mm; border:1px solid var(--line); border-radius:1mm; margin-bottom:2mm; }
.sw2 b { display:block; font-family:Montserrat, Helvetica, sans-serif; font-weight:600; }
.sw2 span { color:var(--mute); font-size:7.6pt; }
.kz-ex { flex:1 1 0; min-height:0; grid-template-columns:repeat(4,1fr); }
.kz-why { margin-top:0; }
.p-vru .duo2 .fam-photo { flex:0 0 110mm; }
.p-vru .duo2 .fam-photo img { max-height:110mm; }
.p-vru .fam-photo--s { flex:0 0 70mm; }
.p-vru .fam-photo--s img { max-height:70mm; }
.cust-steps { margin-top:0; }
.end-logo { flex:1 1 0; display:flex; align-items:center; justify-content:center; }
.end-logo img { width:70mm; height:auto; }
`;
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8">${LIGHT_META}<title>Каталог KOOZ KOOPSUZDUK</title>
<style>${CSS}${EXTRA}</style></head><body>${pages.join('\n')}</body></html>`;
  const htmlFile = path.join(OUT, 'kooz-koopsuzduk.html');
  fs.writeFileSync(htmlFile, html);
  const pdf = path.join(OUT, 'Каталог KOOZ KOOPSUZDUK.pdf');
  execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--no-pdf-header-footer',
    '--virtual-time-budget=90000', `--print-to-pdf=${pdf}`, `file://${htmlFile}`], { stdio: 'ignore', timeout: 240000 });
  console.log('PDF:', pdf, `(${pageNo} стр.)`);
  for (const [k, r] of Object.entries(R)) console.log(k, r.length);
  if (process.argv.includes('--upload')) {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
    const up = await require('../lib/cloudinary').uploader.upload(pdf, { resource_type: 'raw', public_id: 'matkasym/catalogs/kooz-koopsuzduk.pdf', overwrite: true, invalidate: true });
    console.log('Залит на сайт:', up.secure_url);
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
