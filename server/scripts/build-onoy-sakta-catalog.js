// Каталог ONOY SAKTA в PDF (31.10.2026) — вёрстка в стиле UZAK KOLDON
// (build-uzak-koldon-catalog.js): белые полосы, разделы 01–04, цены в красной плашке.
//
// Товары берутся по артикулам: домашние ADIK HOME лежат в сете HOME baary-oorunda,
// промышленные — в onoi-sakta. Цены, размеры, полки и нагрузка — из базы.
// В базе есть дубли без артикула и без цвета (ROUND X3/X4, SLOTTED A3/A4) —
// берём только карточки с артикулом и цветом.
//
//   node scripts/build-onoy-sakta-catalog.js <папка для HTML и PDF> [--upload]
//
// --upload — залить PDF в Cloudinary (raw) matkasym/catalogs/onoy-sakta.pdf.

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
// b_white — прозрачные PNG на белом; e_trim — срезать белые поля, чтобы стеллаж был крупнее
// FLIP — кадры, где стеллаж развёрнут в другую сторону: зеркалим, чтобы все смотрели одинаково
const FLIP_SKUS = ['MKS-AH-G-M4-WHT', 'MKS-AH-R-S4-BLK', 'MKS-AH-S-A4-WHT', 'MKS-AH-S-C4-BLK', 'MKS-AH-R-X4-BLK'];
const FLIP = new Set();
const cut = (url, w) => url.replace('/upload/', `/upload/${FLIP.has(url) ? 'a_hflip/' : ''}b_white/e_trim:10/f_jpg,q_auto:good,w_${w},c_limit/`);
const room = (url, w) => url.replace('/upload/', `/upload/f_jpg,q_auto:good,w_${w},c_limit/`);
// Интерьеры, обработанные пользователем 31.10.2026 (люди убраны): matkasym/onoy-sakta/room-*
const ownRoom = (id, w) => `${CLOUD}/f_jpg,q_auto:good,w_${w},c_limit/matkasym/onoy-sakta/${id}`;

// ── Структура ──────────────────────────────────────────────────────────────
const SECTIONS = [
  { n: '01', title: 'Стеллажи на колёсах', note: 'Кухня, ванная, кладовка — двигаются вслед за вами' },
  { n: '02', title: 'Круглая стойка', note: 'Лёгкие стеллажи для дома и балкона' },
  { n: '03', title: 'Перфорированная стойка', note: 'Полки переставляются по высоте, нагрузка до 60 кг' },
  { n: '04', title: 'Промышленные стеллажи', note: 'Склады, гаражи, магазины и производства' },
  { n: '05', title: 'Индивидуальные заказы', note: 'Партии стеллажей по вашему техлисту' },
];
// стр. 3 — подбор по назначению, стр. 8 — паллетные и консольные
const TOC_PAGES = { '01': 4, '02': 5, '03': 6, '04': 7, '05': 9 };
const PAGE_PURPOSE = 3, PAGE_WAREHOUSE = 8;

