// Каталог BEKEM FASAD в PDF (02.11.2026): корзины для кондиционеров, кронштейны, фасадная решётка,
// индивидуальные заказы. Вёрстка — server/lib/catalogLayout.js.
//
// Фото корзин только на стене, студийных на белом почти нет, поэтому карточка здесь — кадр с подписью.
// Не печатаем карточки без фото и цены: корзины 600×2000×550 и 600×900×550, кронштейны корзин,
// белый дубль MIDDLE 1 и MINI MKS-XX-012. База не меняется.
//
//   node scripts/build-bekem-fasad-catalog.js <папка> [--upload]
//
// --upload — залить в Cloudinary raw matkasym/catalogs/bekem-fasad.pdf. Только после согласования.

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const L = require('../lib/catalogLayout');
const { esc, tag, studio, room, makePage, secHead, orderPage, coverPage } = L;

const OUT = process.argv[2];
if (!OUT) { console.error('Укажите папку вывода'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });
const NAME = 'BEKEM FASAD';

const SECTIONS = [
  { n: '01', title: 'Корзины для кондиционеров', note: 'Наружный блок закрыт, фасад остаётся аккуратным' },
  { n: '02', title: 'Корзины с логотипом', note: 'Пример партии для застройщика' },
  { n: '03', title: 'Кронштейны', note: 'Крепление наружного блока к стене' },
  { n: '04', title: 'Фасадная решётка', note: 'Вентиляционные проёмы в отделке' },
  { n: '05', title: 'Индивидуальные заказы', note: 'Партии для жилых комплексов' },
];

// rows — строки таблицы характеристик. Размеры из названий и полей карточек: высота × ширина × глубина.
const P = {
  salkyn:   { id: '417866', v: 'Salkyn', kind: 'Лазерный узор', img: 0, cut: true, desc: 'Ажурная корзина, защищает блок и не мешает обдуву.', rows: [['Ширина', '100 см'], ['Глубина', '50 см'], ['Высота', '75 см'], ['Цвет', 'белый, антрацит']] },
  salkynP:  { id: '415e28', v: 'Salkyn+', kind: 'Лазерный узор', img: 1, desc: 'Ажурная корзина с круглым орнаментом напротив вентилятора.', rows: [['Ширина', '90 см'], ['Глубина', '50 см'], ['Высота', '70 см'], ['Цвет', 'белый']] },
  r1:       { id: '5a243a', v: 'Корзина 1х', kind: 'Разборная', img: 2, desc: 'На один наружный блок. Поставляется в разобранном виде.', rows: [['Блоков', '1'], ['Конструкция', 'разборная'], ['Цвет', 'антрацит']] },
  r2:       { id: '35c646', v: 'Корзина 2х, жалюзи', kind: 'Разборная', img: 2, desc: 'На два наружных блока, горизонтальные ламели.', rows: [['Блоков', '2'], ['Конструкция', 'разборная'], ['Цвет', 'антрацит']] },
  d1500:    { id: '2e0389', v: 'Жалюзи 150 см', kind: 'На два кондиционера', img: 0, cut: true, desc: 'Сплошной ряд ламелей.', rows: [['Ширина', '150 см'], ['Глубина', '55 см'], ['Высота', '60 см']] },
  d1900:    { id: '2e0776', v: 'Жалюзи 190 см', kind: 'На два кондиционера', img: 0, cut: true, desc: 'Сплошной ряд ламелей, большая ширина.', rows: [['Ширина', '190 см'], ['Глубина', '55 см'], ['Высота', '60 см']] },
  g1:       { id: '35adba', v: 'GOLDEN STROY 1х', kind: 'С логотипом', img: 0, desc: 'На один блок.', rows: [['Блоков', '1'], ['Цвет', 'золото']] },
  g2:       { id: '5a243d', v: 'GOLDEN STROY 2х', kind: 'С логотипом', img: 1, desc: 'На два блока.', rows: [['Блоков', '2'], ['Цвет', 'золото']] },
  gd:       { id: '5a2440', v: 'GOLDEN STROY с дверью', kind: 'С логотипом', img: 2, desc: 'Дверца для обслуживания блока.', rows: [['Ширина', '82 см'], ['Глубина', '40 см'], ['Высота', '60 см'], ['Цвет', 'золото']] },
  max:      { id: '53b743', v: 'MAX 18' },
  middle:   { id: '53b745', v: 'MIDDLE 12' },
  mini:     { id: '53b744', v: 'MINI 7-9' },
  maxGray:  { id: '5a1f5b', v: 'MAX 18 серый', noPhoto: true },
  maxDark:  { id: '3999c9', v: 'MAX 18 антрацит', noPhoto: true },
  grille:   { id: '16f1d0', v: 'JELDETÜÜ', img: 0 },
};

