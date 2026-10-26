// PDF-каталог направления KYZMAT — своя вёрстка вместо карточек мебели.
//
// Общий каталог (catalogPrint.js) печатает товар карточкой с большим фото —
// для трубы, услуги и краски это 28 листов одинаковых картинок, в которых не
// найти цену. Здесь каждый раздел свёрстан под свой товар:
//   · титул бренда с подписью «Металл и металлообработка» поверх старой;
//   · лист «что такое KYZMAT» — разделы по-русски, с пояснением и страницей;
//   · DAYAR TÜTÜK — трубы таблицами «толщина стенки × сечение» на одном листе,
//     цена за хлыст 6 м, внизу резка трубы;
//   · ÖNDÜRÜÜ — услуги блоками с ценой и единицей (за минуту, за изгиб, за кг);
//   · POLU FABRIKAT — сетка фото без цен и размеров;
//   · YNTYMAK ZAKUP — палитра красок по коду цвета и таблица стальных листов.
// Тексты разделов — config/kyzmatCatalog.js.

import { adminGetPdfDetails } from '../../api/index';
import { PRINT_COVERS, printEsc as esc, printImage, fitsCatalog } from './catalogPrint';
import { SERVICES_CONTACTS as C, SERVICES_STEPS, servicePageFor } from '../../config/servicesCatalog';
import { KYZMAT_COVER, KYZMAT_INTRO, KYZMAT_SECTIONS, kyzmatServiceUnit } from '../../config/kyzmatCatalog';

const RED = '#E30521';
const INK = '#14181c';
const MUTED = '#66737a';
const RULE = '#899FA3';
const LINE = '#e1e6e8';

const fmt = n => Math.round(Number(n) || 0).toLocaleString('ru-RU').replace(/ |,/g, ' ');
const num = s => parseFloat(String(s ?? '').replace(',', '.').match(/\d+(?:\.\d+)?/)?.[0] || 'NaN');
const dec = v => String(v).replace('.', ',');
const specOf = (p, re) => (p.specs || []).find(s => re.test(s?.key || '') && s?.value)?.value;
const isExample = p => /\(пример\)/i.test(p.name || '');

const priceFor = (p, priceType) =>
  priceType === 'none' || p.priceUndefined ? 0 : Number(p[priceType]) || 0;

// ── Общие куски листа ────────────────────────────────────────────────────────
const head = label => `
  <header class="top">
    <img class="logo" src="/logos/logo-main.png" alt="MATKASYM">
    <div class="top-r">${esc(label)}</div>
  </header>`;

const foot = () => `
  <footer class="foot">
    <b>${esc(C.phone)}</b><span>${esc(C.email)}</span><span>${esc(C.insta)}</span><span>${esc(C.address)}</span>
  </footer>`;

const sectionHead = (n, setLabel, info) => `
  <div class="sec">
    <div class="sec-n">${String(n).padStart(2, '0')}</div>
    <div class="sec-t">
      <div class="sec-kg">${esc(setLabel)}</div>
      <h1>${esc(info.title || setLabel)}</h1>
      ${info.text ? `<p class="sec-text">${esc(info.text)}</p>` : ''}
    </div>
  </div>`;

const page = (inner, cls = '') => `<section class="page"><div class="sheet${cls ? ` ${cls}` : ''}">${inner}</div></section>`;

// ── Трубы ────────────────────────────────────────────────────────────────────
const TUBE_KINDS = [
  { key: 'round',  re: /кругл/i,  title: 'Круглые' },
  { key: 'oval',   re: /овал/i,   title: 'Овальные' },
  { key: 'square', re: /квадрат/i, title: 'Квадратные' },
  { key: 'rect',   re: /прямоуг/i, title: 'Прямоугольные' },
];
const tubeKind = p => {
  const t = `${specOf(p, /^тип$/i) || ''} ${p.category || ''}`;
  return TUBE_KINDS.find(k => k.re.test(t)) || null;
};

// «ПФ Профиль 31x15*0,9мм (полуовальный)» → сечение [31, 15], стенка 0.9
function tubeSize(p) {
  const all = (String(p.name || '').replace(/\([^)]*\)/g, '').match(/\d+(?:[.,]\d+)?/g) || [])
    .map(x => +x.replace(',', '.'));
  const wall = num(specOf(p, /толщина стенки/i)) || all[all.length - 1];
  const size = all.slice(0, -1);
  return size.length && wall ? { size, wall } : null;
}

