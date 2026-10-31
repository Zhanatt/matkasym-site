// Каталог MAZZA SEYIL в PDF (31.10.2026) — вёрстка как у ONOY SAKTA / UZAK KOLDON:
// обложка-коллаж, содержание, подбор по месту установки, разделы 01–06, размеры стрелками,
// цены в красной плашке, «индивидуальный» там, где розничной цены в базе нет.
//
// Товары берутся по _id (у велопарковок нет артикулов). Не печатаем дубли без фото:
// «Velopark 5 (9 местная)» и «скамейка Jyrgal Park (деревянный» (категория other).
// Кривые размеры из базы («Диаметр3метр», «2000х450х430» в мм) приводятся здесь, в DIMS;
// сама база не меняется.
//
//   node scripts/build-mazza-seyil-catalog.js <папка для HTML и PDF> [--upload]
//
// --upload — залить PDF в Cloudinary (raw) matkasym/catalogs/mazza-seyil.pdf (кнопка «PDF» сета).

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
// FLIP — кадры, где изделие развёрнуто ближним краем вправо: зеркалим, чтобы все смотрели одинаково
// (проверка — нижняя точка силуэта слева или справа). Koopsuzbike не зеркалим: на панели надпись.
const FLIP_IDS = ['6a23a1b5a94b9094a84fa23e', '6a23c2629c5e3c48479dacff', '6a643e57228fc37217d7a34e', '6a05bddc7f2c7b50e4597c9d'];
const FLIP = new Set();
// NOBG — кадры на сером фоне (Koopsuzbike, стойка): фон убирает Cloudinary e_background_removal
const NOBG_IDS = ['6a7ef66da47d9fa5e219000b', '6a7efa52ff1030c8b93e9e22'];
const NOBG = new Set();
const cut = (url, w) => url.replace('/upload/', `/upload/${FLIP.has(url) ? 'a_hflip/' : ''}${NOBG.has(url) ? 'e_background_removal/' : ''}b_white/e_trim:10/f_jpg,q_auto:good,w_${w},c_limit/`);
const room = (url, w) => url.replace('/upload/', `/upload/f_jpg,q_auto:good,w_${w},c_limit/`);

// ── Структура ──────────────────────────────────────────────────────────────
const SECTIONS = [
  { n: '01', title: 'Скамейки без спинки', note: 'Набережные, скверы, зоны ожидания' },
  { n: '02', title: 'Скамейки со спинкой', note: 'Парки, дворы, школы и офисы' },
  { n: '03', title: 'Скамейки с навесом', note: 'Тень и защита от дождя' },
  { n: '04', title: 'Освещение', note: 'Аллеи, дорожки и площади' },
  { n: '05', title: 'Велопарковки', note: 'От стойки на одно место до велостанции на 20' },
  { n: '06', title: 'Индивидуальные заказы', note: 'Малые архитектурные формы по вашему проекту' },
];
const TOC_PAGES = { '01': 4, '02': 5, '03': 7, '04': 8, '05': 10, '06': 12 };
const PAGE_KOOPSUZ = 11, PAGE_NURJOL_MINI = 9; // отдельные полосы KOOPSUZBIKE и NURJOL mini
const PAGE_PURPOSE = 3;

