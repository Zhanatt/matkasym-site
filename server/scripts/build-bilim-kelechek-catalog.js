// Каталог «Билим келечек» в PDF (29.10.2026) — три товара, стиль как у UZAK KOLDON.
//
// Фото — с сайта: Cloudinary matkasym/bilim-kelechek/<имя> (залиты
// bilim-kelechek-photos.js) и интерьер с карточки ALA-TOO. Цены и размеры — из базы.
// Треугольных парт на сайте нет (так решили 29.10.2026): данные о них заданы здесь,
// цена «по запросу». У ALA-TOO розницы нет — печатаем оптовую, с подписью.
//
//   node scripts/build-bilim-kelechek-catalog.js <папка для HTML и PDF>

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
const asset = (id, w, trim = true) => `${CLOUD}/${trim ? 'e_trim:10/' : ''}f_jpg,q_auto:good,w_${w},c_limit/matkasym/bilim-kelechek/${id}`;
const fromUrl = (url, w) => url.replace('/upload/', `/upload/f_jpg,q_auto:good,w_${w},c_limit/`);
const LOGO = `${SITE}/logos/logo-main.png`;

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = n => n > 0 ? `${n.toLocaleString('ru-RU').replace(/ |,/g, ' ')} сом` : 'по запросу';
const tag = (n, label) => `<div class="price">${label && n > 0 ? `<span>${label}</span>` : ''}<b class="tag">${money(n)}</b></div>`;