const BOX_SVG = (() => {
  const G = '#7d96a0', R = '#e10523';
  const slats = [70, 90, 110, 130, 150, 170].map(y => `<line x1="30" y1="${y}" x2="220" y2="${y}" stroke="${G}" stroke-width="3"/>`).join('');
  return `<svg viewBox="0 0 280 270" xmlns="http://www.w3.org/2000/svg" font-family="Roboto, Helvetica, Arial" font-size="10">
    <rect x="30" y="50" width="190" height="140" fill="none" stroke="#000" stroke-width="3"/>${slats}
    <line x1="30" y1="212" x2="220" y2="212" stroke="${R}"/><line x1="30" y1="206" x2="30" y2="218" stroke="${R}"/><line x1="220" y1="206" x2="220" y2="218" stroke="${R}"/>
    <text x="125" y="232" text-anchor="middle" fill="${R}">Ширина — под ваш блок</text>
    <line x1="244" y1="50" x2="244" y2="190" stroke="${R}"/><line x1="238" y1="50" x2="250" y2="50" stroke="${R}"/><line x1="238" y1="190" x2="250" y2="190" stroke="${R}"/>
    <text x="262" y="120" text-anchor="middle" fill="${R}" transform="rotate(-90 262 120)">Высота — под ваш блок</text>
  </svg>`;
})();

const EXTRA = `
.rows { display:grid; flex:1 1 0; min-height:0; grid-auto-rows:minmax(0, 1fr); row-gap:6mm; }
.rc { display:grid; grid-template-columns:62% 1fr; gap:8mm; min-height:0; align-items:stretch; }
.rc + .rc { border-top:1px solid var(--line); padding-top:6mm; }
.rc-photo { min-height:0; overflow:hidden; }
.rc-photo img { width:100%; height:100%; object-fit:cover; }
.rc-photo--cut img { object-fit:contain; }
.rc-text { display:flex; flex-direction:column; justify-content:center; min-width:0; }
.rc-text p { color:var(--text); margin-top:2mm; }
.rc-price { margin-top:4mm; }
.duo { display:grid; grid-template-columns:1fr 1fr; gap:4mm; flex:0 0 auto; }
.duo img { width:100%; height:100%; object-fit:cover; }
.tbl { width:100%; border-collapse:collapse; font-size:9pt; }
.tbl th { text-align:left; font-weight:500; font-size:6.8pt; letter-spacing:.1em; text-transform:uppercase; color:var(--mute); padding:0 2mm 2mm 0; border-bottom:1px solid var(--metal); white-space:nowrap; }
.tbl td { padding:2.2mm 2mm 2.2mm 0; border-bottom:1px solid var(--line); white-space:nowrap; }
.tbl .b { font-family:Montserrat, Helvetica, sans-serif; font-weight:600; }
.tbl .r { text-align:right; padding-right:0; }
`;