// Модель = одна колонка: фото (photo — артикул, чьё images[0] печатаем) + цвета
const M = (v, skus, photo = skus[0]) => ({ v, skus, photo });
const BLOCKS = {
  guardail: { sec: '01', name: 'ADIK HOME GUARDAIL', kind: 'Стеллаж на колёсах',
    lead: 'Бортики по бокам держат вещи на полках, колёса с тормозом — стеллаж легко выкатить для уборки.',
    models: [M('GUARDAIL M3', ['MKS-AH-G-M3-WHT', 'MKS-AH-G-M3-BLK'], 'MKS-AH-G-M3-BLK'),
             M('GUARDAIL M4', ['MKS-AH-G-M4-WHT', 'MKS-AH-G-M4-BLK'], 'MKS-AH-G-M4-WHT')] },
  roundS: { sec: '02', name: 'ADIK HOME ROUND S', kind: 'Узкий стеллаж',
    lead: 'Ширина 50 см, глубина 30 см — встаёт в нишу, на балкон или рядом со стиральной машиной.',
    models: [M('ROUND S3', ['MKS-AH-R-S3-WHT', 'MKS-AH-R-S3-BLK']),
             M('ROUND S4', ['MKS-AH-R-S4-WHT', 'MKS-AH-R-S4-BLK'], 'MKS-AH-R-S4-BLK')] },
  roundX: { sec: '02', name: 'ADIK HOME ROUND X', kind: 'Стеллаж для дома',
    lead: 'Круглые стойки и регулируемые ножки: стоит ровно даже на неровном полу.',
    models: [M('ROUND X3', ['MKS-AH-R-X3-WHT']), M('ROUND X4', ['MKS-AH-R-X4-BLK']),
             M('ROUND X5', ['MKS-AH-R-X5-WHT', 'MKS-AH-R-X5-BLK'], 'MKS-AH-R-X5-BLK')] },
  slottedA: { sec: '03', name: 'ADIK HOME SLOTTED A', kind: 'Усиленный стеллаж',
    lead: 'Перфорированная стойка: полки переставляются через каждые несколько сантиметров. Ширина 120 см.',
    models: [M('SLOTTED A3', ['MKS-AH-S-A3-WHT', 'MKS-AH-S-A3-BLK'], 'MKS-AH-S-A3-BLK'),
             M('SLOTTED A4', ['MKS-AH-S-A4-WHT']),
             M('SLOTTED A5', ['MKS-AH-S-A5-WHT', 'MKS-AH-S-A5-BLK'], 'MKS-AH-S-A5-BLK')] },
  slottedB: { sec: '03', name: 'SLOTTED B и HOME C', kind: 'Ещё на перфорированной стойке',
    lead: 'Компактный B3 под стол или подоконник и высокий C4 на 2 метра для гаража и кладовой.',
    models: [M('SLOTTED B3', ['MKS-AH-S-B3-WHT', 'MKS-AH-S-B3-BLK'], 'MKS-AH-S-B3-BLK'),
             M('HOME C4', ['MKS-AH-S-C4-BLK'])] },
};

// ── Данные ─────────────────────────────────────────────────────────────────
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = n => n > 0 ? `${n.toLocaleString('ru-RU').replace(/ |,/g, ' ')} сом` : 'индивидуальный';
const tag = n => `<span class="tag">${money(n)}</span>`;
const spec = (p, re) => (p.specs || []).find(s => re.test(s.key || ''))?.value || '';
// «80x35x95» / «150х50х200» → «80 × 35 × 95»
// Размеры в базе — «ширина × глубина × высота»; в каталоге пишем каждое отдельно, иначе непонятно, где что
const dimsArr = s => { const m = String(s || '').match(/(\d+)\s*[xх*×]\s*(\d+)\s*[xх*×]\s*(\d+)/i); return m ? [m[1], m[2], m[3]] : ['', '', '']; };
const dimRows = d => [['Ширина', `${d[0]} см`], ['Глубина', `${d[1]} см`], ['Высота', `${d[2]} см`]];
const colorOf = p => (spec(p, /^цвет$/i) || (p.name.match(/\(([^)]+)\)/) || [])[1] || '').toLowerCase().replace('черный', 'чёрный');
const SW = { 'белый': '#f4f4f2', 'чёрный': '#1d1d1f' };

function modelData(m, bySku) {
  const items = m.skus.map(s => { if (!bySku[s]) throw new Error('нет товара ' + s); return bySku[s]; });
  const p = items[0];
  const shelves = +spec(p, /^полок$/i);
  return {
    v: m.v, photo: bySku[m.photo].images[0],
    desc: [shelves ? `${shelves} ${shelves === 3 ? 'полки' : shelves === 4 ? 'полки' : 'полок'}` : '',
      /есть/i.test(spec(p, /колёс/i)) ? 'на колёсах' : ''].filter(Boolean).join(' · '),
    dims: dimsArr(p.dimensions), load: spec(p, /нагрузк/i), shelves,
    colors: items.map(x => ({ c: colorOf(x), price: x.price })),
  };
}

// ── Вёрстка ────────────────────────────────────────────────────────────────
const LOGO = `${SITE}/logos/logo-main.png`;
let pageNo = 0;
const page = (body, cls = '') => {
  pageNo++;
  return `<section class="page ${cls}">${body}
    <footer class="foot"><span class="foot-l"><img src="${LOGO}" alt="MATKASYM"><i>ONOY SAKTA</i></span><span>${String(pageNo).padStart(2, '0')}</span></footer></section>`;
};
const secHead = n => { const s = SECTIONS.find(x => x.n === n);
  return `<div class="sec"><span class="sec-n">${s.n}</span><span class="sec-t">${s.title}</span><span class="sec-note">${s.note}</span></div>`; };
