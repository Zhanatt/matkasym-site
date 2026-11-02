// Каталог BEKEM TOSMO в PDF (02.11.2026). Цены — индивидуальные (сказал пользователь).
// JALUZI tosmo и JALUZI tosmo 2: размеров нет ни в базе, ни на NAS. Sky Соңкөл — из техлиста;
// кадры matkasym/bekem-tosmo/{sky,fence} вынуты из техлистов. Панель для ворот «звёздный» не печатаем:
// нет ни фото, ни данных. База не меняется.
//
//   node scripts/build-bekem-tosmo-catalog.js <папка> [--upload]

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const L = require('../lib/catalogLayout');
const { esc, tag, room, makePage, secHead, orderPage, coverPage, CLOUD } = L;

const OUT = process.argv[2];
if (!OUT) { console.error('Укажите папку вывода'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });
const NAME = 'BEKEM TOSMO';
const asset = (id, w) => `${CLOUD}/f_jpg,q_auto:good,w_${w},c_limit/matkasym/bekem-tosmo/${id}`;

const SECTIONS = [
  { n: '01', title: 'Жалюзийные ограждения', note: 'Закрывают от взглядов, пропускают воздух' },
  { n: '02', title: 'Перегородки', note: 'Узор и название, вырезанные лазером' },
  { n: '03', title: 'Индивидуальные заказы', note: 'Ограждения по вашему проекту' },
];

const EXTRA = `
.cover-grid { grid-template-columns:1fr; }
.list li { padding:3.4mm 0; }
.hero { flex:1 1 0; min-height:0; display:flex; flex-direction:column; gap:3mm; }
.hero + .hero { border-top:1px solid var(--line); padding-top:6mm; }
.hero-img { flex:1 1 0; min-height:0; overflow:hidden; }
.hero-img img { width:100%; height:100%; object-fit:cover; }
.hero-cap { display:flex; justify-content:space-between; align-items:center; gap:6mm; }
.hero-cap h2 { white-space:nowrap; }
.hero-cap p { color:var(--text); flex:1; }
.sky { flex:1 1 0; min-height:0; }
.sky img { width:100%; height:100%; object-fit:contain; }
.sky-dl { display:grid; grid-template-columns:1fr 1fr; gap:0 10mm; }
.sky-dl .dl { margin-top:0; }
.proj { display:grid; grid-template-columns:1fr 1fr; gap:8mm; align-items:center; }
.proj img { width:100%; height:auto; }
`;