// id товара → подпись в каталоге, короткое описание, размеры [ширина, глубина, высота] в см
// (ширина = длина скамейки). Пусто — в базе размеров нет, стрелки не рисуем.
// Оценены по фото 31.10.2026 (в базе и техлистах нет, пользователь просил «примерно предположи»):
// JYLUU, Ailana (выс.), KÖLÖKÖ, все фонари, Velopark 7, BP velopark, стойка. Seyil — из техлиста ОсОО Монс.
const P = {
  jyrgalDem:  { id: '6a23a1b5a94b9094a84fa23e', v: 'Jyrgal Dem',  desc: 'Металлический корпус, деревянное сиденье', dims: ['200', '45', '43'] },
  jyrgalPark: { id: '6a05bec87f2c7b50e45986ee', v: 'Jyrgal Park', desc: 'Деревянное сиденье на металлическом каркасе', dims: ['200', '45', '43'] }, // как у Jyrgal Dem (сказал пользователь)
  seyil:      { id: '6a23c2629c5e3c48479dacff', v: 'Seyil',       desc: 'Металлический каркас, деревянное сиденье', dims: ['200', '65', '85'] },
  jyluu:      { id: '6a1d49b2393874d4c353b447', v: 'JYLUU',       desc: 'Изогнутые боковины, деревянные ламели', dims: ['200', '65', '80'] },
  yngai:      { id: '6a646a5356c79e863c5a72bd', v: 'Yngai',       desc: 'Подлокотники, порошковая покраска каркаса', dims: ['200', '46', '85'] },
  kichine:    { id: '6a643e54228fc37217d7a32c', v: 'Kichine',     desc: 'Компактная, с подлокотниками', dims: ['120', '45', '80'] },
  kalyn:      { id: '6a643e56228fc37217d7a342', v: 'Kalyn',       desc: 'Термообработанная лиственница или дуб', dims: ['180', '50', '85'] },
  demAluu:    { id: '6a643e57228fc37217d7a34e', v: 'Dem Aluu',    desc: 'Массив ясеня или лиственницы', dims: ['180', '45', '80'] },
  salttyk:    { id: '6a643e5b228fc37217d7a370', v: 'Salttyk',     desc: 'Классическая, с подлокотниками', dims: ['150–170', '40–45', '85–90'] },
  ailana:     { id: '6a1d373ea7d1feff77747b47', v: 'Ailana',      desc: 'Круглая скамейка вокруг дерева', dims: ['300', '300', '80'] },
  esAluu:     { id: '6a05bddc7f2c7b50e4597c9d', v: 'ES ALUU',     desc: 'Изогнутый деревянный навес', dims: ['200', '140', '230'] },
  bakyt:      { id: '6a23c5a162432d59269b0287', v: 'Bakyt',       desc: '6–8 мест, обшивка из термодревесины', dims: ['160', '50', '220'] },
  koloko:     { id: '6a05c3217f2c7b50e45989ec', v: 'KÖLÖKÖ',      desc: 'Навес-тень для скамейки', dims: ['200', '120', '240'] },
  nurjolMini: { id: '6a1d3ddea7d1feff7774904a', v: 'NURJOL mini', desc: 'Ландшафтный светильник-столбик', dims: ['20', '20', '80'], scaleH: 100 },
  nurjol:     { id: '6a1d3af4a7d1feff777485bb', v: 'Nurjol Standart', desc: 'Парковый фонарь', dims: ['40', '20', '300'] },
  burkut:     { id: '6a1d55f1654da1cc132f5a32', v: 'Bürküt',      desc: 'Фонарь с двумя светильниками', dims: ['250', '30', '600'], scaleH: 600 },
  skeitPark:  { id: '6ae5c8112600514b6a809ffa', v: 'Skeit Park',  desc: 'Силуэт скейтбордиста, металл 5 мм, антрацит', dims: ['250', '30', '800'] },
  velo5:      { id: '6aa12ee03c2e09e2836f3fd9', v: 'Velopark 5',  desc: 'Арочная, на 5 мест', dims: ['160', '39', '47,5'] },
  velo7:      { id: '6a7ef672a47d9fa5e2190020', v: 'Velopark 7',  desc: 'Арочная двусторонняя, на 8 мест', dims: ['210', '75', '60'], photo: 'https://res.cloudinary.com/dnbg21ef8/image/upload/v1793447135/matkasym/mazza-seyil/velopark-7.png' }, // фото от пользователя 31.10.2026
  bp:         { id: '6a7ef663a47d9fa5e2190001', v: 'BP velopark', desc: 'Модульная, силуэт велосипеда лазером', dims: ['150', '60', '80'] },
  stoika:     { id: '6a7efa52ff1030c8b93e9e22', v: 'Koopsuzbike Stoika', desc: 'Одиночная стойка, крепление на 4 анкера', dims: ['70', '15', '90'] },
  kbike:      { id: '6a7ef66da47d9fa5e219000b', v: 'Koopsuzbike', desc: 'Крытая велостанция на 20 мест, насос и ремонтная станция', dims: ['900', '240', '250'], price: 118500, from: true },
};
const BLOCKS = {
  noBack:  { fixed: true, sec: '01', name: 'Без спинки', kind: 'Скамейки без спинки', lead: 'Длинные скамейки для набережных, скверов и зон ожидания: садятся с обеих сторон.', keys: ['jyrgalDem', 'jyrgalPark'] },
  back1:   { fixed: true, sec: '02', name: 'Со спинкой', kind: 'Парковые скамейки', lead: 'Металлический каркас с порошковой покраской и деревянные ламели.', keys: ['seyil', 'jyluu', 'yngai'] },
  back2:   { fixed: true, sec: '02', name: 'Серия Skameyka', kind: 'Скамейки со спинкой', lead: 'Классические скамейки длиной от 120 до 180 см для дворов, школ и офисов.', keys: ['kichine', 'kalyn'] },
  back3:   { fixed: true, sec: '02', name: 'Серия Skameyka', kind: 'Скамейки со спинкой', lead: 'Подлокотники с двух сторон — удобно вставать пожилым людям.', keys: ['demAluu', 'salttyk'] },
  roof:    { fixed: true, photoH: 100, sec: '03', name: 'С навесом', kind: 'Скамейки с навесом', lead: 'Навес даёт тень летом и укрывает от дождя — для дворов, парков и остановок.', keys: ['esAluu', 'bakyt', 'koloko'] },
  light:   { sec: '04', name: 'Освещение', kind: 'Уличные светильники', lead: 'Парковые фонари в одном стиле со скамейками — от 3 до 8 метров.', keys: ['nurjol', 'burkut', 'skeitPark'] },
  bike1:   { sec: '05', name: 'Велопарковки', kind: 'Открытые', lead: 'Крепятся анкерами к бетону или асфальту, порошковая покраска в любой цвет RAL.', keys: ['velo5', 'velo7'] },
  bike2:   { sec: '05', name: 'Модульные и одиночные', kind: 'Велопарковки', lead: 'Модульная BP velopark под заказ и одиночная стойка KOOPSUZBIKE — та же, что стоит в велостанции, продаётся отдельно.', keys: ['bp', 'stoika'] },
};

// ── Данные ─────────────────────────────────────────────────────────────────
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = n => n > 0 ? `${n.toLocaleString('ru-RU').replace(/ |,/g, ' ')} сом` : 'индивидуальный';
const priceText = m => `${m.from && m.price ? 'от ' : ''}${money(m.price)}`;
const tag = n => `<span class="tag">${money(n)}</span>`;
const dimRows = d => [['Ширина', d[0]], ['Глубина', d[1]], ['Высота', d[2]]].filter(([, v]) => v).map(([k, v]) => [k, `${v} см`]);