function tubesPage(n, setLabel, info, products, priceType) {
  const cuts = products.filter(p => /резк/i.test(p.category || ''));
  const blocks = TUBE_KINDS.map(kind => {
    const items = products.filter(p => !cuts.includes(p) && tubeKind(p) === kind)
      .map(p => ({ p, ...tubeSize(p), price: priceFor(p, priceType) })).filter(x => x.size);
    if (!items.length) return null;
    // Простой список: строка = одна труба. Сетка «стенка × сечение» читалась
    // плохо — было непонятно, где сечение, где стенка, где цена (26.10.2026).
    const area = x => x.size.reduce((m, v) => m * v, 1);
    items.sort((a, b) => area(a) - area(b) || a.wall - b.wall);
    const photo = printImage(items.find(x => x.p.images?.[0])?.p.images[0]);
    const label = s => (kind.key === 'round' ? `⌀ ${s[0]}` : s.join(' × '));
    return {
      rows: items.length,
      html: `
      <div class="tube">
        <div class="tube-h">
          ${photo ? `<div class="tube-ph"><img src="${esc(photo)}" alt=""></div>` : ''}
          <h2>${kind.title}</h2>
        </div>
        <table class="tlist">
          <thead><tr><th>Сечение, мм</th><th>Стенка, мм</th>${priceType !== 'none' ? '<th>Цена за хлыст 6 м</th>' : ''}</tr></thead>
          <tbody>${items.map(x => `<tr><td>${label(x.size)}</td><td>${dec(x.wall)}</td>${priceType !== 'none'
            ? `<td>${x.price > 0 ? `<b>${fmt(x.price)}</b> сом` : '<i>по запросу</i>'}</td>` : ''}</tr>`).join('')}</tbody>
        </table>
      </div>`,
    };
  }).filter(Boolean);

  // Две колонки: каждый блок — в ту, где сейчас короче
  const cols = [[], []], h = [0, 0];
  blocks.sort((a, b) => b.rows - a.rows).forEach(b => {
    const i = h[0] <= h[1] ? 0 : 1;
    cols[i].push(b.html); h[i] += b.rows + 4;
  });

  const cutRows = cuts.map(p => ({
    label: specOf(p, /толщина/i) || String(p.name || '').match(/\(([^)]+)\)/)?.[1] || p.name,
    price: priceFor(p, priceType),
  })).sort((a, b) => num(a.label) - num(b.label));
  const cutHtml = cutRows.length ? `
    <div class="cut">
      <h2>Резка трубы в размер</h2>
      <div class="cut-rows">${cutRows.map(r => `<div><span>стенка ${esc(dec(r.label).replace(/-/g, '–'))}</span>${
        r.price ? `<b>${fmt(r.price)} сом</b><small>за рез</small>` : '<i>по запросу</i>'}</div>`).join('')}</div>
    </div>` : '';

  return [page(`
    ${head(setLabel)}
    ${sectionHead(n, setLabel, info)}
    ${priceType !== 'none' && info.priceNote ? `<div class="note-bar">${esc(info.priceNote)}.</div>` : ''}
    <div class="tubes">${cols.map(c => `<div class="tcol">${c.join('')}</div>`).join('')}</div>
    ${cutHtml}
    ${foot()}`)];
}

// ── Услуги ───────────────────────────────────────────────────────────────────
function byCategory(products) {
  const m = new Map();
  products.forEach(p => {
    const c = p.category || 'Прочее';
    if (!m.has(c)) m.set(c, []);
    m.get(c).push(p);
  });
  return [...m.entries()];
}