const head = b => `<div class="s-head"><div><div class="s-kind">${esc(b.kind)}</div><h2>${esc(b.name)}</h2></div><p class="s-lead">${esc(b.lead)}</p></div>`;

function modelCol(m) {
  return `<div class="mdl">
    <div class="m-photo dim" data-w="${m.dims[0]}" data-d="${m.dims[1]}" data-h="${m.dims[2]}"><img src="${cut(m.photo, 900)}" alt=""></div>
    <div class="m-name">${esc(m.v)}</div>
    <div class="m-desc">${esc(m.desc)}</div>
    <dl class="m-dl">
      <dt${m.load ? '' : ' class="ghost"'}>На полку</dt><dd${m.load ? '' : ' class="ghost"'}>${esc(m.load) || '—'}</dd>
    </dl>
    <div class="m-prices">${m.colors.map(c => `<div class="m-pr"><span><i style="background:${SW[c.c] || '#ccc'}"></i>${esc(c.c)}</span>${tag(c.price)}</div>`).join('')}</div>
  </div>`;
}
const block = b => `<article class="series">${head(b)}<div class="mdls" style="--n:${b.items.length}">${b.items.map(modelCol).join('')}</div></article>`;

// Промышленный стеллаж: фото слева, таблица справа
function wide({ kind, title, lead, photo, rows, extra, dims }) {
  return `<article class="series series--one"><div class="split">
    <div class="s-photo dim" data-w="${dims[0]}" data-d="${dims[1]}" data-h="${dims[2]}"><img src="${photo}" alt=""></div>
    <div><div class="s-kind">${esc(kind)}</div><h2>${esc(title)}</h2><p class="s-lead s-lead--l">${esc(lead)}</p>
      <dl class="dl">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>
      ${extra ? `<div class="s-extra"><img src="${extra}" alt=""></div>` : ''}</div>
  </div></article>`;
}

// Схема стеллажа в стиле техлиста: вид спереди с размерными линиями Ш и В
const RACK_SVG = (() => {
  const L = '#7d96a0', R = '#e10523';
  const shelves = [40, 105, 170, 235].map(y => `<rect x="40" y="${y}" width="180" height="6" fill="none" stroke="${L}" stroke-width="1.6"/>`).join('');
  const holes = [];
  for (let y = 30; y < 250; y += 9) holes.push(`<rect x="43" y="${y}" width="3" height="5" fill="${L}"/><rect x="214" y="${y}" width="3" height="5" fill="${L}"/>`);
  return `<svg viewBox="0 0 280 300" xmlns="http://www.w3.org/2000/svg" font-family="Roboto, Helvetica, Arial" font-size="10">
    <rect x="36" y="24" width="14" height="230" fill="none" stroke="#000" stroke-width="1.8"/>
    <rect x="210" y="24" width="14" height="230" fill="none" stroke="#000" stroke-width="1.8"/>
    ${holes.join('')}${shelves}
    <line x1="36" y1="272" x2="224" y2="272" stroke="${R}" stroke-width="1"/>
    <line x1="36" y1="266" x2="36" y2="278" stroke="${R}"/><line x1="224" y1="266" x2="224" y2="278" stroke="${R}"/>
    <text x="130" y="292" text-anchor="middle" fill="${R}">Ш — по техлисту</text>
    <line x1="250" y1="24" x2="250" y2="254" stroke="${R}" stroke-width="1"/>
    <line x1="244" y1="24" x2="256" y2="24" stroke="${R}"/><line x1="244" y1="254" x2="256" y2="254" stroke="${R}"/>
    <text x="264" y="139" text-anchor="middle" fill="${R}" transform="rotate(-90 264 139)">В — по техлисту</text>
    <line x1="60" y1="72" x2="60" y2="105" stroke="${L}" stroke-dasharray="3 2"/>
    <text x="66" y="92" fill="${L}">шаг полок</text>
  </svg>`;
})();