// ── Вёрстка ────────────────────────────────────────────────────────────────
const LOGO = `${SITE}/logos/logo-main.png`;
let pageNo = 0;
const page = (body, cls = '') => {
  pageNo++;
  return `<section class="page ${cls}">${body}
    <footer class="foot"><span class="foot-l"><img src="${LOGO}" alt="MATKASYM"><i>MAZZA SEYIL</i></span><span>${String(pageNo).padStart(2, '0')}</span></footer></section>`;
};
const secHead = n => { const s = SECTIONS.find(x => x.n === n);
  return `<div class="sec"><span class="sec-n">${s.n}</span><span class="sec-t">${s.title}</span><span class="sec-note">${s.note}</span></div>`; };
const head = b => `<div class="s-head"><div><div class="s-kind">${esc(b.kind)}</div><h2>${esc(b.name)}</h2></div><p class="s-lead">${esc(b.lead)}</p></div>`;

function modelCol(m) {
  const d = m.dims;
  return `<div class="mdl">
    <div class="m-photo dim" data-w="${d[0] || ''}" data-d="${d[1] || ''}" data-h="${d[2] || ''}"${m.hs ? ` data-g="${m.g}" data-hs="${m.hs}"` : ''}><img src="${cut(m.photo, 900)}" alt=""></div>
    <div class="m-name">${esc(m.v)}</div>
    <div class="m-desc">${esc(m.desc)}</div>
    <div class="m-prices"><div class="m-pr"><span>Цена</span>${tag(m.price)}</div></div>
  </div>`;
}
const block = b => `<article class="series${b.fixed ? ' series--fixed' : ''}"${b.photoH ? ` style="--ph:${b.photoH}mm"` : ''}>${head(b)}<div class="mdls" style="--n:${b.items.length}">${b.items.map(modelCol).join('')}</div></article>`;

// Фото слева — таблица справа (Ailana, Koopsuzbike, BP velopark)
function wide({ kind, title, lead, photo, rows, dims = [] }) {
  return `<article class="series series--one"><div class="split">
    <div class="s-photo dim" data-w="${dims[0] || ''}" data-d="${dims[1] || ''}" data-h="${dims[2] || ''}"><img src="${photo}" alt=""></div>
    <div><div class="s-kind">${esc(kind)}</div><h2>${esc(title)}</h2><p class="s-lead s-lead--l">${esc(lead)}</p>
      <dl class="dl">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl></div>
  </div></article>`;
}