function servicesPage(n, setLabel, info, products, priceType) {
  const blocks = byCategory(products).map(([cat, items]) => {
    const page = servicePageFor(cat) || { title: cat, tagline: '' };
    const unit = kyzmatServiceUnit(cat);
    const photo = printImage(items.find(p => p.images?.[0])?.images[0]);
    const rows = items.map(p => {
      const th = specOf(p, /толщин/i);
      return {
        label: th ? `${dec(th)}`.replace(/-/g, '–') : (items.length > 1 ? p.name : '1 кг изделия'),
        price: unit.ask ? 0 : priceFor(p, priceType),
      };
    }).sort((a, b) => num(a.label) - num(b.label));
    const anyPrice = rows.some(r => r.price > 0);
    const table = rows.length ? `
      <table class="svc-t">${rows.map(r => `<tr><td>${esc(r.label)}</td><td>${r.price > 0
        ? `<b>${fmt(r.price)}</b> <small>${esc(unit.unit || 'сом')}</small>`
        : '<i>по запросу</i>'}</td></tr>`).join('')}</table>` : '';
    return `
      <div class="svc${rows.length > 4 ? ' long' : ''}">
        ${photo ? `<div class="svc-ph"><img src="${esc(photo)}" alt=""></div>` : ''}
        <h2>${esc(page.title)}</h2>
        ${page.tagline ? `<p class="svc-tag">${esc(page.tagline)}</p>` : ''}
        ${priceType === 'none' && !anyPrice ? '' : table}
        ${unit.note ? `<p class="svc-note">${esc(unit.note)}</p>` : ''}
      </div>`;
  });

  return [page(`
    ${head(setLabel)}
    ${sectionHead(n, setLabel, info)}
    <div class="svcs">${blocks.join('')}</div>
    <div class="steps">
      <h3>Как заказать</h3>
      <ol>${SERVICES_STEPS.map(([t, d], i) => `<li><span>${i + 1}</span><b>${esc(t)}</b><em>${esc(d)}</em></li>`).join('')}</ol>
    </div>
    ${foot()}`, 'svc-sheet')];
}

// ── Полуфабрикаты и прочее: сетка фото ───────────────────────────────────────
const CAT_RU = { 'узоры': 'Узор', 'декоративная-деталь': 'Декоративная деталь' };
// Размеры в названии не печатаем: «Накладка … (140×18 мм) — Деталь 1» → «Накладка … — Деталь 1»
const noSizes = s => String(s || '')
  .replace(/\(?\s*\d+(?:[.,]\d+)?\s*[×xх*]\s*\d+(?:[.,]\d+)?\s*(?:мм)?\s*\)?/gi, ' ')
  .replace(/\s{2,}/g, ' ').replace(/\s+—/g, ' —').trim();

const PER_GRID = 16;
function gridPages(n, setLabel, info, products, priceType, { prices = true } = {}) {
  const items = products.filter(p => p.images?.[0]);
  const out = [];
  for (let i = 0; i < Math.max(items.length, 1); i += PER_GRID) {
    const chunk = items.slice(i, i + PER_GRID);
    out.push(page(`
      ${head(setLabel)}
      ${i === 0 ? sectionHead(n, setLabel, info) : ''}
      ${i === 0 && info.priceNote ? `<div class="note-bar">${esc(info.priceNote)}</div>` : ''}
      <div class="cards">${chunk.map(p => {
        const v = prices ? priceFor(p, priceType) : 0;
        const cat = CAT_RU[p.category] || '';
        return `
        <div class="card">
          <div class="card-ph"><img src="${esc(printImage(p.images[0]))}" alt=""></div>
          ${cat ? `<div class="card-k">${esc(cat)}</div>` : ''}
          <div class="card-n">${esc(prices ? p.name : noSizes(p.name))}</div>
          ${v > 0 ? `<div class="card-p">${fmt(v)} сом</div>` : ''}
        </div>`;
      }).join('')}</div>
      ${foot()}`));
  }
  return out;
}

// ── Расходные материалы: палитра красок и листы ──────────────────────────────
const HEX = /^#[0-9a-f]{6}$/i;
const FINISH = [[/шагрен/i, 'шагрень'], [/полумат/i, 'полумат'], [/metallic|металлик/i, 'металлик'],
  [/глян/i, 'глянец'], [/термостойк/i, 'термостойкая'], [/\bмат\b|\bmat\b|матов/i, 'мат']];

// «Краска 7016 МАТ (1 кг) (серый-антрацит) ACPP/RALL» → { code: 'RAL 7016', name: 'серый-антрацит', finish: 'мат' }
function paintOf(p) {
  const raw = String(p.name || '').replace(/ACР?Р|ACPP|RALL?|\bRAL\b/gi, m => (/^ral$/i.test(m) ? m : ' '));
  const m = raw.match(/(?:^|[^\d])(\d{4}|S\d{3})(?!\d)/i);
  if (!m) return null;
  const code = `RAL ${m[1].toUpperCase()}`;
  const finish = FINISH.find(([re]) => re.test(p.name))?.[1] || '';
  const inBr = [...String(p.name).matchAll(/\(([^()]+)\)/g)].map(x => x[1].trim())
    .filter(x => !/кг|ral|acpp|шагрен|глян/i.test(x))
    .map(x => x.replace(/[A-Za-z]+/g, ' ').replace(/\s*\/\s*$/, '').replace(/\s{2,}/g, ' ').trim()).filter(Boolean);
  let name = inBr[0] || raw.slice(raw.indexOf(m[1]) + m[1].length)
    .replace(/\(.*?\)/g, ' ').replace(/[A-Za-z/]+/g, ' ');
  name = name.replace(/мат(овый)?|шагрень|глянц?е?ц?|metallic|термостойкая|кг/gi, ' ')
    .replace(/[()]/g, ' ').replace(/\s{2,}/g, ' ').trim().toLowerCase();
  return { code, name, finish, enamel: /эмал/i.test(p.name) };
}