// Размерные линии со стрелками вокруг фото (рисуются в браузере после загрузки картинок):
// высота — вертикаль слева, ширина — горизонталь снизу, глубина — короткая наклонная
// стрелка у правого нижнего угла (все стеллажи сняты ближним краем слева, глубина уходит вправо).
const DIM_JS = `
window.addEventListener('load', () => {
  const MM = 96 / 25.4, C = '#7d96a0', T = '#4d4d4d';
  const arrow = (x1, y1, x2, y2) => {
    const a = Math.atan2(y2 - y1, x2 - x1), s = 1.6 * MM, w = 0.45;
    const head = (x, y, ang) => '<path d="M' + x + ' ' + y + ' L' + (x - s * Math.cos(ang - w)) + ' ' + (y - s * Math.sin(ang - w)) +
      ' L' + (x - s * Math.cos(ang + w)) + ' ' + (y - s * Math.sin(ang + w)) + ' Z" fill="' + C + '"/>';
    return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + C + '" stroke-width="0.9"/>' + head(x2, y2, a) + head(x1, y1, a + Math.PI);
  };
  // подложка — белый прямоугольник, а не обводка букв: обведённый текст Chrome пишет в PDF как Type 3
  const label = (x, y, t, rot) => { const bw = (t.length * 1.45 + 1.6) * MM, bh = 3.6 * MM, tr = rot ? ' transform="rotate(-90 ' + x + ' ' + y + ')"' : '';
    return '<g' + tr + '><rect x="' + (x - bw / 2) + '" y="' + (y - bh / 2) + '" width="' + bw + '" height="' + bh + '" fill="#fff"/>' +
      '<text x="' + x + '" y="' + y + '" fill="' + T + '" font-family="Roboto, Helvetica, Arial" font-size="' + (2.7 * MM) + '" font-weight="500" text-anchor="middle" dominant-baseline="middle">' + t + '</text></g>'; };
  document.querySelectorAll('.dim').forEach(box => {
    const img = box.querySelector('img'); if (!img || !img.naturalWidth) return;
    const { w, d, h } = box.dataset;
    box.style.position = 'relative'; box.style.padding = '0';
    const W = box.clientWidth, H = box.clientHeight;
    const L = 8 * MM, B = 7 * MM, R = 11 * MM, TOP = 1 * MM;
    const k = Math.min((W - L - R) / img.naturalWidth, (H - B - TOP) / img.naturalHeight);
    const iw = img.naturalWidth * k, ih = img.naturalHeight * k;
    const x0 = L + (W - L - R - iw) / 2, y0 = H - B - ih;
    Object.assign(img.style, { position: 'absolute', left: x0 + 'px', top: y0 + 'px', width: iw + 'px', height: ih + 'px', maxWidth: 'none', maxHeight: 'none' });
    const hx = x0 - 4 * MM, wy = y0 + ih + 4 * MM;
    // глубина: от правого нижнего угла вверх-вправо, под углом бока стеллажа
    const dx = 5 * MM, dy = dx * 0.55, ox = 1.5 * MM;
    const d1 = [x0 + iw + ox, y0 + ih + 1 * MM], d2 = [x0 + iw + ox + dx, y0 + ih + 1 * MM - dy];
    let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" style="position:absolute;left:0;top:0;overflow:visible">';
    svg += arrow(hx, y0, hx, y0 + ih) + label(hx, y0 + ih / 2, h + ' см', true);
    svg += arrow(x0, wy, x0 + iw, wy) + label(x0 + iw / 2, wy, w + ' см');
    if (d) svg += arrow(d1[0], d1[1], d2[0], d2[1]) + label(d2[0] - 0.5 * MM, d2[1] - 2.6 * MM, d + ' см');
    box.insertAdjacentHTML('beforeend', svg + '</svg>');
  });
});`;

// Шрифты — статичные файлы @fontsource, НЕ Google Fonts: тот отдаёт variable-шрифты, Chrome
// вшивает их в PDF как Type 3, и просмотрщики на Android не показывают текст вообще (31.10.2026)
const FONT_CSS = [['Roboto', 'roboto', [400, 500, 700]], ['Montserrat', 'montserrat', [500, 600, 700]]]
  .flatMap(([fam, pkg, ws]) => ws.flatMap(w => [['cyrillic', 'U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116'], ['latin', 'U+0000-00FF,U+2000-206F,U+20AC,U+2122,U+2190-21FF,U+2212']]
    .map(([sub, range]) => `@font-face { font-family:'${fam}'; font-style:normal; font-weight:${w}; font-display:block;
  src:url('https://cdn.jsdelivr.net/npm/@fontsource/${pkg}@5.1.0/files/${pkg}-${sub}-${w}-normal.woff2') format('woff2'); unicode-range:${range}; }`))).join('\n');

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