(async () => {
  await mongoose.connect(MONGO_URI);
  const rows = await mongoose.connection.db.collection('products').find({ set: 'bekem-tosmo' }).toArray();
  const bySku = sku => { const p = rows.find(r => r.sku === sku); if (!p?.images?.[0]) throw new Error('нет фото ' + sku); return p.images[0]; };
  const j1 = bySku('MKS-BT-002'), j2 = bySku('MKS-BT-003');

  const page = makePage(NAME, 2);
  const secPage = {};
  const S = n => { secPage[n] = page.current() + 1; return secHead(SECTIONS.find(x => x.n === n)); };
  const hero = (src, name, text) => `<article class="hero"><div class="hero-img"><img src="${src}" alt=""></div>
    <div class="hero-cap"><h2>${esc(name)}</h2><p>${esc(text)}</p>${tag(0)}</div></article>`;
  const body = [];
  body.push(page(`${S('01')}
    ${hero(room(j1, 1800), 'JALUZI tosmo', 'Горизонтальные ламели между стойками. Размер секции — под ваш участок.')}
    ${hero(room(j2, 1800), 'JALUZI tosmo 2', 'Широкие ламели с калиткой и стойками. Размер секции — под ваш участок.')}`));
  body.push(page(`${S('02')}
    <div class="s-head"><div><div class="s-kind">Перегородка с названием</div><h2>Sky Соңкөл</h2></div>
      <p class="s-lead">Листовой металл с лазерным узором в раме из профильной трубы. Название объекта — вырезано в листе.</p></div>
    <div class="sky"><img src="${asset('sky', 2100)}" alt=""></div>
    <div class="sky-dl">
      <dl class="dl"><dt>Лист</dt><dd>250 × 100 см</dd><dt>С профилем</dt><dd>255 × 105 см</dd><dt>Толщина листа</dt><dd>1,5 мм</dd></dl>
      <dl class="dl"><dt>Рама</dt><dd>труба 25 × 25 × 1,1 мм</dd><dt>Выступ рамы</dt><dd>20 см</dd><dt>Цвет</dt><dd>антрацит</dd></dl>
    </div>
    <div class="cust-ask" style="margin-top:0"><span>Стоимость</span>${tag(0)}</div>`));
  body.push(page(`${S('03')}
    <div class="s-head"><div><div class="s-kind">Производство под заказ</div><h2 class="cust-h" style="margin:0">Ограждения по вашему проекту</h2></div>
      <p class="s-lead">Изготавливаем с логотипами компаний заказчиков. Конструкторский отдел MATKASYM подготовит чертёж и расчёт, производство изготовит партию.</p></div>
    <div class="proj">
      <img src="${asset('fence', 1044)}" alt="">
      <div><div class="s-kind">Пример проекта</div><h2>Декоративное ограждение</h2>
        <dl class="dl"><dt>Секция</dt><dd>343 × 190 см</dd><dt>Стойка</dt><dd>120 × 120 мм</dd><dt>Каркас</dt><dd>профиль 40 × 40 × 0,9 мм</dd><dt>Цвет</dt><dd>антрацит, RAL 7016</dd></dl></div>
    </div>
    <div class="cust-cols">
      <div><div class="s-kind">Что делаем</div>
        <ul class="list"><li>Жалюзийные и решётчатые секции</li><li>Перегородки с лазерным узором</li><li>Сварные панели (еврозабор)</li><li>Панели для ворот и калиток</li><li>Ограждения с вазонами для цветов</li></ul></div>
      <div><div class="s-kind">Что меняем под вас</div>
        <ul class="list"><li>Размер секции и шаг стоек</li><li>Узор, вырезанный лазером</li><li>Логотип или название компании</li><li>Цвет по каталогу RAL</li><li>Способ крепления к основанию</li></ul></div>
    </div>
    <div class="cust-ask" style="margin-top:0"><span>Стоимость партии</span>${tag(0)}</div>
    <div class="cust-stats" style="margin-top:auto">
      <div><b>Конструкторский отдел</b><span>Чертёж и расчёт по вашему заданию</span></div>
      <div><b>Лазерная резка и гибка</b><span>Панели на своём оборудовании</span></div>
      <div><b>Порошковая покраска</b><span>Любой цвет по каталогу RAL</span></div>
      <div><b>Доставка и монтаж</b><span>Привозим и устанавливаем на объекте</span></div>
    </div>`));
  body.push(orderPage(page, ['Выберите модель по каталогу или пришлите проект и длину ограждения.', 'Позвоните или напишите нам: рассчитаем стоимость и сроки.', 'Согласовываем чертёж, производим и устанавливаем.']));

  const front = makePage(NAME, 0);
  const cover = coverPage(front, [room(j1, 1600), room(j2, 1600)], NAME, 'Ограждения · перегородки');
  const tocRow = s => `<div class="toc-row"><span class="n">${s.n}</span><span class="t">${esc(s.title)}</span><span class="p">${String(secPage[s.n]).padStart(2, '0')}</span></div>`;
  const intro = front(`
    <div class="intro"><h2>${NAME}</h2>
      <p>Металлические ограждения и перегородки MATKASYM для частных домов, жилых комплексов и общественных пространств. Изготавливаем под размер вашего участка и с логотипами компаний заказчиков.</p></div>
    <div>${SECTIONS.map(tocRow).join('')}</div>
    <div class="fill"><img src="${room(j2, 1800)}" alt=""></div>`);

  const htmlFile = path.join(OUT, 'bekem-tosmo.html');
  fs.writeFileSync(htmlFile, L.wrapHtml(`Каталог ${NAME}`, [cover, intro, ...body], EXTRA));
  const pdf = path.join(OUT, `Каталог ${NAME}.pdf`);
  L.renderPdf(htmlFile, pdf);
  console.log('PDF:', pdf, `(${page.current()} стр.)`);
  if (process.argv.includes('--upload')) {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
    const cloudinary = require('../lib/cloudinary');
    const up = await cloudinary.uploader.upload(pdf, { resource_type: 'raw', public_id: 'matkasym/catalogs/bekem-tosmo.pdf', overwrite: true, invalidate: true });
    console.log('Залит на сайт:', up.secure_url);
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