function suppliesPages(n, setLabel, info, products, priceType) {
  const paints = products.filter(p => /краск/i.test(p.category || ''));
  // Код цвета берём и у соседей с тем же RAL: у части позиций из 1С поле пустое
  const hexByCode = new Map();
  paints.forEach(p => { const x = paintOf(p); if (x && HEX.test(String(p.color || '').trim())) hexByCode.set(x.code, p.color.trim()); });
  const swatches = new Map();
  paints.forEach(p => {
    if (p.productStatus === 'undefined') return;     // не продаём — в палитру не берём
    const x = paintOf(p);
    if (!x) return;
    const hex = HEX.test(String(p.color || '').trim()) ? p.color.trim() : hexByCode.get(x.code);
    if (!hex) return;
    const key = `${x.enamel ? 'e' : 'k'}|${x.code}|${x.finish}`;
    const prev = swatches.get(key);
    if (!prev || (!prev.name && x.name)) swatches.set(key, { ...x, hex });
  });
  const sorted = [...swatches.values()].sort((a, b) => a.code.localeCompare(b.code, 'ru', { numeric: true }));
  const paintPrices = paints.map(p => priceFor(p, priceType)).filter(v => v > 0);
  // Самая частая цена — у фасовки 1 кг она одна на все цвета
  const common = paintPrices.length ? [...paintPrices.reduce((m, v) => m.set(v, (m.get(v) || 0) + 1), new Map())]
    .sort((a, b) => b[1] - a[1])[0][0] : 0;

  const swatchHtml = s => `
    <div class="sw">
      <div class="sw-c" style="background:${esc(s.hex)}"></div>
      <b>${esc(s.code)}</b>
      <span>${esc([s.name, s.finish].filter(Boolean).join(' · '))}</span>
    </div>`;
  const group = (title, list) => (list.length ? `
    <h2 class="sub">${title}</h2>
    <div class="sws">${list.map(swatchHtml).join('')}</div>` : '');

  const pages = [];
  pages.push(page(`
    ${head(setLabel)}
    ${sectionHead(n, setLabel, info)}
    <div class="note-bar">Палитра красок${common ? ` · фасовка 1 кг — ${fmt(common)} сом` : ''}. По этой же палитре красим изделия на порошковой покраске.</div>
    ${group('Краски', sorted.filter(s => !s.enamel))}
    ${group('Эмаль по металлу', sorted.filter(s => s.enamel))}
    ${foot()}`, 'paint-sheet'));

  // Стальной лист: толщина × формат и прокат; в клетке — масса листа
  const sheets = products.filter(p => /лист/i.test(p.category || '') && !isExample(p))
    .map(p => ({
      p,
      t: num(specOf(p, /^толщина/i) || p.name),
      fmt: String(specOf(p, /формат/i) || p.name.match(/\d{3,4}×\d{3,4}/)?.[0] || '').replace(/\s*мм/, ''),
      kind: /г\/к/i.test(specOf(p, /^сталь/i) || p.name) ? 'г/к' : 'х/к',
      mass: specOf(p, /масса/i) || '',
      price: priceFor(p, priceType),
    })).filter(x => x.t && x.fmt);
  const rest = products.filter(p => !paints.includes(p) && !/лист/i.test(p.category || '') && !isExample(p)
    && fitsCatalog(p));
  if (sheets.length || rest.length) {
    const colsK = [...new Set(sheets.map(x => `${x.fmt} ${x.kind}`))].sort();
    const ths = [...new Set(sheets.map(x => x.t))].sort((a, b) => a - b);
    const anyPrice = sheets.some(x => x.price > 0);
    const cell = (t, k) => {
      const x = sheets.find(s => s.t === t && `${s.fmt} ${s.kind}` === k);
      if (!x) return '<td class="no">—</td>';
      return `<td>${x.price > 0 ? `<b>${fmt(x.price)}</b>` : ''}${x.mass ? `<small>${esc(String(x.mass).replace(/\.(\d)/, ',$1'))}</small>` : ''}</td>`;
    };
    pages.push(page(`
      ${head(setLabel)}
      ${sheets.length ? `
      <h2 class="big">Лист стальной</h2>
      <div class="note-bar">Холоднокатаный (х/к) и горячекатаный (г/к). В клетке — ${anyPrice ? 'цена листа, сом, и ' : ''}масса листа${anyPrice ? '' : '; цену уточняйте у менеджера'}.</div>
      <table class="grid sheets">
        <thead><tr><th>толщина, мм</th>${colsK.map(k => `<th>${esc(k)}</th>`).join('')}</tr></thead>
        <tbody>${ths.map(t => `<tr><th>${dec(t)}</th>${colsK.map(k => cell(t, k)).join('')}</tr>`).join('')}</tbody>
      </table>` : ''}
      ${rest.length ? `<h2 class="big">Ещё в наличии</h2><ul class="rest">${rest.map(p => {
        const v = priceFor(p, priceType);
        return `<li><span>${esc(p.name)}</span>${v > 0 ? `<b>${fmt(v)} сом</b>` : '<i>по запросу</i>'}</li>`;
      }).join('')}</ul>` : ''}
      ${foot()}`));
  }
  return pages;
}