(async () => {
  await mongoose.connect(MONGO_URI);
  const rows = await mongoose.connection.db.collection('products').find({ set: 'bekem-fasad' }).toArray();
  const M = {};
  for (const [k, p] of Object.entries(P)) {
    const d = rows.find(r => String(r._id).endsWith(p.id));
    if (!d) throw new Error('нет товара ' + p.v);
    if (!p.noPhoto && !d.images?.length) throw new Error('нет фото ' + p.v);
    M[k] = { ...p, doc: d, price: d.price || 0 };
  }
  const pic = (k, i, w = 1400) => { const u = M[k].doc.images?.[i]; if (!u) throw new Error(`нет кадра ${k} #${i}`); return room(u, w); };
  const photo = m => m.cut ? studio(m.doc.images[m.img || 0], 1400) : pic(Object.keys(M).find(k => M[k] === m), m.img || 0, 1500);
  const card = m => `<article class="rc">
      <div class="rc-photo${m.cut ? ' rc-photo--cut' : ''}"><img src="${photo(m)}" alt=""></div>
      <div class="rc-text"><div class="s-kind">${esc(m.kind)}</div><h2>${esc(m.v)}</h2><p>${esc(m.desc)}</p>
        <dl class="dl">${m.rows.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('')}</dl>
        <div class="rc-price">${tag(m.price)}</div></div>
    </article>`;
  const cards = (...keys) => `<div class="rows">${keys.map(k => card(M[k])).join('')}</div>`;

  const page = makePage(NAME, 2);
  const secPage = {};
  const S = n => { secPage[n] = page.current() + 1; return secHead(SECTIONS.find(x => x.n === n)); };
  const body = [];
  body.push(page(`${S('01')}${cards('salkyn', 'salkynP')}`));
  body.push(page(`${cards('r1', 'r2')}`));
  body.push(page(`${cards('d1500', 'd1900')}<div class="band" style="height:78mm"><img src="${pic('r2', 1, 1800)}" alt=""></div>`));
  body.push(page(`${S('02')}${cards('g1', 'g2', 'gd')}`));

  const b = [M.mini, M.middle, M.max];
  const spec = { 'MINI 7-9': ['443 × 380 × 31', '1,4 мм', '1,3 кг'], 'MIDDLE 12': ['486 × 480 × 34', '1,8 мм', '2,1 кг'], 'MAX 18': ['554 × 500 × 34', '1,8 мм', '2,5 кг'] };
  body.push(page(`${S('03')}
    <div class="s-head"><div><div class="s-kind">Разборные · сталь · нагрузка до 30 кг</div><h2>Кронштейны для кондиционера</h2></div>
      <p class="s-lead">Крепят наружный блок кондиционера к стене здания. Цифра в названии — мощность блока.</p></div>
    <div class="duo" style="flex:1 1 0;min-height:0"><div style="min-height:0;overflow:hidden"><img src="${pic('max', 0)}" alt=""></div><div style="min-height:0;overflow:hidden"><img src="${studio(M.max.doc.images[1], 1200)}" style="object-fit:contain" alt=""></div></div>
    <table class="tbl"><thead><tr><th>Модель</th><th>Ш × В × Г, мм</th><th>Толщина</th><th>Вес</th><th class="r">Цена</th></tr></thead><tbody>
      ${b.map(m => `<tr><td class="b">${esc(m.v)}</td>${spec[m.v].map(x => `<td>${x}</td>`).join('')}<td class="r">${tag(m.price)}</td></tr>`).join('')}
      <tr><td class="b">${esc(M.maxGray.v)}</td><td>${spec['MAX 18'][0]}</td><td>${spec['MAX 18'][1]}</td><td>${spec['MAX 18'][2]}</td><td class="r">${tag(M.maxGray.price)}</td></tr>
      <tr><td class="b">${esc(M.maxDark.v)}</td><td>${spec['MAX 18'][0]}</td><td>${spec['MAX 18'][1]}</td><td>${spec['MAX 18'][2]}</td><td class="r">${tag(M.maxDark.price)}</td></tr>
    </tbody></table>
    `));
  body.push(page(`${S('04')}
    <div class="s-head"><div><div class="s-kind">Вентиляция</div><h2>JELDETÜÜ</h2></div>
      <p class="s-lead">Жалюзийная решётка закрывает вентиляционный проём и сохраняет линию фасада.</p></div>
    <div class="fill"><img src="${pic('grille', 0, 1800)}" alt=""></div>
    <div class="fill" style="flex:0.7 1 0"><img src="${pic('grille', 1, 1800)}" style="object-position:50% 50%" alt=""></div>
    <div class="cust-ask" style="margin-top:0"><span>Стоимость по размеру проёма</span>${tag(0)}</div>`));
  body.push(page(`${S('05')}
    <div class="cust-top">
      <div><div class="s-kind">Производство под заказ</div>
        <h2 class="cust-h">Единые корзины для всего дома</h2>
        <p class="cust-lead">Делаем партии для жилых комплексов и бизнес-центров: под размер вашего блока, с узором и логотипом застройщика, в цвете фасада. Конструкторский отдел MATKASYM подготовит чертёж и расчёт.</p>
        <div class="cust-ask"><span>Стоимость партии</span>${tag(0)}</div>
      </div>
      <div class="cust-draw">${BOX_SVG}</div>
    </div>
    <div class="cust-cols">
      <div><div class="s-kind">Что меняем под вас</div>
        <ul class="list"><li>Размер под блок кондиционера</li><li>Узор, вырезанный лазером, или ламели</li><li>Логотип застройщика</li><li>Цвет по каталогу RAL</li><li>Дверца для обслуживания</li></ul></div>
      <div><div class="s-kind">Для кого</div>
        <ul class="list"><li>Застройщики жилых комплексов</li><li>Управляющие компании и ТСЖ</li><li>Бизнес-центры и гостиницы</li><li>Торговые центры</li><li>Монтажники кондиционеров</li></ul></div>
    </div>
    <div class="fill"><img src="${pic('g1', 1, 1800)}" style="object-position:50% 65%" alt=""></div>
    <div class="cust-stats">
      <div><b>Конструкторский отдел</b><span>Чертёж и расчёт по вашему заданию</span></div>
      <div><b>Лазерная резка и гибка</b><span>Узоры и корпуса на своём оборудовании</span></div>
      <div><b>Порошковая покраска</b><span>Любой цвет по каталогу RAL</span></div>
      <div><b>Доставка и монтаж</b><span>Привозим и устанавливаем на объекте</span></div>
    </div>`));
  body.push(orderPage(page, ['Выберите модель по каталогу или пришлите размеры блока.', 'Позвоните или напишите нам: уточним сроки и доставку.', 'Приезжайте в шоурум посмотреть изделия вживую.']));

  const front = makePage(NAME, 0);
  const cover = coverPage(front, [pic('g1', 1), pic('salkyn', 1), pic('r2', 1), pic('salkynP', 2)], NAME, 'Корзины · кронштейны · решётки');
  const tocRow = s => `<div class="toc-row"><span class="n">${s.n}</span><span class="t">${esc(s.title)}</span><span class="p">${String(secPage[s.n]).padStart(2, '0')}</span></div>`;
  const intro = front(`
    <div class="intro"><h2>${NAME}</h2>
      <p>«Прочный фасад»: корзины и кронштейны для наружных блоков кондиционеров и фасадные решётки MATKASYM. Для застройщиков, управляющих компаний и монтажников.</p></div>
    <div>${SECTIONS.map(tocRow).join('')}</div>
    <div class="fill"><img src="${pic('salkyn', 2, 1800)}" alt=""></div>`);

  const html = L.wrapHtml(`Каталог ${NAME}`, [cover, intro, ...body], EXTRA);
  const htmlFile = path.join(OUT, 'bekem-fasad.html');
  fs.writeFileSync(htmlFile, html);
  const pdf = path.join(OUT, `Каталог ${NAME}.pdf`);
  L.renderPdf(htmlFile, pdf);
  console.log('PDF:', pdf, `(${page.current()} стр.)`);
  if (process.argv.includes('--upload')) {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
    const cloudinary = require('../lib/cloudinary');
    const up = await cloudinary.uploader.upload(pdf, { resource_type: 'raw', public_id: 'matkasym/catalogs/bekem-fasad.pdf', overwrite: true, invalidate: true });
    console.log('Залит на сайт:', up.secure_url);
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
