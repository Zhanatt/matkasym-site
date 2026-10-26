// PDF-каталог услуг KYZMAT: одна услуга — один лист A4.
// Лист: логотип и название сета → название услуги → фото → что это →
// цены по видам (толщинам) → что делаем / преимущества → как заказать → контакты.
// «Весь сет» — титульный лист со списком услуг и по листу на каждую.
// Тексты — config/servicesCatalog.js, цены и толщины — из карточек сайта.
import { printEsc as esc, printImage } from './catalogPrint';
import { SERVICES_CONTACTS as C, SERVICES_STEPS, servicePageFor } from '../../config/servicesCatalog';
import { coverOf, variantLabel } from '../../utils/variantKey';

const GREEN = '#267846';
const INK = '#14181c';
const MUTED = '#6b7681';
const LINE = '#e3e7eb';

const fmt = n => Math.round(Number(n) || 0).toLocaleString('ru-RU').replace(/,/g, ' ');
const thicknessOf = (p, all) => {
  const sp = (p.specs || []).find(s => /толщин/i.test(s?.key || '') && s?.value)?.value;
  return String(sp || variantLabel(p, all) || p.name).replace(/\./g, ',');
};
const firstNum = s => parseFloat(String(s).replace(',', '.').match(/\d+(?:\.\d+)?/)?.[0] || '0');

function priceRows(products, priceType) {
  return products
    .map(p => ({
      label: products.length > 1 ? thicknessOf(p, products) : (p.name || ''),
      price: priceType === 'none' || p.priceUndefined || !(Number(p[priceType]) > 0) ? null : Number(p[priceType]),
    }))
    .sort((a, b) => firstNum(a.label) - firstNum(b.label));
}

const head = (setName) => `
  <header class="top">
    <img class="logo" src="/logos/logo-main.png" alt="MATKASYM">
    <div class="setname"><b>${esc(setName)}</b><span>KYZMAT · услуги</span></div>
  </header>`;

const foot = () => `
  <footer class="foot">
    <span><b>${esc(C.phone)}</b></span>
    <span>${esc(C.email)}</span>
    <span>${esc(C.insta)}</span>
    <span>${esc(C.address)}</span>
  </footer>`;