// ── Титул, оглавление ────────────────────────────────────────────────────────
const coverPage = src => `
  <section class="page"><div class="sheet cover">
    <img src="${esc(src)}" alt="">
    <div class="cover-sub"><b>${esc(KYZMAT_COVER.tagline)}</b><span>${esc(KYZMAT_COVER.subline)}</span></div>
  </div></section>`;
const endPage = src => `<section class="page"><div class="sheet cover"><img src="${esc(src)}" alt=""></div></section>`;

function contentsPage(sections) {
  return page(`
    ${head('KYZMAT')}
    <div class="about">
      <div class="sec-kg">О направлении</div>
      <h1>KYZMAT</h1>
      <p>${esc(KYZMAT_INTRO)}</p>
    </div>
    <ol class="toc">${sections.map(s => `
      <li>
        <div class="toc-n">${String(s.n).padStart(2, '0')}</div>
        <div class="toc-t">
          <div class="toc-h"><b>${esc(s.info.title || s.label)}</b><span>${esc(s.label)}</span></div>
          ${s.info.lead ? `<div class="toc-lead">${esc(s.info.lead)}</div>` : ''}
          ${s.info.text ? `<p>${esc(s.info.text)}</p>` : ''}
        </div>
        <div class="toc-p">стр. ${s.page}</div>
      </li>`).join('')}
    </ol>
    <div class="steps">
      <h3>Как заказать</h3>
      <ol>${SERVICES_STEPS.map(([t, d], i) => `<li><span>${i + 1}</span><b>${esc(t)}</b><em>${esc(d)}</em></li>`).join('')}</ol>
    </div>
    ${foot()}`);
}