(async () => {
  await mongoose.connect(MONGO_URI);
  const col = mongoose.connection.db.collection('products');
  const all = await col.find({ $or: [{ set: 'onoi-sakta' }, { sku: /^MKS-AH-/ }] }).toArray();
  const bySku = Object.fromEntries(all.filter(p => p.sku).map(p => [p.sku, p]));
  for (const s of FLIP_SKUS) FLIP.add(bySku[s].images[0]);
  const B = {};
  for (const [k, b] of Object.entries(BLOCKS)) B[k] = { ...b, items: b.models.map(m => modelData(m, bySku)) };

  // Интерьеры без людей и без надписей — кадры с карточек на сайте
  const pic = (sku, i) => { const u = bySku[sku]?.images?.[i]; if (!u) throw new Error(`нет фото ${sku} #${i}`); return u; };
  // Обложка (по просьбе пользователя 31.10.2026): слева сверху паллетные, справа сверху MEDIUM,
  // снизу слева маленький на колёсах (GUARDAIL M3), справа без колёс — HOME C4 (надписи убраны e_gen_remove)
  const COVER = [ownRoom('room-pallet', 1300), ownRoom('room-medium', 1300), room(pic('MKS-AH-G-M3-BLK', 3), 1300), ownRoom('room-c4', 1300)];

  const light = bySku['MKS-OS-Х50'], medium = bySku['MKS-OS-Х60'];
  const pallet = all.find(p => p.sku === 'OS-PALLET'), canti = all.find(p => p.sku === 'OS-CANTILEVER');
  // Дополнительная секция MEDIUM (sub frame) — карточка без артикула
  const mediumSub = all.find(p => /ADIK STORAGE MEDIUM.*sub frame/i.test(p.name));

  const PALLET_PHOTO = cut(pallet.images[2], 1400), PALLET_PHOTO_S = cut(pallet.images[2], 240);
  // Чистого консольного на белом пока нет — правая половина общего кадра (OS-CANTILEVER #3)
  const cantiCut = w => canti.images[3].replace('/upload/', `/upload/c_crop,g_east,w_0.5/a_hflip/b_white/e_trim:10/f_jpg,q_auto:good,w_${w},c_limit/`);
  const CANTI_PHOTO = cantiCut(1400), CANTI_PHOTO_S = cantiCut(240);

  const blocks = Object.values(B);
  const models = blocks.reduce((a, b) => a + b.items.length, 0) + 2;

  const pages = [];
  // 1. Обложка
  pages.push(page(`
    <div class="cover-grid">${COVER.map(u => `<div><img src="${u}" alt=""></div>`).join('')}</div>
    <div class="cover-tab"><img src="${CLOUD}/f_png,w_600,c_limit/matkasym/uzak-koldon/logo-tab" alt="MATKASYM"></div>
    <div class="cover-plate">ONOY SAKTA<small>Металлические стеллажи</small></div>`, 'cover'));

  // 2. Вступление, содержание, подбор по размеру
  const minPrice = m => Math.min(...m.colors.map(c => c.price).filter(Boolean));
  const tblRows = blocks.map(b => `<tr class="g"><td colspan="7">${esc(b.name)}</td></tr>` + b.items.map(m => `<tr>
      <td class="b">${esc(m.v)}</td>${m.dims.map(x => `<td class="c">${x}</td>`).join('')}<td>${m.shelves || ''}</td><td>${esc(m.load)}</td>
      <td class="r">${m.colors.length > 1 ? 'от ' : ''}${money(minPrice(m))}</td></tr>`).join('')).join('')
    + `<tr class="g"><td colspan="7">ADIK STORAGE</td></tr>
      <tr><td class="b">LIGHT</td>${dimsArr(light.name).map(x => `<td class="c">${x}</td>`).join('')}<td></td><td></td><td class="r">${money(light.price)}</td></tr>
      <tr><td class="b">MEDIUM</td>${dimsArr(medium.name).map(x => `<td class="c">${x}</td>`).join('')}<td></td><td></td><td class="r">${money(medium.price)}</td></tr>`;
  pages.push(page(`
    <div class="intro">
      <h2>ONOY SAKTA</h2>
      <p>«Удобно хранить» — металлические стеллажи MATKASYM: ${models} моделей для дома, гаража и склада. Цены розничные. Какой выбрать — на странице 03.</p>
    </div>
    <div>${SECTIONS.map(s => `<div class="toc-row"><span class="n">${s.n}</span>
      <span class="t">${s.title}<span class="m">${s.note}</span></span><span class="p">${String(TOC_PAGES[s.n]).padStart(2, '0')}</span></div>`).join('')}</div>
    <div>
      <h2 style="margin-bottom:4mm">Подбор по размеру</h2>
      <table class="tbl"><thead><tr><th>Модель</th><th class="c">Ширина, см</th><th class="c">Глубина, см</th><th class="c">Высота, см</th><th>Полок</th><th>На полку</th><th class="r">Цена</th></tr></thead>
        <tbody>${tblRows}</tbody></table>
    </div>`));

  // 3. Подбор по назначению: помещение → подходящие модели с фото, ценой и страницей
  const IDX = {};
  for (const b of blocks) for (const m of b.items) IDX[m.v] = { img: cut(m.photo, 240), price: `${m.colors.length > 1 ? 'от ' : ''}${money(minPrice(m))}`, page: TOC_PAGES[b.sec] };
  IDX['STORAGE LIGHT'] = { img: cut(light.images[0], 240), price: money(light.price), page: TOC_PAGES['04'] };
  IDX['STORAGE MEDIUM'] = { img: cut(medium.images[0], 240), price: `от ${money(Math.min(medium.price, mediumSub?.price || Infinity))}`, page: TOC_PAGES['04'] };
  IDX['Паллетные'] = { img: PALLET_PHOTO_S, price: money(0), page: PAGE_WAREHOUSE };
  IDX['Консольные'] = { img: CANTI_PHOTO_S, price: money(0), page: PAGE_WAREHOUSE };
  IDX['По техлисту'] = { svg: RACK_SVG, price: money(0), page: TOC_PAGES['05'] };
  // Каждая модель — ровно в одной карточке (дубли убраны по просьбе пользователя 31.10.2026)
  const PURPOSES = [
    ['Кухня', 'Овощи, посуда, бытовая химия', ['GUARDAIL M3', 'GUARDAIL M4', 'ROUND S3']],
    ['Гостиная и детская', 'Книги, игрушки, коробки', ['ROUND X3', 'ROUND S4', 'SLOTTED B3']],
    ['Балкон и кладовка', 'Заготовки, инструменты, сезонные вещи', ['ROUND X4', 'ROUND X5']],
    ['Документы и офис', 'Папки тяжёлые — полки держат до 60 кг', ['SLOTTED A3', 'SLOTTED A4']],
    ['Гараж и мастерская', 'Инструмент, колёса, ящики', ['HOME C4', 'STORAGE LIGHT']],
    ['Магазин и подсобка', 'Товар и запас рядом с торговым залом', ['SLOTTED A5', 'STORAGE MEDIUM']],
    ['Склад', 'Тяжёлые грузы, паллеты, длинномеры', ['Паллетные', 'Консольные']],
    ['Большая партия', 'Нестандартные размеры, свой цвет и нагрузка — делаем партию по вашему техлисту.', ['По техлисту'], true],
  ];
  { const seen = PURPOSES.flatMap(p => p[2]); const dup = seen.filter((n, i) => seen.indexOf(n) !== i); if (dup.length) throw new Error('дубли в подборе: ' + dup); }
  pages.push(page(`
    <div class="s-head"><div><div class="s-kind">Какой стеллаж выбрать</div><h2>Подбор по назначению</h2></div>
      <p class="s-lead">Найдите своё помещение — рядом модели, которые подходят лучше всего, их цена и страница в каталоге.</p></div>
    <div class="purp">${PURPOSES.map(([t, hint, list, wide]) => `<article class="pp${wide ? ' pp--wide' : ''}">
      <h3>${esc(t)}</h3><p>${esc(hint)}</p>
      <ul>${list.map(n => { const x = IDX[n]; if (!x) throw new Error('нет модели ' + n);
        return `<li><span class="pp-img">${x.svg || `<img src="${x.img}" alt="">`}</span>
          <span class="pp-n"><b>${esc(n)}</b><i>${x.price}</i></span><span class="pp-p">${String(x.page).padStart(2, '0')}</span></li>`; }).join('')}</ul>
    </article>`).join('')}</div>`));

  // 4. На колёсах + где пригодится (интерьер убран по просьбе пользователя)
  pages.push(page(`${secHead('01')}${block(B.guardail)}
    <div class="uses">
      <div><div class="s-kind">Где пригодится</div>
        <ul class="list"><li>Кухня — овощи, посуда, бытовая химия</li><li>Ванная и прачечная</li><li>Детская — игрушки и книги</li><li>Рабочее место — бумаги и принтер</li></ul></div>
      <div><div class="s-kind">Особенности</div>
        <ul class="list"><li>Колёса с тормозом</li><li>Бортики — ничего не падает</li><li>Белый и чёрный цвет</li></ul></div>
    </div>`));
  // 4. Круглая стойка
  pages.push(page(`${secHead('02')}${block(B.roundS)}${block(B.roundX)}`));
  // 5. Перфорированная стойка
  pages.push(page(`${secHead('03')}${block(B.slottedA)}${block(B.slottedB)}`));
  // 6. Промышленные: LIGHT и MEDIUM
  pages.push(page(`${secHead('04')}
    ${wide({ kind: 'Промышленный стеллаж', title: 'ADIK STORAGE LIGHT', photo: cut(light.images[0], 1400), extra: ownRoom('room-light', 1000),
      lead: 'Усиленная рама с раскосами для гаража, мастерской и склада. Чёрный порошковый окрас.',
      dims: dimsArr(light.name), rows: [...dimRows(dimsArr(light.name)), ['Цена', tag(light.price)]] })}
    ${wide({ kind: 'Промышленный стеллаж', title: 'ADIK STORAGE MEDIUM', photo: cut(medium.images[0], 1400), extra: ownRoom('room-medium', 1000),
      lead: 'Синие стойки и серые полки шириной 2 метра. К основной секции можно пристроить дополнительную на общей стойке.',
      dims: dimsArr(medium.name), rows: [...dimRows(dimsArr(medium.name)), ['Основная секция', tag(medium.price)],
        ...(mediumSub ? [['Дополнительная секция', tag(mediumSub.price)]] : [])] })}`));
  // 7. Под заказ
  pages.push(page(`
    <div class="s-head"><div><div class="s-kind">Проект под ваш склад</div><h2>Складские системы</h2></div>
      <p class="s-lead">Паллетные и консольные стеллажи рассчитываем под помещение: высота, число ярусов, нагрузка, проходы для погрузчика.</p></div>
    <div class="banner"><img src="${ownRoom('room-pallet', 1800)}" alt=""></div>
    <div class="proj">
      <article><div class="p-photo"><img src="${PALLET_PHOTO}" alt=""></div>
        <div class="s-kind">${esc(pallet.category)}</div><h2>Паллетные стеллажи</h2>
        <p>Для хранения грузов на поддонах. Ярусы под высоту склада, балки под вес паллеты.</p>
        <div class="ask"><span>Расчёт</span>${tag(0)}</div></article>
      <article><div class="p-photo"><img src="${CANTI_PHOTO}" alt=""></div>
        <div class="s-kind">${esc(canti.category)}</div><h2>Консольные стеллажи</h2>
        <p>Для длинномеров: трубы, профиль, доски, листовой металл. Одно- и двусторонние.</p>
        <div class="ask"><span>Расчёт</span>${tag(0)}</div></article>
    </div>
    <div class="order" style="grid-template-columns:1fr">
      <ol class="steps"><li>Присылаете размеры помещения и что храните.</li><li>Готовим схему и расчёт.</li><li>Привозим и монтируем.</li></ol>
    </div>`));
  // 8. Индивидуальные заказы — партии по техлисту заказчика
  pages.push(page(`${secHead('05')}
    <div class="cust-top">
      <div><div class="s-kind">Производство под заказ</div>
        <h2 class="cust-h">Стеллажи по вашему техлисту</h2>
        <p class="cust-lead">Берём индивидуальные заказы на стеллажи большими партиями. Пришлите техлист, чертёж
          или эскиз — конструкторский отдел MATKASYM подготовит чертёж и расчёт, а производство изготовит
          партию под ваши размеры, нагрузку и цвет.</p>
        <div class="ask cust-ask"><span>Стоимость партии</span>${tag(0)}</div>
      </div>
      <div class="cust-draw">${RACK_SVG}</div>
    </div>
    <div class="cust-cols">
      <div><div class="s-kind">Что меняем под вас</div>
        <ul class="list"><li>Ширина, глубина и высота — под помещение и товар</li><li>Количество полок и расстояние между ними</li>
          <li>Нагрузка на полку — подбираем толщину металла</li><li>Цвет порошковой покраски по каталогу RAL</li>
          <li>Тип стойки: круглая, перфорированная, промышленная</li><li>Колёса, бортики, перегородки, логотип</li></ul></div>
      <div><div class="s-kind">Для кого</div>
        <ul class="list"><li>Магазины и торговые сети</li><li>Склады и логистические компании</li><li>Производства и мастерские</li>
          <li>Школы, офисы, больницы, архивы</li><li>Застройщики и дилеры</li></ul></div>
    </div>
    <div class="cust-stats">
      <div><b>Конструкторский отдел</b><span>Чертёж и расчёт по вашему техлисту</span></div>
      <div><b>Лазерная резка и гибка</b><span>Стойки и полки на своём оборудовании</span></div>
      <div><b>Порошковая покраска</b><span>Любой цвет по каталогу RAL</span></div>
      <div><b>Доставка и монтаж</b><span>Привозим и собираем на объекте</span></div>
    </div>
    <div class="order cust-steps">
      <div><h2>Как работаем</h2></div>
      <ol class="steps"><li>Присылаете техлист, чертёж или эскиз и нужное количество.</li>
        <li>Конструкторы готовят чертёж и расчёт стоимости.</li>
        <li>Согласовываем образец.</li>
        <li>Производим партию, доставляем и при необходимости монтируем.</li></ol>
    </div>`));
  // Последняя полоса: групповое фото всей линейки (пользователь делает по ПРОМПТ.txt из папки
  // «групповое фото» → Cloudinary matkasym/onoy-sakta/group). Пока его нет — интерьер SLOTTED A5.
  // Коллаж из вырезанных фото пользователь отверг: разные ракурсы, нужен единый кадр.
  const groupUrl = `${CLOUD}/f_jpg,q_auto:good,w_1800,c_limit/matkasym/onoy-sakta/group`;
  const hasGroup = (await fetch(groupUrl, { method: 'HEAD' })).ok;
  const END = hasGroup
    ? `<div class="s-head"><div><div class="s-kind">Вся линейка</div><h2>ONOY SAKTA</h2></div>
      <p class="s-lead">${models} моделей — от этажерки 80 см до промышленного стеллажа на 2 метра. Подберём под квартиру, гараж, магазин или склад.</p></div>
    <div class="end-photo end-photo--fit"><img src="${groupUrl}" alt=""></div>`
    : `<div class="end-photo"><img src="${room(pic('MKS-AH-S-A5-WHT', 3), 1800)}" alt=""></div>`;

  // 9. Как заказать
  pages.push(page(`
    ${END}
    <div class="order">
      <div><h2>Как заказать</h2>
        <ol class="steps">
          <li>Выберите модель и цвет по каталогу.</li>
          <li>Позвоните или напишите нам — уточним наличие и доставку.</li>
          <li>Приезжайте в шоурум посмотреть стеллажи вживую.</li>
        </ol></div>
      <dl class="contacts">
        <div><dt>Телефон</dt><dd class="big">+996 501 111 726<br>+996 504 200 067</dd></div>
        <div><dt>Instagram</dt><dd>@matkasym_shaar</dd></div>
        <div><dt>Почта</dt><dd>matkasymovllc@gmail.com</dd></div>
        <div><dt>Адрес</dt><dd>с. Маевка, ул. Тепличная, уч. 1/2</dd></div>
      </dl>
    </div>`));

  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Каталог ONOY SAKTA</title>
<style>${CSS}</style></head><body>${pages.join('\n')}<script>${DIM_JS}</script></body></html>`;
  const htmlFile = path.join(OUT, 'onoy-sakta.html');
  fs.writeFileSync(htmlFile, html);
  const pdf = path.join(OUT, 'Каталог ONOY SAKTA.pdf');
  execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--virtual-time-budget=90000',
    `--print-to-pdf=${pdf}`, `file://${htmlFile}`], { stdio: 'ignore', timeout: 240000 });
  console.log('PDF:', pdf, `(${pageNo} стр.)`);
  if (process.argv.includes('--upload')) {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
    const cloudinary = require('../lib/cloudinary');
    const up = await cloudinary.uploader.upload(pdf, { resource_type: 'raw', public_id: 'matkasym/catalogs/onoy-sakta.pdf', overwrite: true, invalidate: true });
    console.log('Залит на сайт:', up.secure_url);
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