// Схема скамейки в стиле техлиста для листа индивидуальных заказов
const BENCH_SVG = (() => {
  const L = '#7d96a0', R = '#e10523';
  const slats = [70, 84, 98].map(y => `<rect x="40" y="${y}" width="200" height="9" fill="none" stroke="${L}" stroke-width="1.5"/>`).join('')
    + [150, 164].map(y => `<rect x="40" y="${y}" width="200" height="9" fill="none" stroke="${L}" stroke-width="1.5"/>`).join('');
  return `<svg viewBox="0 0 290 290" xmlns="http://www.w3.org/2000/svg" font-family="Roboto, Helvetica, Arial" font-size="10">
    ${slats}
    <path d="M52 60 L52 230 M228 60 L228 230" stroke="#000" stroke-width="5" fill="none"/>
    <path d="M40 182 L240 182" stroke="#000" stroke-width="3"/>
    <line x1="40" y1="250" x2="240" y2="250" stroke="${R}"/><line x1="40" y1="244" x2="40" y2="256" stroke="${R}"/><line x1="240" y1="244" x2="240" y2="256" stroke="${R}"/>
    <text x="140" y="270" text-anchor="middle" fill="${R}">Длина — по проекту</text>
    <line x1="262" y1="60" x2="262" y2="230" stroke="${R}"/><line x1="256" y1="60" x2="268" y2="60" stroke="${R}"/><line x1="256" y1="230" x2="268" y2="230" stroke="${R}"/>
    <text x="278" y="145" text-anchor="middle" fill="${R}" transform="rotate(-90 278 145)">Высота — по проекту</text>
  </svg>`;
})();
// Размерные линии со стрелками вокруг фото (рисуются в браузере после загрузки картинок):
// высота — вертикаль слева, ширина — горизонталь снизу, глубина — короткая наклонная
// стрелка у правого нижнего угла. Нет размера в базе — нет и стрелки.
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
  const ppcm = {};
  document.querySelectorAll('.dim[data-g]').forEach(box => {
    const img = box.querySelector('img'); if (!img || !img.naturalWidth) return;
    const fit = Math.min((box.clientWidth - 19 * MM) / img.naturalWidth, (box.clientHeight - 8 * MM) / img.naturalHeight) * img.naturalHeight;
    const g = box.dataset.g; ppcm[g] = Math.min(ppcm[g] ?? Infinity, fit / +box.dataset.hs);
  });
  document.querySelectorAll('.dim').forEach(box => {
    const img = box.querySelector('img'); if (!img || !img.naturalWidth) return;
    const { w, d, h } = box.dataset;
    box.style.position = 'relative'; box.style.padding = '0';
    const W = box.clientWidth, H = box.clientHeight;
    const L = 8 * MM, B = 7 * MM, R = 11 * MM, TOP = 1 * MM;
    let k = Math.min((W - L - R) / img.naturalWidth, (H - B - TOP) / img.naturalHeight);
    // ряд в общем масштабе: data-hs — реальная высота в см, px на см — по самому тесному фото ряда
    if (box.dataset.g) k = ppcm[box.dataset.g] * +box.dataset.hs / img.naturalHeight;
    const iw = img.naturalWidth * k, ih = img.naturalHeight * k;
    const x0 = L + (W - L - R - iw) / 2, y0 = H - B - ih;
    Object.assign(img.style, { position: 'absolute', left: x0 + 'px', top: y0 + 'px', width: iw + 'px', height: ih + 'px', maxWidth: 'none', maxHeight: 'none' });
    const hx = x0 - 4 * MM, wy = y0 + ih + 4 * MM;
    // глубина: от правого нижнего угла вверх-вправо, под углом бока стеллажа
    const dx = 5 * MM, dy = dx * 0.55, ox = 1.5 * MM;
    const d1 = [x0 + iw + ox, y0 + ih + 1 * MM], d2 = [x0 + iw + ox + dx, y0 + ih + 1 * MM - dy];
    let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" style="position:absolute;left:0;top:0;overflow:visible">';
    if (h) svg += arrow(hx, y0, hx, y0 + ih) + label(hx, y0 + ih / 2, h + ' см', true);
    if (w) svg += arrow(x0, wy, x0 + iw, wy) + label(x0 + iw / 2, wy, w + ' см');
    if (d) svg += arrow(d1[0], d1[1], d2[0], d2[1]) + label(d2[0] - 0.5 * MM, d2[1] - 2.6 * MM, d + ' см');
    box.insertAdjacentHTML('beforeend', svg + '</svg>');
  });
});`;

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

(async () => {
  await mongoose.connect(MONGO_URI);
  const col = mongoose.connection.db.collection('products');
  const ids = Object.values(P).map(p => new mongoose.Types.ObjectId(p.id));
  const rows = await col.find({ _id: { $in: ids } }).toArray();
  const byId = Object.fromEntries(rows.map(p => [String(p._id), p]));
  for (const id of FLIP_IDS) FLIP.add(byId[id].images[0]);
  for (const id of NOBG_IDS) NOBG.add(byId[id].images[0]);
  // Cloudinary убирает фон асинхронно — прогреваем все размеры, чтобы Chrome получил готовые кадры
  for (const u of [...NOBG].flatMap(u => [240, 900, 1000].map(w => cut(u, w)))) {
    for (let i = 0; i < 20; i++) { const r = await fetch(u); if (r.ok && /image/.test(r.headers.get('content-type') || '')) break; await new Promise(s => setTimeout(s, 3000)); }
  }
  const M = {};
  for (const [k, p] of Object.entries(P)) {
    const d = byId[p.id]; if (!d) throw new Error('нет товара ' + p.v);
    if (!d.images?.length) throw new Error('нет фото ' + p.v);
    M[k] = { ...p, key: k, photo: p.photo || d.images[0], price: p.price ?? (d.price || 0), doc: d };
  }
  const B = {};
  for (const [k, b] of Object.entries(BLOCKS)) B[k] = { ...b, items: b.keys.map(x => M[x]) };
  // Фонари — в одном масштабе по реальной высоте (scaleH — только для масштаба, если высоты в базе нет;
  // не печатается): иначе столбик NURJOL mini выходил выше 8-метрового Skeit Park
  for (const [k, b] of Object.entries(B)) if (b.scaleTo) b.items = b.items.map(m => ({ ...m, g: k, hs: +m.dims[2] || m.scaleH }));
  const pic = (k, i) => { const u = M[k].doc.images?.[i]; if (!u) throw new Error(`нет фото ${k} #${i}`); return u; };
  const models = Object.keys(M).length;
  // ВелоСТО: интерьер с карточки Koopsuzbike #1, текстовая плашка убрана (e_gen_remove) → matkasym/mazza-seyil/velosto-room
  const VELOSTO = `${CLOUD}/matkasym/mazza-seyil/kb-sto.png`; // ВелоСТО из макета пользователя
  // Панель с картой Кыргызстана: Koopsuzbike #2 без нижней плашки с текстом
  const MAP_ROOM = pic('kbike', 2).replace('/upload/', '/upload/c_crop,g_north,h_0.76/f_jpg,q_auto:good,w_1800,c_limit/');

  const pages = [];
  // 1. Обложка: интерьеры без людей и надписей с карточек сайта
  const COVER = [pic('esAluu', 2), pic('jyluu', 1), pic('nurjol', 1), pic('bakyt', 1)].map(u => room(u, 1300));
  pages.push(page(`
    <div class="cover-grid">${COVER.map(u => `<div><img src="${u}" alt=""></div>`).join('')}</div>
    <div class="cover-tab"><img src="${CLOUD}/f_png,w_600,c_limit/matkasym/uzak-koldon/logo-tab" alt="MATKASYM"></div>
    <div class="cover-plate">MAZZA SEYIL<small>Скамейки · освещение · велопарковки</small></div>`, 'cover'));

  // 2. Вступление, содержание, сводная таблица
  const sec = Object.fromEntries(Object.values(BLOCKS).flatMap(b => b.keys.map(k => [k, b.sec])));
  sec.ailana = '02'; sec.kbike = '05'; sec.stoika = '05'; sec.nurjolMini = '04';
  const groups = SECTIONS.filter(s => s.n !== '06').map(s => [s, Object.keys(M).filter(k => sec[k] === s.n)]);
  const tbl = groups.map(([s, keys]) => `<tr class="g"><td colspan="5">${esc(s.title)}</td></tr>` + keys.map(k => { const m = M[k], d = m.dims;
    return `<tr><td class="b">${esc(m.v)}</td><td class="c">${d[0] || '—'}</td><td class="c">${d[1] || '—'}</td><td class="c">${d[2] || '—'}</td><td class="r">${priceText(m)}</td></tr>`; }).join('')).join('');
  pages.push(page(`
    <div class="intro">
      <h2>MAZZA SEYIL</h2>
      <p>«Приятная прогулка» — скамейки, уличное освещение и велопарковки MATKASYM для парков, дворов и общественных пространств. ${models} моделей. Где поставить — на странице 03.</p>
    </div>
    <div>${SECTIONS.map(s => `<div class="toc-row"><span class="n">${s.n}</span>
      <span class="t">${s.title}<span class="m">${s.note}</span></span><span class="p">${String(TOC_PAGES[s.n]).padStart(2, '0')}</span></div>`).join('')}</div>
    <div>
      <h2 style="margin-bottom:4mm">Все модели</h2>
      <table class="tbl"><thead><tr><th>Модель</th><th class="c">Ширина, см</th><th class="c">Глубина, см</th><th class="c">Высота, см</th><th class="r">Цена</th></tr></thead>
        <tbody>${tbl}</tbody></table>
    </div>`));

  // 3. Подбор по месту установки — каждая модель ровно в одной карточке
  const IDX = Object.fromEntries(Object.entries(M).map(([k, m]) => [k, { n: m.v, img: cut(m.photo, 240), price: priceText(m), page: k === 'kbike' ? PAGE_KOOPSUZ : k === 'nurjolMini' ? PAGE_NURJOL_MINI : TOC_PAGES[sec[k]] }]));
  IDX.velosto = { n: 'ВелоСТО', img: room(VELOSTO, 240), price: 'от 24 300 сом', page: PAGE_KOOPSUZ };
  IDX.custom = { n: 'По проекту', svg: BENCH_SVG, price: money(0), page: TOC_PAGES['06'] };
  const PLACES = [
    ['Парк и сквер', 'Длинные скамейки и круглая вокруг дерева', ['seyil', 'jyrgalPark', 'ailana']],
    ['Двор жилого комплекса', 'Для мам с колясками и пожилых жильцов', ['jyluu', 'kalyn', 'bakyt']],
    ['Набережная и зоны отдыха', 'Скамейки без спинки и с навесом от солнца', ['jyrgalDem', 'yngai', 'esAluu']],
    ['Школа, вуз, офис', 'Компактные скамейки у входа и во дворе', ['kichine', 'demAluu', 'salttyk']],
    ['Аллеи и дорожки', 'Свет в одном стиле со скамейками', ['nurjolMini', 'nurjol', 'burkut']],
    ['Площадка и скейт-парк', 'Навес-тень и фонарь со спортивным силуэтом', ['koloko', 'skeitPark']],
    ['Подъезд и детская площадка', 'Компактные велопарковки и станция ремонта', ['velo5', 'velo7', 'velosto']],
    ['ТЦ, АЗС, бизнес-центр', 'Велопарковки с фирменным видом и велостанция', ['bp', 'stoika', 'kbike']],
    ['Большой объект', 'Своя форма, размер и цвет — по вашему проекту', ['custom']],
  ];
  { const seen = PLACES.flatMap(p => p[2]); const dup = seen.filter((n, i) => seen.indexOf(n) !== i); if (dup.length) throw new Error('дубли в подборе: ' + dup);
    const miss = Object.keys(M).filter(k => !seen.includes(k)); if (miss.length) throw new Error('нет в подборе: ' + miss); }
  pages.push(page(`
    <div class="s-head"><div><div class="s-kind">Что куда поставить</div><h2>Подбор по месту</h2></div>
      <p class="s-lead">Найдите своё место — рядом модели, которые подходят лучше всего, их цена и страница в каталоге.</p></div>
    <div class="purp">${PLACES.map(([t, hint, list]) => `<article class="pp">
      <h3>${esc(t)}</h3><p>${esc(hint)}</p>
      <ul>${list.map(k => { const x = IDX[k];
        return `<li><span class="pp-img">${x.svg || `<img src="${x.img}" alt="">`}</span>
          <span class="pp-n"><b>${esc(x.n)}</b><i>${x.price}</i></span><span class="pp-p">${String(x.page).padStart(2, '0')}</span></li>`; }).join('')}</ul>
    </article>`).join('')}</div>`));

  // 4. Без спинки + где ставят
  pages.push(page(`${secHead('01')}${block(B.noBack)}
    <div class="room-band room-band--fill"><img src="${pic('kalyn', 1).replace('/upload/', '/upload/c_crop,g_west,w_0.9/f_jpg,q_auto:good,w_1800,c_limit/')}" alt=""></div>
    <div class="uses">
      <div><div class="s-kind">Где ставят</div>
        <ul class="list"><li>Набережные и бульвары</li><li>Скверы и площади</li><li>Зоны ожидания у ТЦ и вокзалов</li><li>Санатории и зоны отдыха</li></ul></div>
      <div><div class="s-kind">Особенности</div>
        <ul class="list"><li>Садятся с обеих сторон</li><li>Металлический корпус с порошковой покраской</li><li>Деревянное сиденье</li></ul></div>
    </div>`));
  // 5–6. Со спинкой
  pages.push(page(`${secHead('02')}${block(B.back1)}${block(B.back2)}`));
  const ail = M.ailana;
  pages.push(page(`${block(B.back3)}
    <article class="ail">
      <div class="ail-photo"><img src="${cut(ail.photo, 2000)}" alt=""></div>
      <div class="ail-text">
        <div><div class="s-kind">Круглая скамейка</div><h2>Ailana</h2></div>
        <p class="s-lead">Скамейка по кругу вокруг дерева или клумбы: деревянная спинка в центре, сиденье по всей окружности.</p>
        <dl class="dl"><dt>Диаметр</dt><dd>300 см</dd><dt>Высота</dt><dd>80 см</dd><dt>Цена</dt><dd>${tag(ail.price)}</dd></dl>
      </div>
    </article>`));
  // 7. С навесом + интерьер
  // Навесы — строками (фото слева, текст справа), без интерьера снизу: так фото крупнее (просил пользователь)
  const dimText = d => d.filter(Boolean).length ? [['Ширина', d[0]], ['Глубина', d[1]], ['Высота', d[2]]].filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${v} см</dd>`).join('') : '';
  pages.push(page(`${secHead('03')}
    <div class="s-head"><div><div class="s-kind">${esc(B.roof.kind)}</div><h2>${esc(B.roof.name)}</h2></div><p class="s-lead">${esc(B.roof.lead)}</p></div>
    <div class="rows">${B.roof.items.map(m => `<article class="row">
      <div class="row-photo dim" data-w="${m.dims[0] || ''}" data-d="${m.dims[1] || ''}" data-h="${m.dims[2] || ''}"><img src="${cut(m.photo, 1400)}" alt=""></div>
      <div class="row-text"><h3 class="kb-h">${esc(m.v)}</h3><p class="m-desc">${esc(m.desc)}</p>
        <dl class="dl">${dimText(m.dims)}<dt>Цена</dt><dd>${tag(m.price)}</dd></dl></div>
    </article>`).join('')}</div>`));
  // 8. Освещение: три высоких фонаря, каждый во всю высоту колонки (просил пользователь 31.10.2026;
  // общий масштаб по высоте делал их мелкими). Высота — подписью-стрелкой.
  // Фото без фона и обрезаны по силуэту; ширина каждой колонки = ширине фонаря при общей высоте h,
  // h — максимальная, при которой три фонаря помещаются в ширину полосы (178 мм минус промежутки)
  const sharp = require('sharp');
  const lampUrl = m => m.photo.replace('/upload/', '/upload/e_background_removal/e_trim:20/f_png,h_1600,c_limit/');
  const lamps = [];
  for (const m of B.light.items) {
    let buf;
    for (let i = 0; i < 25; i++) { const r = await fetch(lampUrl(m)); if (r.ok && /png/.test(r.headers.get('content-type') || '')) { buf = Buffer.from(await r.arrayBuffer()); break; } await new Promise(z => setTimeout(z, 3000)); }
    if (!buf) throw new Error('не удалось убрать фон у ' + m.v);
    const { width, height } = await sharp(buf).metadata();
    lamps.push({ m, r: width / height });
  }
  const GAP = 8, LH = Math.min(178, (178 - GAP * (lamps.length - 1)) / lamps.reduce((a, x) => a + x.r, 0));
  const hText = m => m.dims[2] ? `Высота ${+m.dims[2] / 100} м` : '';
  pages.push(page(`${secHead('04')}${head(B.light)}
    <div class="lamps" style="gap:${GAP}mm">${lamps.map(({ m, r }) => `<div class="lamp" style="width:${(r * LH).toFixed(1)}mm">
      <div class="lamp-img" style="height:${LH.toFixed(1)}mm"><img src="${lampUrl(m)}" alt=""></div>
      <div class="m-name">${esc(m.v)}</div><div class="m-desc">${esc([hText(m), m.desc].filter(Boolean).join(' · '))}</div>
      <div class="lamp-price">${tag(m.price)}</div></div>`).join('')}</div>`));
  // 9. NURJOL mini — отдельной полосой, крупно, чтобы маленький светильник не терялся рядом с 8-метровым
  const nm = M.nurjolMini;
  pages.push(page(`
    <div class="s-head"><div><div class="s-kind">Ландшафтное освещение</div><h2>NURJOL mini</h2></div>
      <p class="s-lead">Светильник-столбик для дорожек, газонов и клумб: мягкий свет снизу, не слепит.</p></div>
    <div class="nm">
      <div class="nm-photo"><img src="${cut(nm.photo, 1400)}" alt=""></div>
      <div class="nm-side">
        <dl class="dl"><dt>Высота</dt><dd>80 см</dd><dt>Сечение</dt><dd>20 × 20 см</dd><dt>Корпус</dt><dd>металл</dd><dt>Цена</dt><dd>${tag(nm.price)}</dd></dl>
        <div class="nm-room"><img src="${room(pic('nurjolMini', 1), 1200)}" alt=""></div>
      </div>
    </div>`));
  // 10. Велопарковки: два ряда по две
  const kb = M.kbike;
  pages.push(page(`${secHead('05')}${block(B.bike1)}${block(B.bike2)}`));
  // 11. KOOPSUZBIKE — один в один по макету пользователя (32.png): VELOSTOP слева + фото в парке,
  // рендер во всю ширину с текстом, ВелоСТО: фото слева + характеристики. Фото вырезаны из макета.
  const kbImg = (id, w) => `${CLOUD}/f_jpg,q_auto:good,w_${w},c_limit/matkasym/mazza-seyil/${id}`;
  const priceFrom = n => `<div class="kb-price"><span>цена от</span>${tag(n)}</div>`;
  pages.push(page(`
    <div class="sec"><span class="sec-t">Велопарковка KOOPSUZBIKE</span><span class="sec-note">Велостанция и станция ремонта</span></div>
    <div class="kb-a">
      <div><div class="s-kind">Велостанция</div><h2>VELOSTOP</h2>
        <dl class="dl"><dt>Габариты (В × Ш × Д)</dt><dd>2,5 × 2,4 × 9 м</dd><dt>Материал</dt><dd>металл</dd>
          <dt>Подсветка</dt><dd>есть</dd><dt>Мест</dt><dd>20</dd></dl>
        ${priceFrom(118500)}</div>
      <div class="kb-img"><img src="${kbImg('kb-park', 1400)}" alt=""></div>
    </div>
    <div class="kb-render"><img src="${kbImg('kb-render', 2000)}" alt=""></div>
    <p class="kb-text">Для установки возле государственных, административных, образовательных, медицинских, культурных и торгово-развлекательных учреждений. Подходит для парков, жилых комплексов, бизнес-центров, транспортных узлов, АЗС, парковок, спортивных объектов, веломаршрутов, туристических зон и общественных пространств.</p>
    <div class="kb-b">
      <div class="kb-img"><img src="${kbImg('kb-sto', 1200)}" alt=""></div>
      <div><div class="s-kind">Станция технического обслуживания (СТО)</div><h2>ВелоСТО</h2>
        <dl class="dl"><dt>Габариты (В × Ш × Д)</dt><dd>150 × 4 × 4 см</dd><dt>Материал</dt><dd>металл</dd>
          <dt>Инструменты для ремонта</dt><dd>есть</dd><dt>Насос</dt><dd>есть</dd></dl>
        ${priceFrom(24300)}</div>
    </div>`));
  // 12. Индивидуальные заказы
  pages.push(page(`${secHead('06')}
    <div class="cust-top">
      <div><div class="s-kind">Производство под заказ</div>
        <h2 class="cust-h">Благоустройство по вашему проекту</h2>
        <p class="cust-lead">Делаем скамейки, навесы, светильники и велопарковки по проекту благоустройства или
          техническому заданию. Конструкторский отдел MATKASYM подготовит чертёж и расчёт, производство изготовит
          партию под ваши размеры, цвет и фирменный стиль.</p>
        <div class="ask cust-ask"><span>Стоимость партии</span>${tag(0)}</div>
      </div>
      <div class="cust-draw">${BENCH_SVG}</div>
    </div>
    <div class="cust-cols">
      <div><div class="s-kind">Что меняем под вас</div>
        <ul class="list"><li>Длина, высота, форма спинки и подлокотников</li><li>Порода дерева и покрытие ламелей</li>
          <li>Цвет каркаса по каталогу RAL</li><li>Логотип или узор, вырезанные лазером</li><li>Способ крепления: анкеры, закладные, бетонирование</li></ul></div>
      <div><div class="s-kind">Для кого</div>
        <ul class="list"><li>Мэрии и городские службы</li><li>Застройщики жилых комплексов</li><li>Парки, санатории, зоны отдыха</li>
          <li>Школы, вузы, больницы</li><li>ТЦ, АЗС, бизнес-центры</li></ul></div>
    </div>
    <div class="cust-stats">
      <div><b>Конструкторский отдел</b><span>Чертёж и расчёт по вашему проекту</span></div>
      <div><b>Лазерная резка и гибка</b><span>Каркасы и узоры на своём оборудовании</span></div>
      <div><b>Порошковая покраска</b><span>Любой цвет по каталогу RAL</span></div>
      <div><b>Доставка и монтаж</b><span>Привозим и устанавливаем на объекте</span></div>
    </div>
    <div class="order cust-steps">
      <div><h2>Как работаем</h2></div>
      <ol class="steps"><li>Присылаете проект, эскиз или ТЗ и нужное количество.</li>
        <li>Конструкторы готовят чертёж и расчёт стоимости.</li>
        <li>Согласовываем образец.</li>
        <li>Производим, доставляем и устанавливаем.</li></ol>
    </div>`));
  // Последняя полоса: логотип по центру и контакты снизу (групповое фото не нужно — сказал пользователь 31.10.2026)
  const END = `<div class="end-logo"><img src="${SITE}/logos/logo-vertical.png" alt="MATKASYM"></div>`;
  // 13. Как заказать
  pages.push(page(`
    ${END}
    <div class="order">
      <div><h2>Как заказать</h2>
        <ol class="steps">
          <li>Выберите модели по каталогу или пришлите проект.</li>
          <li>Позвоните или напишите нам — уточним сроки и доставку.</li>
          <li>Приезжайте в шоурум посмотреть изделия вживую.</li>
        </ol></div>
      <dl class="contacts">
        <div><dt>Телефон</dt><dd class="big">+996 501 111 726<br>+996 504 200 067</dd></div>
        <div><dt>Instagram</dt><dd>@matkasym_shaar</dd></div>
        <div><dt>Почта</dt><dd>matkasymovllc@gmail.com</dd></div>
        <div><dt>Адрес</dt><dd>с. Маевка, ул. Тепличная, уч. 1/2</dd></div>
      </dl>
    </div>`));

  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8">${LIGHT_META}<title>Каталог MAZZA SEYIL</title>
<style>${CSS}
.m-prices { min-height:0; }
/* скамейки низкие и широкие: фото фиксированной высоты, блок не растягивается на страницу */
.series--fixed { flex:0 0 auto; }
.series--fixed .mdls { flex:0 0 auto; }
.series--fixed .m-photo { flex:0 0 var(--ph, 74mm); }
.room-band--fill { flex:1 1 0; height:auto; min-height:0; }
.toc-row .m { display:none; }
.toc-row { padding:1.6mm 0; }
.tbl td { padding:.5mm 2mm .6mm 0; }
/* в четыре колонки подпись «Цена» не помещается рядом с «индивидуальный» */
.mdls[style*="--n:4"] .m-pr > span:first-child { display:none; }
.mdls[style*="--n:4"] .m-pr { justify-content:flex-start; }
.tbl .g td { padding-top:1.4mm; }
.room-band { height:72mm; flex:0 0 auto; overflow:hidden; }
.room-band img { width:100%; height:100%; object-fit:cover; }
.duo { display:grid; grid-template-columns:1fr 1fr; gap:8mm; flex:1 1 0; min-height:0; border-top:1px solid var(--line); padding-top:6mm; }
.lamps { flex:0 0 auto; margin-top:auto; display:flex; justify-content:center; align-items:flex-start; }
.ail { flex:1 1 0; min-height:0; display:flex; flex-direction:column; gap:5mm; border-top:1px solid var(--line); padding-top:6mm; }
.ail-photo { flex:1 1 0; min-height:0; display:flex; align-items:center; justify-content:center; }
.ail-photo img { width:100%; height:100%; object-fit:contain; }
.ail-text { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8mm; align-items:start; }
.ail-text .s-lead { justify-self:start; }
.ail-text .dl { margin-top:0; }
.lamp { min-width:42mm; display:flex; flex-direction:column; }
.lamp-img { display:flex; justify-content:center; align-items:flex-end; padding-bottom:3mm; }
.lamp-img img { height:100%; width:auto; max-width:none; }
.lamp-price { margin-top:2mm; }
.rows { flex:1 1 0; min-height:0; display:grid; grid-template-rows:repeat(3, minmax(0,1fr)); }
.row { display:grid; grid-template-columns:58% 1fr; gap:9mm; align-items:center; min-height:0; border-top:1px solid var(--line); padding:4mm 0; }
.row-photo { height:100%; min-height:0; }
.row-text .dl { margin-top:3mm; }
.nm { flex:1 1 0; min-height:0; display:grid; grid-template-columns:45% 1fr; gap:10mm; }
.nm-photo { height:100%; min-height:0; display:flex; align-items:center; justify-content:center; }
.nm-photo img { max-height:100%; max-width:100%; object-fit:contain; }
.nm-side { display:flex; flex-direction:column; gap:8mm; min-height:0; }
.nm-room { flex:1 1 0; min-height:0; overflow:hidden; }
.nm-room img { width:100%; height:100%; object-fit:cover; }
.kb-a, .kb-b { display:grid; grid-template-columns:1fr 1fr; gap:9mm; align-items:start; }
.kb-a h2, .kb-b h2 { margin-bottom:3mm; }
.kb-img { overflow:hidden; }
.kb-a .kb-img { height:62mm; } .kb-b .kb-img { height:74mm; }
.kb-img img { width:100%; height:100%; object-fit:cover; }
.kb-b > div:last-child { align-self:center; }
.kb-render { flex:1 1 0; min-height:0; display:flex; align-items:center; }
.kb-render img { width:100%; max-height:100%; object-fit:contain; }
.kb-text { color:var(--text); text-align:center; font-size:8.4pt; }
.kb-price { margin-top:4mm; display:flex; align-items:center; gap:3mm; }
.kb-price > span:first-child { color:var(--mute); font-size:7.4pt; }
.kb-a .dl dt, .kb-b .dl dt { font-size:6.8pt; }
.from { color:var(--mute); font-weight:400; margin-right:2mm; }
.kb-top { flex:1 1 0; min-height:0; display:flex; }
.kb-top .s-photo { width:100%; }
.kb-row { display:grid; grid-template-columns:1fr 50mm 1fr; gap:7mm; align-items:start; border-top:1px solid var(--line); padding-top:5mm; }
.kb-h { font-family:Montserrat, Helvetica, sans-serif; font-weight:600; font-size:14pt; }
.kb-row .dl { margin-top:2mm; }
.kb-row .dl dt, .kb-stand .dl dt { font-size:6.8pt; }
.kb-photo { height:62mm; overflow:hidden; }
.kb-photo img { width:100%; height:100%; object-fit:cover; object-position:60% 40%; }
.kb-stand { display:grid; grid-template-columns:38mm 1fr; gap:8mm; align-items:center; border-top:1px solid var(--line); padding-top:5mm; }
.kb-stand-photo img { width:100%; height:auto; }
.kb-stand .dl { margin-top:2mm; }
.duo .split { grid-template-columns:1fr; grid-template-rows:1fr auto; gap:4mm; }
.duo h2 { font-size:13pt; }
.duo .s-lead--l { font-size:8pt; }
</style></head><body>${pages.join('\n')}<script>${DIM_JS}</script></body></html>`;
  const htmlFile = path.join(OUT, 'mazza-seyil.html');
  fs.writeFileSync(htmlFile, html);
  const pdf = path.join(OUT, 'Каталог MAZZA SEYIL.pdf');
  execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--virtual-time-budget=90000',
    `--print-to-pdf=${pdf}`, `file://${htmlFile}`], { stdio: 'ignore', timeout: 240000 });
  console.log('PDF:', pdf, `(${pageNo} стр.)`);
  if (process.argv.includes('--upload')) {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
    const cloudinary = require('../lib/cloudinary');
    const up = await cloudinary.uploader.upload(pdf, { resource_type: 'raw', public_id: 'matkasym/catalogs/mazza-seyil.pdf', overwrite: true, invalidate: true });
    console.log('Залит на сайт:', up.secure_url);
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