// ── Стили ────────────────────────────────────────────────────────────────────
const css = `
@font-face { font-family: Roboto; src: url('/fonts/Roboto-Regular.ttf'); font-weight: 400; }
@font-face { font-family: Roboto; src: url('/fonts/Roboto-Medium.ttf');  font-weight: 500; }
@font-face { font-family: Roboto; src: url('/fonts/Roboto-Bold.ttf');    font-weight: 700; }
@page { size: A4; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #fff; color: ${INK}; font-family: Roboto, Arial, sans-serif;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
:root { --k: 1; }
/* Лист на волос меньше A4 — иначе Chrome вставляет пустые листы (см. catalogPrint.js) */
.page { width: calc(209.9mm * var(--k)); height: calc(296.4mm * var(--k)); overflow: hidden;
  break-after: page; page-break-after: always; }
.page:last-child { break-after: auto; page-break-after: auto; }
.sheet { position: relative; width: 209.9mm; height: 296.4mm; padding: 18pt 36pt 0;
  overflow: hidden; transform: scale(var(--k)); transform-origin: top left; }

.cover { padding: 0; }
.cover img { display: block; width: 100%; height: 100%; object-fit: cover; }
/* Своя подпись поверх «товары для города» с картинки обложки (центр — 65% высоты) */
.cover-sub { position: absolute; left: 8%; right: 8%; top: 62.2%; height: 6.4%; background: #fff;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5pt; text-align: center; }
.cover-sub b { font: 700 15pt Montserrat, Roboto, Arial, sans-serif; letter-spacing: .04em; text-transform: uppercase; color: #7d939a; }
.cover-sub span { font-size: 9.5pt; letter-spacing: .06em; color: #8a9aa0; }

.top { display: flex; align-items: flex-end; justify-content: space-between;
  padding-bottom: 6pt; border-bottom: .5pt solid ${RULE}; }
.logo { height: 13.25pt; display: block; }
.top-r { font-size: 13pt; font-weight: 700; line-height: 1; letter-spacing: .02em; }

.sec { display: flex; gap: 14pt; margin: 18pt 0 12pt; }
.sec-n { font-size: 34pt; font-weight: 700; line-height: .9; color: ${RED}; }
.sec-kg { font-size: 7.5pt; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: ${MUTED}; }
h1 { font-size: 24pt; font-weight: 700; line-height: 1.1; margin-top: 2pt; }
.sec-text { font-size: 9.5pt; line-height: 1.5; color: #333b40; margin-top: 5pt; max-width: 440pt; }
.note-bar { font-size: 8.5pt; color: ${INK}; background: #f3f5f6; border-left: 2.5pt solid ${RED};
  padding: 5pt 8pt; margin-bottom: 12pt; }

/* ── Трубы ── */
.tubes { display: flex; gap: 22pt; align-items: flex-start; }
.tcol { flex: 1; display: flex; flex-direction: column; gap: 20pt; min-width: 0; }
.tube-h { display: flex; align-items: center; gap: 8pt; margin-bottom: 4pt; }
.tube-ph { width: 52pt; height: 38pt; display: flex; align-items: center; justify-content: center; }
.tube-ph img { max-width: 100%; max-height: 100%; object-fit: contain; }
h2 { font-size: 12.5pt; font-weight: 700; line-height: 1.15; }
.tube-sub { font-size: 7pt; color: ${MUTED}; margin-top: 1pt; }
.tlist { width: 100%; border-collapse: collapse; font-size: 11pt; }
.tlist th { text-align: left; font-size: 8pt; font-weight: 700; color: ${MUTED}; padding: 0 4pt 5pt 0; border-bottom: 1pt solid ${INK}; }
.tlist td { padding: 5pt 4pt 5pt 0; border-bottom: .5pt solid ${LINE}; }
.tlist th:last-child, .tlist td:last-child { text-align: right; padding-right: 0; }
.tlist td:first-child { font-weight: 700; }
.tlist td b { color: ${RED}; font-size: 12pt; }
.tlist td i { font-style: normal; color: ${MUTED}; font-size: 8.5pt; }
.grid { width: 100%; border-collapse: collapse; font-size: 10.5pt; }
.grid th, .grid td { padding: 4.6pt 3pt; text-align: center; border-bottom: .5pt solid ${LINE}; }
.grid thead th { font-size: 8.5pt; font-weight: 700; border-bottom: 1pt solid ${INK}; white-space: nowrap; }
.grid thead th:first-child, .grid tbody th { text-align: left; font-weight: 500; color: ${MUTED}; font-size: 7.5pt; }
.grid tbody th { white-space: nowrap; font-size: 8.5pt; }
.sheets { font-size: 9.5pt; }
.sheets th, .sheets td { padding: 3.6pt 3pt; }
.grid td { font-weight: 500; }
.grid td.no { color: #c3ccd0; font-weight: 400; }
.grid td i { font-style: normal; color: ${MUTED}; font-size: 7.5pt; font-weight: 400; }
.cut { margin-top: 16pt; padding-top: 10pt; border-top: 1pt solid ${INK}; }
.cut-rows { display: flex; flex-wrap: wrap; gap: 6pt 26pt; margin-top: 6pt; font-size: 9.5pt; }
.cut-rows div { display: flex; align-items: baseline; gap: 6pt; }
.cut-rows b { color: ${RED}; }
.cut-rows small, .cut-rows i { font-size: 7.5pt; color: ${MUTED}; font-style: normal; }

/* ── Услуги ── */
.svcs { display: grid; grid-template-columns: 1fr 1fr; gap: 14pt 22pt; }
.svc-ph { height: 92pt; border-radius: 4pt; overflow: hidden; background: #f2f4f6; margin-bottom: 6pt; }
.svc-ph img { width: 100%; height: 100%; object-fit: cover; display: block; }
.svc-tag { font-size: 8pt; color: ${MUTED}; margin-top: 2pt; line-height: 1.35; }
.svc-t { width: 100%; border-collapse: collapse; margin-top: 5pt; font-size: 9pt; }
.svc-t td { padding: 2.6pt 0; border-bottom: .5pt solid ${LINE}; }
.svc-t td:last-child { text-align: right; white-space: nowrap; }
.svc-t b { color: ${RED}; font-size: 10pt; }
.svc-t small { color: ${MUTED}; font-size: 7.5pt; }
.svc-t i { font-style: normal; color: ${MUTED}; font-size: 8pt; }
.svc-note { font-size: 7.5pt; line-height: 1.35; color: ${MUTED}; margin-top: 4pt; }
.svc-sheet .sec { margin: 14pt 0 10pt; }

.steps { position: absolute; left: 36pt; right: 36pt; bottom: 54pt; }
h3 { font-size: 8.5pt; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; margin-bottom: 6pt; }
.steps ol { list-style: none; display: flex; gap: 12pt; }
.steps li { flex: 1; display: flex; flex-direction: column; gap: 2pt; }
.steps li span { width: 16pt; height: 16pt; border-radius: 50%; border: 1pt solid ${RED}; color: ${RED};
  font-size: 8pt; font-weight: 700; display: flex; align-items: center; justify-content: center; margin-bottom: 2pt; }
.steps li b { font-size: 8.5pt; }
.steps li em { font-style: normal; font-size: 7.5pt; line-height: 1.35; color: ${MUTED}; }

/* ── Сетка фото ── */
.cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12pt 14pt; }
.card-ph { height: 104pt; display: flex; align-items: center; justify-content: center; background: #f6f7f8; border-radius: 4pt; overflow: hidden; }
.card-ph img { max-width: 100%; max-height: 100%; object-fit: contain; }
.card-k { font-size: 6.5pt; color: ${MUTED}; margin-top: 4pt; text-transform: uppercase; letter-spacing: .08em; }
.card-n { font-size: 9pt; font-weight: 700; line-height: 1.2; margin-top: 1pt;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.card-p { display: inline-block; margin-top: 3pt; padding: 0 6pt; height: 14pt; line-height: 14pt; border-radius: 3pt;
  background: ${RED}; color: #fff; font-size: 8.5pt; }

/* ── Палитра ── */
h2.sub { margin: 4pt 0 6pt; }
.sws { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10pt 10pt; margin-bottom: 12pt; }
.sw-c { height: 34pt; border-radius: 3pt; box-shadow: inset 0 0 0 .75pt ${RULE}; }
.sw b { display: block; font-size: 8.5pt; margin-top: 3pt; }
.sw span { display: block; font-size: 7pt; line-height: 1.25; color: ${MUTED}; }

h2.big { font-size: 18pt; margin: 18pt 0 8pt; }
.sheets td { font-weight: 400; }
.sheets td b { display: block; font-weight: 700; }
.sheets td small { font-size: 7.5pt; color: ${MUTED}; }
.rest { list-style: none; font-size: 10pt; }
.rest li { display: flex; justify-content: space-between; padding: 4pt 0; border-bottom: .5pt solid ${LINE}; }
.rest b { color: ${RED}; }
.rest i { font-style: normal; color: ${MUTED}; font-size: 8.5pt; }

/* ── О направлении ── */
.about { margin: 26pt 0 16pt; }
.about h1 { font-size: 36pt; }
.about p { font-size: 10.5pt; line-height: 1.55; color: #333b40; margin-top: 8pt; }
.toc { list-style: none; border-top: 1pt solid ${INK}; }
.toc li { display: flex; gap: 14pt; padding: 11pt 0; border-bottom: .5pt solid ${LINE}; }
.toc-n { font-size: 20pt; font-weight: 700; color: ${RED}; line-height: 1; width: 30pt; }
.toc-t { flex: 1; }
.toc-h { display: flex; align-items: baseline; gap: 8pt; }
.toc-h b { font-size: 14pt; }
.toc-h span { font-size: 7.5pt; font-weight: 700; letter-spacing: .14em; color: ${MUTED}; }
.toc-lead { font-size: 9.5pt; font-weight: 500; margin-top: 2pt; }
.toc-t p { font-size: 8.5pt; line-height: 1.45; color: ${MUTED}; margin-top: 3pt; }
.toc-p { font-size: 8.5pt; color: ${MUTED}; white-space: nowrap; }

.foot { position: absolute; left: 36pt; right: 36pt; bottom: 20pt; display: flex; justify-content: space-between;
  gap: 10pt; padding-top: 8pt; border-top: .5pt solid ${RULE}; font-size: 7.5pt; color: ${MUTED}; }
.foot b { color: ${INK}; font-size: 8.5pt; }

.bar { position: fixed; bottom: 16px; right: 16px; z-index: 99; display: flex; gap: 8px; align-items: center;
  padding: 8px 10px; border-radius: 10px; background: rgba(20,24,28,.92); font: 500 12px Roboto, Arial, sans-serif; color: #cbd3d8; }
.bar button { border: 0; border-radius: 7px; padding: 8px 14px; background: ${RED}; color: #fff; font: 700 13px Roboto, Arial, sans-serif; cursor: pointer; }
@media print { .bar { display: none; } }
`;