function servicePage(group, setName, priceType) {
  const info = servicePageFor(group.groupName) || {
    title: group.groupName, tagline: '', intro: '', does: [], pros: [], colLabel: 'Вид', unit: '', note: '',
  };
  const products = group.products || [];
  const photo = printImage(coverOf(products)?.images?.[0]);
  const rows = priceRows(products, info.askPrice ? 'none' : priceType);
  const anyPrice = rows.some(r => r.price != null);
  const unit = info.unit ? `<small>${esc(info.unit)}</small>` : '';

  const table = anyPrice ? `
    <table class="prices">
      <thead><tr><th>${esc(info.colLabel)}</th><th>Цена</th></tr></thead>
      <tbody>${rows.map(r => `
        <tr><td>${esc(r.label)}</td>
            <td>${r.price != null ? `<b>${fmt(r.price)} сом</b>${unit}` : '<i>по запросу</i>'}</td></tr>`).join('')}
      </tbody>
    </table>` : `<div class="ask">Цена — по запросу</div>`;

  const list = (title, items) => items?.length ? `
    <div class="col"><h3>${esc(title)}</h3><ul>${items.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';

  // Длинная таблица (сварка — 6 толщин) — поджимаем фото, иначе «Как заказать» наезжает на контакты
  const dense = rows.length > 4 ? ' dense' : '';
  return `
  <section class="page"><div class="sheet${dense}">
    ${head(setName)}
    <div class="title">
      <div class="kicker">Услуга</div>
      <h1>${esc(info.title)}</h1>
      ${info.tagline ? `<p class="tagline">${esc(info.tagline)}</p>` : ''}
    </div>
    ${photo ? `<div class="photo"><img src="${esc(photo)}" alt=""></div>` : ''}
    ${info.intro ? `<p class="intro">${esc(info.intro)}</p>` : ''}
    <div class="pricebox">
      <h2>Цены</h2>
      ${table}
      ${info.note ? `<p class="note">${esc(info.note)}</p>` : ''}
    </div>
    <div class="cols">${list('Что делаем', info.does)}${list('Преимущества', info.pros)}</div>
    <div class="steps">
      <h3>Как заказать</h3>
      <ol>${SERVICES_STEPS.map(([t, d], i) => `<li><span>${i + 1}</span><b>${esc(t)}</b><em>${esc(d)}</em></li>`).join('')}</ol>
    </div>
    ${foot()}
  </div></section>`;
}

function coverPage(groups, setName) {
  const items = groups.map(g => servicePageFor(g.groupName)?.title || g.groupName);
  return `
  <section class="page"><div class="sheet cover">
    <img class="logo big" src="/logos/logo-main.png" alt="MATKASYM">
    <div class="cover-mid">
      <div class="kicker">KYZMAT · каталог услуг</div>
      <h1>${esc(setName)}</h1>
      <p class="tagline">Металлообработка на собственном производстве</p>
      <ol class="toc">${items.map((t, i) => `<li><span>${String(i + 1).padStart(2, '0')}</span>${esc(t)}</li>`).join('')}</ol>
    </div>
    ${foot()}
  </div></section>`;
}

const css = `
@font-face { font-family: Roboto; src: url('/fonts/Roboto-Regular.ttf'); font-weight: 400; }
@font-face { font-family: Roboto; src: url('/fonts/Roboto-Medium.ttf');  font-weight: 500; }
@font-face { font-family: Roboto; src: url('/fonts/Roboto-Bold.ttf');    font-weight: 700; }
@page { size: A4; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #fff; color: ${INK}; font-family: Roboto, Arial, sans-serif;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
:root { --k: 1; }
.page { width: calc(209.9mm * var(--k)); height: calc(296.4mm * var(--k)); overflow: hidden;
  break-after: page; page-break-after: always; }
.page:last-child { break-after: auto; page-break-after: auto; }
.sheet { position: relative; width: 209.9mm; height: 296.4mm; padding: 30pt 36pt 0;
  overflow: hidden; transform: scale(var(--k)); transform-origin: top left; }

.top { display: flex; align-items: center; justify-content: space-between;
  padding-bottom: 12pt; border-bottom: 1pt solid ${LINE}; }
.logo { height: 17pt; }
.setname { text-align: right; line-height: 1.2; }
.setname b { display: block; font-size: 12pt; letter-spacing: .06em; }
.setname span { font-size: 7.5pt; color: ${MUTED}; letter-spacing: .08em; text-transform: uppercase; }

.title { margin: 20pt 0 14pt; }
.kicker { font-size: 7.5pt; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: ${GREEN}; }
h1 { font-size: 26pt; line-height: 1.1; font-weight: 700; margin-top: 5pt; }
.tagline { font-size: 11pt; color: ${MUTED}; margin-top: 6pt; }

.photo { height: 190pt; border-radius: 10pt; overflow: hidden; background: #f2f4f6; }
.photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.intro { font-size: 9.5pt; line-height: 1.55; color: #33393f; margin-top: 14pt; }

.pricebox { margin-top: 16pt; }
h2 { font-size: 13pt; font-weight: 700; margin-bottom: 6pt; }
.prices { width: 100%; border-collapse: collapse; font-size: 10pt; }
.prices th { text-align: left; font-size: 7.5pt; font-weight: 500; color: ${MUTED};
  letter-spacing: .08em; text-transform: uppercase; padding: 0 0 5pt; border-bottom: 1pt solid ${INK}; }
.prices th:last-child, .prices td:last-child { text-align: right; }
.prices td { padding: 5.5pt 0; border-bottom: .6pt solid ${LINE}; }
.prices td b { font-size: 11.5pt; color: ${GREEN}; }
.prices td small { font-size: 8pt; color: ${MUTED}; margin-left: 3pt; }
.prices td i { color: ${MUTED}; font-style: normal; }
.ask { font-size: 12pt; font-weight: 700; color: ${GREEN}; padding: 8pt 0; border-top: 1pt solid ${INK}; border-bottom: .6pt solid ${LINE}; }
.note { font-size: 8pt; color: ${MUTED}; margin-top: 6pt; }

.cols { display: flex; gap: 24pt; margin-top: 16pt; }
.col { flex: 1; }
h3 { font-size: 9pt; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; margin-bottom: 6pt; }
.col ul { list-style: none; }
.col li { font-size: 9pt; line-height: 1.45; padding-left: 11pt; position: relative; margin-bottom: 2pt; color: #33393f; }
.col li::before { content: ''; position: absolute; left: 0; top: 5pt; width: 4pt; height: 4pt; border-radius: 50%; background: ${GREEN}; }

.steps { margin-top: 16pt; }
.steps ol { list-style: none; display: flex; gap: 12pt; }
.steps li { flex: 1; display: flex; flex-direction: column; gap: 2pt; }
.steps li span { width: 18pt; height: 18pt; border-radius: 50%; border: 1pt solid ${GREEN}; color: ${GREEN};
  font-size: 8.5pt; font-weight: 700; display: flex; align-items: center; justify-content: center; margin-bottom: 3pt; }
.steps li b { font-size: 8.5pt; }
.steps li em { font-style: normal; font-size: 7.5pt; line-height: 1.35; color: ${MUTED}; }

.dense .photo { height: 140pt; }
.dense .title { margin: 16pt 0 10pt; }
.dense .prices td { padding: 4pt 0; }
.dense .cols, .dense .steps, .dense .pricebox { margin-top: 12pt; }
.foot { position: absolute; left: 36pt; right: 36pt; bottom: 22pt; display: flex; justify-content: space-between;
  gap: 10pt; padding-top: 9pt; border-top: 1pt solid ${LINE}; font-size: 7.5pt; color: ${MUTED}; }
.foot b { color: ${INK}; font-size: 8.5pt; }

.cover { display: flex; flex-direction: column; padding-top: 48pt; }
.logo.big { height: 30pt; align-self: flex-start; }
.cover-mid { margin-top: 170pt; }
.cover h1 { font-size: 44pt; letter-spacing: .02em; margin-top: 8pt; }
.toc { list-style: none; margin-top: 36pt; border-top: 1pt solid ${INK}; }
.toc li { display: flex; gap: 16pt; font-size: 13pt; padding: 10pt 0; border-bottom: .6pt solid ${LINE}; }
.toc li span { color: ${GREEN}; font-weight: 700; width: 22pt; }

.bar { position: fixed; bottom: 16px; right: 16px; z-index: 99; display: flex; gap: 8px; align-items: center;
  padding: 8px 10px; border-radius: 10px; background: rgba(20,24,28,.92); font: 500 12px Roboto, Arial, sans-serif; color: #cbd3d8; }
.bar button { border: 0; border-radius: 7px; padding: 8px 14px; background: ${GREEN}; color: #fff; font: 700 13px Roboto, Arial, sans-serif; cursor: pointer; }
@media print { .bar { display: none; } }
`;

const MOBILE = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// groups — [{ groupName, products }]; withCover — титульный лист (для «всего сета»)
export async function printServicesCatalog(groups, setName, priceType = 'price', { withCover = false } = {}) {
  const pages = groups.filter(g => g.products?.length);
  const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<base href="${location.origin}/">
<title>Каталог — ${esc(pages.length === 1 ? (servicePageFor(pages[0].groupName)?.title || pages[0].groupName) : setName)}</title>
<style>${css}</style>
${MOBILE() ? '<style>:root { --k: 0.88; }</style>' : ''}
</head><body>
<div class="bar">Поля — «Нет», фоновая графика — включена <button type="button" onclick="window.print()">Сохранить PDF</button></div>
${withCover ? coverPage(pages, setName) : ''}
${pages.map(g => servicePage(g, setName, priceType)).join('')}
</body></html>`;

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

// для проверки вёрстки без браузерной печати
export const __servicesHtml = (groups, setName, priceType, withCover) =>
  `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>${css}</style></head><body>${
    withCover ? coverPage(groups, setName) : ''}${groups.map(g => servicePage(g, setName, priceType)).join('')}</body></html>`;