let pageNo = 0;
const page = (body, cls = '') => {
  pageNo++;
  return `<section class="page ${cls}">${body}
    <footer class="foot"><span class="foot-l"><img src="${LOGO}" alt="MATKASYM"><i>BILIM KELECHEK</i></span><span>${String(pageNo).padStart(2, '0')}</span></footer></section>`;
};
const dl = rows => `<dl class="dl">${rows.filter(r => r[1]).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;

// Полоса товара: шапка, большое фото, снизу — второе фото и характеристики
function productPage({ n, kind, title, lead, hero, second, rows, price, priceLabel, extra = '' }) {
  return page(`
    <div class="p-head">
      <div><div class="kind"><span class="num">${n}</span>${esc(kind)}</div><h2>${esc(title)}</h2></div>
      <div class="p-lead"><p>${esc(lead)}</p>${tag(price, priceLabel)}</div>
    </div>
    <div class="hero"><img src="${hero}" alt=""></div>
    <div class="p-foot${second ? '' : ' p-foot--one'}">
      ${second ? `<div class="second"><img src="${second}" alt=""></div>` : ''}
      ${dl(rows)}
    </div>${extra}`);
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Montserrat:wght@500;600;700&display=block');
@page { size: A4; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
/* брендбук MATKASYM 2024: красный — акцент, металлический серый — линии, чёрный — заголовки, #4d4d4d — текст */
:root { --ink:#000; --text:#4d4d4d; --mute:#7d96a0; --metal:#7d96a0; --line:#dfe5e7; --red:#e10523; --pad:16mm; }
html, body { background:#fff; color:var(--ink); font-family:Roboto, Helvetica, Arial, sans-serif; font-size:8.8pt; line-height:1.45;
  -webkit-print-color-adjust:exact; print-color-adjust:exact; }
img { display:block; max-width:100%; }
.page { width:210mm; height:297mm; padding:var(--pad) var(--pad) 22mm; position:relative; overflow:hidden;
  break-after:page; display:flex; flex-direction:column; gap:7mm; }
.page:last-child { break-after:auto; }
.foot { position:absolute; left:var(--pad); right:var(--pad); bottom:10mm; display:flex; justify-content:space-between; align-items:center;
  font-size:6.8pt; letter-spacing:.12em; color:var(--mute); text-transform:uppercase; }
.foot-l { display:flex; align-items:center; gap:3mm; }
.foot-l img { height:3.4mm; width:auto; }
.foot-l i { font-style:normal; }
h2 { font-family:Montserrat, Helvetica, sans-serif; font-weight:700; font-size:24pt; line-height:1.05; letter-spacing:.01em; }

/* полоса товара */
.p-head { display:grid; grid-template-columns:1fr 1fr; gap:10mm; align-items:end; padding-bottom:6mm; border-bottom:1px solid var(--metal); }
.kind { font-size:7pt; letter-spacing:.14em; text-transform:uppercase; color:var(--mute); margin-bottom:2.5mm; display:flex; gap:3mm; }
.kind .num { color:var(--red); font-family:Montserrat, Helvetica, sans-serif; font-weight:600; }
.p-lead { display:flex; flex-direction:column; gap:4mm; align-items:flex-start; }
.p-lead p { color:var(--text); font-size:9.6pt; line-height:1.5; }
.price span { display:block; font-size:6.8pt; letter-spacing:.1em; text-transform:uppercase; color:var(--mute); margin-bottom:1.2mm; }
.tag { display:inline-block; background:var(--red); color:#fff; font-weight:500; font-size:12pt; line-height:1; padding:2mm 3.2mm; border-radius:.8mm; white-space:nowrap; }
.hero { flex:1 1 0; min-height:0; display:flex; align-items:center; justify-content:center; }
.hero img { max-height:100%; max-width:100%; width:auto; object-fit:contain; }
.p-foot { display:grid; grid-template-columns:48% 1fr; gap:9mm; align-items:center; border-top:1px solid var(--line); padding-top:6mm; height:62mm; }
.p-foot--one { grid-template-columns:1fr; height:auto; }
.second { height:100%; display:flex; align-items:center; justify-content:center; overflow:hidden; }
.second img { max-height:100%; max-width:100%; width:auto; object-fit:contain; }
.second--photo img { width:100%; height:100%; object-fit:cover; }
.dl { display:grid; grid-template-columns:auto 1fr; border-top:1px solid var(--metal); align-self:start; }
.dl dt, .dl dd { padding:2.4mm 0; border-bottom:1px solid var(--line); }
.dl dt { color:var(--mute); font-size:7pt; text-transform:uppercase; letter-spacing:.1em; padding-right:8mm; padding-top:2.8mm; }
.dl dd { text-align:right; font-weight:500; }

/* обложка */
.cover { padding:0; }
.cover .foot { display:none; }
.cover-photo { position:absolute; inset:0; }
.cover-photo img { width:100%; height:100%; object-fit:cover; object-position:50% 50%; }
.cover-tab { position:absolute; top:0; left:50%; transform:translateX(-50%); }
.cover-tab img { width:36mm; height:auto; }
.cover-plate { position:absolute; left:50%; bottom:30mm; transform:translateX(-50%); background:var(--metal); color:#fff;
  font-family:Montserrat, Helvetica, sans-serif; font-weight:700; font-size:30pt; letter-spacing:.04em; line-height:1;
  padding:5mm 10mm; border-radius:3mm; white-space:nowrap; text-align:center; }
.cover-plate small { display:block; font-family:Roboto, Helvetica, Arial, sans-serif; font-weight:400; font-size:10pt; letter-spacing:.08em; margin-top:2.6mm; }

/* как заказать */
.order { display:grid; grid-template-columns:1fr 1fr; gap:10mm; border-top:1px solid var(--metal); padding-top:6mm; }
.order h3 { font-family:Montserrat, Helvetica, sans-serif; font-weight:600; font-size:14pt; margin-bottom:4mm; }
.steps { counter-reset:s; display:grid; gap:2.6mm; }
.steps li { list-style:none; display:grid; grid-template-columns:7mm 1fr; }
.steps li::before { counter-increment:s; content:counter(s, decimal-leading-zero); font-family:Montserrat, Helvetica, sans-serif; font-weight:600; color:var(--red); font-size:8pt; }
.contacts { display:grid; gap:2.6mm; }
.contacts div { display:grid; grid-template-columns:24mm 1fr; padding-bottom:2.4mm; border-bottom:1px solid var(--line); }
.contacts dt { color:var(--mute); font-size:7pt; text-transform:uppercase; letter-spacing:.1em; }
.contacts dd { font-weight:500; }
.contacts .big { font-family:Montserrat, Helvetica, sans-serif; font-weight:600; font-size:11pt; }
`;