// ── Сборка ───────────────────────────────────────────────────────────────────
const LAYOUTS = {
  'dayar-tutuk': tubesPage,
  'onuguu-set': servicesPage,
  'poly-fabrikat': (n, l, i, ps, pt) => gridPages(n, l, i, ps, pt, { prices: false }),
  'yntymak-zakup': suppliesPages,
};

// groups — [{ setKey, groupName, products }] в порядке сетов. Товары — все товары
// сета (без фильтра fitsCatalog): палитре нужны и краски без остатка, а листам —
// позиции без фото. Каждый раздел отбирает своё сам.
export function kyzmatHtml(groups, priceType = 'price', { base = '' } = {}) {
  const sections = [];
  let pageNo = 3;                                   // 1 — титул, 2 — о направлении
  groups.forEach((g, i) => {
    const info = KYZMAT_SECTIONS[g.setKey] || { title: g.groupName };
    const layout = LAYOUTS[g.setKey];
    const products = layout === suppliesPages ? (g.products || []).filter(p => !p.hideInPdf)
      :(g.products || []).filter(p => fitsCatalog(p) && !isExample(p));
    const pages = layout ? layout(i + 1, g.groupName, info, products, priceType)
      : gridPages(i + 1, g.groupName, info, products, priceType);
    sections.push({ n: i + 1, label: g.groupName, info, page: pageNo, pages });
    pageNo += pages.length;
  });
  const cover = PRINT_COVERS.kyzmat;
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
${base ? `<base href="${base}/">` : ''}
<title>Каталог — KYZMAT</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@700&display=block">
<style>${css}</style>
</head><body>
<div class="bar">Поля — «Нет», фоновая графика — включена <button type="button" onclick="window.print()">Сохранить PDF</button></div>
${coverPage(cover.title)}
${contentsPage(sections)}
${sections.flatMap(s => s.pages).join('')}
${endPage(cover.end)}
</body></html>`;
}

// В brief-списке у товара две характеристики — толщина стенки, формат листа и
// масса там бывают отрезаны. Догружаем характеристики всем позициям направления.
async function withSpecs(groups) {
  const ids = groups.flatMap(g => g.products || []).map(p => p._id).filter(Boolean);
  if (!ids.length) return groups;
  try {
    const { data } = await adminGetPdfDetails(ids);
    const byId = new Map((data?.products || []).map(d => [String(d._id), d]));
    return groups.map(g => ({ ...g, products: (g.products || []).map(p => {
      const d = byId.get(String(p._id));
      return d ? { ...p, specs: d.specs || p.specs, images: d.images?.length ? d.images : p.images } : p;
    }) }));
  } catch { return groups; }
}

const MOBILE = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export async function printKyzmatCatalog(groups, priceType = 'price') {
  const full = await withSpecs(groups);
  let html = kyzmatHtml(full, priceType, { base: location.origin });
  if (MOBILE()) html = html.replace('</head>', '<style>:root { --k: 0.88; }</style></head>');

  const win = window.open('', '_blank');
  if (!win) throw new Error('Браузер заблокировал новое окно — разрешите всплывающие окна для сайта');
  win.document.open();
  win.document.write(html);
  win.document.close();
  await new Promise(resolve => {
    if (win.document.readyState === 'complete') queueMicrotask(resolve);
    else win.addEventListener('load', resolve, { once: true });
  });
  await Promise.all(Array.from(win.document.images).map(img => (img.complete ? null
    : new Promise(res => { img.addEventListener('load', res, { once: true }); img.addEventListener('error', res, { once: true }); }))));
  if (win.document.fonts?.ready) await win.document.fonts.ready;
  win.focus();
  win.print();
}