(async () => {
  await mongoose.connect(MONGO_URI);
  const col = mongoose.connection.db.collection('products');
  const ala = await col.findOne({ set: 'bilim-kelechek', name: 'ALA-TOO парта, стул' });
  const i1r = await col.findOne({ set: 'bilim-kelechek', sku: 'MKS-BK-004' });
  if (!ala || !i1r) throw new Error('нет ALA-TOO или MKS-BK-004');
  const alaRoom = (ala.images || []).filter(u => !u.includes('/matkasym/bilim-kelechek/'))[1]; // класс с учениками
  const dims = s => String(s || '').split(/[x×*]/i).map(v => v.trim()).join(' × ');

  const pages = [];
  // 1. Обложка
  pages.push(page(`
    <div class="cover-photo"><img src="${asset('cover-class', 2000, false)}" alt=""></div>
    <div class="cover-tab"><img src="${CLOUD}/f_png,w_600,c_limit/matkasym/uzak-koldon/logo-tab" alt="MATKASYM"></div>
    <div class="cover-plate">BILIM KELECHEK<small>Мебель для школ и учебных классов</small></div>`, 'cover'));

  // 2. Треугольные парты
  pages.push(productPage({
    n: '01', kind: 'Групповая парта', title: 'Треугольная парта со стулом',
    lead: 'Парты на колёсах ставят по одной или собирают по шесть в шестиугольник — для работы в группах. Стул на полозьях с пластиковым сиденьем.',
    hero: asset('tri-hex', 2000), second: asset('tri-scatter', 1400), price: 0,
    rows: [['Форма', 'треугольная'], ['Опоры', 'на колёсах'], ['Столешница', 'оранжевая / белая'], ['Стул', 'оранжевый / белый'], ['Группа', '6 парт — шестиугольник']],
  }));

  // 3. ALA-TOO
  pages.push(productPage({
    n: '02', kind: 'Школьная парта', title: 'ALA-TOO',
    lead: 'Двухместная парта и два стула. На передней панели — силуэт гор Ала-Тоо, по бокам — крючки для рюкзаков.',
    hero: fromUrl(ala.images[0], 2000).replace('/upload/', '/upload/e_trim:10/'),
    second: alaRoom ? fromUrl(alaRoom, 1200).replace('c_limit', 'c_fill,ar_4:3,g_auto') : '',
    price: ala.price || ala.priceWholesale, priceLabel: ala.price ? 'розничная цена' : 'оптовая цена',
    rows: [['Комплект', 'парта + 2 стула'], ['Столешница', '120 × 45 см'], ['Каркас', 'металлический, оранжевый'], ['Сиденье', 'пластиковое, белое']],
  }).replace('<div class="second">', '<div class="second second--photo">'));

  // 4. Стол I 1 R + как заказать
  pages.push(productPage({
    n: '03', kind: 'Складной стол', title: 'Стол I 1 R',
    lead: 'Стол со складной столешницей на колёсах — для классов, переговорных и учебных центров. После занятий столы складывают и ставят к стене.',
    hero: fromUrl(i1r.images[0], 2000).replace('/upload/', '/upload/e_trim:10/'), price: i1r.price, priceLabel: 'розничная цена',
    rows: [['Размеры', `${dims(i1r.dimensions)} см`], ['Столешница', 'белая, складная'], ['Опоры', 'на колёсах'], ['Экран', 'чёрный, перфорированный']],
    extra: `
    <div class="order">
      <div>
        <h3>Как заказать</h3>
        <ol class="steps">
          <li>Выберите модель по каталогу.</li>
          <li>Позвоните или напишите нам — уточним наличие и сроки.</li>
          <li>Приезжайте в шоурум посмотреть мебель вживую.</li>
        </ol>
      </div>
      <dl class="contacts">
        <div><dt>Телефон</dt><dd class="big">+996 501 111 726<br>+996 504 200 067</dd></div>
        <div><dt>Instagram</dt><dd>@matkasym_shaar</dd></div>
        <div><dt>Адрес</dt><dd>с. Маевка, ул. Тепличная, уч. 1/2</dd></div>
      </dl>
    </div>`,
  }));

  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Каталог BILIM KELECHEK</title>
<style>${CSS}</style></head><body>${pages.join('\n')}</body></html>`;
  const htmlFile = path.join(OUT, 'bilim-kelechek.html');
  fs.writeFileSync(htmlFile, html);
  const pdf = path.join(OUT, 'Каталог BILIM KELECHEK.pdf');
  execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--virtual-time-budget=90000',
    `--print-to-pdf=${pdf}`, `file://${htmlFile}`], { stdio: 'ignore', timeout: 240000 });
  console.log('PDF:', pdf, `(${pageNo} стр.)`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
