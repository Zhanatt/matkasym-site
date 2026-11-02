// Каталог 0-TASTANDY в PDF (02.11.2026): обложка, содержание, подбор по месту, разделы 01–04,
// индивидуальные заказы, как заказать. Вёрстка — server/lib/catalogLayout.js.
//
// Товары берутся по концу _id: у многих карточек нет артикула, а в сете есть пустые дубли
// («— копия», карточки без фото), которые в каталог не идут.
// Размеры — с инфографик карточек: в базе порядок осей разный, а у серии SW он просто неверен.
// База не меняется. Цену KÖRK (в базе 10 сом) считаем незаданной.
//
//   node scripts/build-0-tastandy-catalog.js <папка> [--upload]
//
// --upload — залить в Cloudinary raw matkasym/catalogs/0-tastandy.pdf. Только после согласования
// каталога пользователем, и в client/src/config/readyCatalogs.js сет надо добавить отдельно.

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const L = require('../lib/catalogLayout');
const { esc, tag, fromTag, studio, nobg, room, makePage, secHead, head, cols, grid2, series, orderPage, coverPage } = L;

const OUT = process.argv[2];
if (!OUT) { console.error('Укажите папку вывода'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });
const NAME = '0-TASTANDY';

const SECTIONS = [
  { n: '01', title: 'Уличные урны', note: 'Одна секция: металл и дерево' },
  { n: '02', title: 'Сортировочные урны', note: 'Раздельный сбор, от 2 до 4 секций' },
  { n: '03', title: 'Металлические контейнеры', note: 'Дворы и контейнерные площадки' },
  { n: '04', title: 'Пластиковые урны и баки', note: 'От 20 до 1100 литров' },
  { n: '05', title: 'Индивидуальные заказы', note: 'Партии в цвете и стиле заказчика' },
];

// key → конец _id, подпись, описание, [ширина, глубина, высота] см; img — номер кадра (по умолчанию 0)
const P = {
  gTegerek: { id: '53b6fd', v: 'G Tegerek', desc: 'Круглая напольная, металл', dims: ['Ø 24', '', '58'] },
  plaza:    { id: '53b70e', v: 'Plaza', desc: 'Напольная, металлический корпус', dims: ['45', '37', '79'] },
  bp:       { id: '53b70c', v: 'BP', desc: 'Напольная, металлический корпус', dims: ['40', '35', '80'] },
  bpPro:    { id: '53b70d', v: 'BP Pro', desc: 'Улучшенная версия BP', dims: ['40', '40', '78'] },
  jashyl:   { id: '0474d6', v: 'Jashyl', desc: 'На стойке с навесом, 30 л', dims: ['40', '30', '65'] },
  a1:       { id: '53b707', v: 'A1', desc: 'Компактная подвесная в раме, металл', dims: ['39', '13', '96'] },
  aw:       { id: '53b708', v: 'AW', desc: 'Подвесная, металл и дерево', dims: ['46', '36', '86'] },
  eco:      { id: 'd9f099', v: 'ECO', desc: 'Круглая, деревянные рейки', dims: [] },
  kork:     { id: '0e6933', v: 'KÖRK', desc: 'Металлический каркас, деревянные рейки, квадратное отверстие', dims: ['45', '45', '80'], price: 0 },
  arnur1:   { id: '0e6931', v: 'ARNUR 1', desc: 'Каркас тёмный графит, деревянные ламели, прямоугольное отверстие', dims: ['40', '40', '75'] },
  arnur2:   { id: '0e692f', v: 'ARNUR 2', desc: 'Каркас тёмный графит, деревянные ламели, круглое отверстие', dims: ['40', '40', '75'] },

  sw:  { id: '53b709', v: 'SW',  desc: '1 секция', dims: ['42', '42', '73,5'] },
  sw2: { id: '53b70a', v: 'SW2', desc: '2 секции', dims: ['74,6', '41,4', '73,3'] },
  sw3: { id: '53b70b', v: 'SW3', desc: '3 секции', dims: [] },
  gw:  { id: '53b701', v: 'GW',  desc: '1 секция, круглая', dims: ['Ø 38', '', '83'] },
  gw2: { id: '53b702', v: 'GW2', desc: '2 секции', dims: ['59,2', '38,3', '84,6'] },
  gw3: { id: '53b703', v: 'GW3', desc: '3 секции', dims: ['87,9', '38,2', '81,1'] },
  gwr:  { id: '53b704', v: 'GWR',  desc: '1 секция, съёмный полимерный бак', dims: ['Ø 37', '', '83'] },
  gwr2: { id: '53b705', v: 'GWR2', desc: '2 секции', dims: ['73', '37', '105'] },
  gwr3: { id: '53b706', v: 'GWR3', desc: '3 секции', dims: ['96', '42', '108'] },
  g2: { id: '53b6fe', v: 'G2', desc: '2 секции: пластик, бумага', dims: ['62', '35', '86'] },
  g3: { id: '53b6ff', v: 'G3', desc: '3 секции: пластик, бумага, стекло', dims: ['93', '35', '86'] },
  g4: { id: '53b700', v: 'G4', desc: '4 секции: пластик, бумага, стекло, смешанный', dims: ['123', '35', '86'] },
  karakol2: { id: '53b70f', v: 'Karakol 2', desc: '2 секции', dims: ['105', '30', '89'] },
  karakol3: { id: '53b710', v: 'Karakol 3', desc: '3 секции', dims: ['105', '30', '89'] },
  karakol4: { id: '53b711', v: 'Karakol 4', desc: '4 секции', dims: ['137', '30', '89'] },
  burch1: { id: 'cc8a84', v: '3 BURCH 1', desc: '1 секция, треугольная', dims: ['30', '30', '62'] },
  burch3: { id: '53b712', v: '3 BURCH 3', desc: '3 секции, шестигранная', dims: [] },

  taz1100:  { id: '4f6e75', v: 'Tazalyk 1100 л', dims: ['110', '97', '126'] },
  tazGray:  { id: '4f6e85', v: 'Тёмно-серый' },
  tazBlue:  { id: '3084de', v: 'Синий' },
  tazYellow:{ id: '9abf85', v: 'Жёлтый' },
  tazLid:   { id: '8e7915', v: 'Tazalyk 1100 л с крышкой', desc: 'Металл, колёса, откидной люк в крышке', dims: ['110', '97', '126'] },
  taz660:   { id: '53b715', v: 'Tazalyk 660 л', desc: 'Металл, колёса', dims: ['102', '127', '127'] },
  eco2:     { id: '5a1fc7', v: 'Ecomayak', desc: 'Сетчатая, для бутылок. Цвет зелёный или красный', cutout: true, dims: [] },

  pl20: { id: '5a234c', v: '20 л + 20 л', desc: '2 секции, педаль', dims: [] },
  pl40: { id: '5a234f', v: '40 л', desc: '2 секции, педаль', dims: [] },
  pl50: { id: '5a212c', v: '50 л', desc: 'Педаль', dims: [] },
  pl80: { id: '5a212f', v: '80 л', desc: 'Педаль', dims: [] },
  b120:  { id: '5a2340', v: '120 л', desc: 'Колёса, крышка', dims: [] },
  b120p: { id: '5a2343', v: '120 л с педалью', desc: 'Колёса, крышка', dims: [] },
  b240:  { id: '5a2346', v: '240 л', desc: 'Колёса, крышка', dims: [] },
  b240p: { id: '4f6e53', v: '240 л с педалью', desc: 'Колёса, крышка', dims: [] },
  b360:  { id: '5a2352', v: '360 л', desc: 'Колёса, крышка', img: 7, cutout: true, dims: [] },
  b660:  { id: '5a2355', v: '660 л', desc: 'Колёса, крышка. Зелёный и чёрный', img: 7, cutout: true, dims: [] },
  b1100: { id: 'ffcbea', v: '1100 л', desc: 'Колёса, крышка', dims: [] },
};

// Подбор по месту: строка — модель или серия. Каждая модель ровно в одной карточке (проверяется ниже).
const PURPOSES = [
  { t: 'Парк и сквер', p: 'Деревянная отделка рядом со скамейками и зеленью', lines: [['ECO', ['eco']], ['KÖRK', ['kork']], ['ARNUR 1', ['arnur1']], ['ARNUR 2', ['arnur2']]] },
  { t: 'Улица и АЗС', p: 'Тротуары, остановки, заправки', lines: [['G Tegerek', ['gTegerek']], ['A1', ['a1']], ['AW', ['aw']], ['BP', ['bp']], ['BP Pro', ['bpPro']]] },
  { t: 'Набережная и пляж', p: 'Открытые места, где много пластиковых бутылок', lines: [['Ecomayak', ['eco2']], ['Jashyl', ['jashyl']]] },
  { t: 'Офис и бизнес-центр', p: 'Спокойный вид у входа и в холле', lines: [['Plaza', ['plaza']], ['Серия GW', ['gw', 'gw2', 'gw3']], ['Серия 3 BURCH', ['burch1', 'burch3']]] },
  { t: 'Торговый центр и вокзал', p: 'Яркие секции, которые видно издалека', lines: [['Серия G', ['g2', 'g3', 'g4']], ['Серия Karakol', ['karakol2', 'karakol3', 'karakol4']]] },
  { t: 'Школа и вуз', p: 'Раздельный сбор в корпусах и на территории', lines: [['Серия GWR', ['gwr', 'gwr2', 'gwr3']], ['Серия SW', ['sw', 'sw2', 'sw3']]] },
  { t: 'Двор и контейнерная площадка', p: 'Большой объём, колёса для вывоза', wide: true, lines: [['Tazalyk 1100 л', ['taz1100']], ['Tazalyk с крышкой', ['tazLid']], ['Tazalyk 660 л', ['taz660']], ['Пластиковый 660 л', ['b660']], ['Пластиковый 1100 л', ['b1100']]] },
  { t: 'Дом, кафе, подсобка', p: 'Пластик: кухня, склад, частный двор', lines: [['Урны 20 и 40 л', ['pl20', 'pl40']], ['Урны 50 и 80 л', ['pl50', 'pl80']], ['Баки 120 и 240 л', ['b120', 'b120p', 'b240', 'b240p']], ['Бак 360 л', ['b360']]] },
];

const BIN_SVG = (() => {
  const G = '#7d96a0', R = '#e10523';
  return `<svg viewBox="0 0 280 300" xmlns="http://www.w3.org/2000/svg" font-family="Roboto, Helvetica, Arial" font-size="10">
    <rect x="30" y="40" width="190" height="200" rx="6" fill="none" stroke="#000" stroke-width="3"/>
    <line x1="93" y1="40" x2="93" y2="240" stroke="${G}" stroke-width="1.5"/><line x1="157" y1="40" x2="157" y2="240" stroke="${G}" stroke-width="1.5"/>
    <circle cx="61" cy="70" r="14" fill="none" stroke="${G}" stroke-width="1.5"/><circle cx="125" cy="70" r="14" fill="none" stroke="${G}" stroke-width="1.5"/><circle cx="189" cy="70" r="14" fill="none" stroke="${G}" stroke-width="1.5"/>
    <line x1="30" y1="262" x2="220" y2="262" stroke="${R}"/><line x1="30" y1="256" x2="30" y2="268" stroke="${R}"/><line x1="220" y1="256" x2="220" y2="268" stroke="${R}"/>
    <text x="125" y="282" text-anchor="middle" fill="${R}">Секции и ширина — по заказу</text>
    <line x1="244" y1="40" x2="244" y2="240" stroke="${R}"/><line x1="238" y1="40" x2="250" y2="40" stroke="${R}"/><line x1="238" y1="240" x2="250" y2="240" stroke="${R}"/>
    <text x="262" y="140" text-anchor="middle" fill="${R}" transform="rotate(-90 262 140)">Высота — по заказу</text>
  </svg>`;
})();

(async () => {
  await mongoose.connect(MONGO_URI);
  const rows = await mongoose.connection.db.collection('products').find({ set: '0-tashtandy' }).toArray();
  const M = {};
  for (const [k, p] of Object.entries(P)) {
    const d = rows.find(r => String(r._id).endsWith(p.id));
    if (!d) throw new Error('нет товара ' + p.v);
    const u = d.images?.[p.img || 0];
    if (!u) throw new Error('нет фото ' + p.v);
    const src = w => p.cutout ? nobg(u, w) : studio(u, w);
    M[k] = { ...p, key: k, doc: d, price: p.price ?? (d.price || 0), src: src(1000), thumb: src(240) };
  }
  await L.warm(Object.values(M).filter(m => m.cutout).flatMap(m => [m.src, m.thumb]));
  const pic = (k, i, w = 1400) => { const u = M[k].doc.images?.[i]; if (!u) throw new Error(`нет кадра ${k} #${i}`); return room(u, w); };
  const pick = (...keys) => keys.map(k => M[k]);

  // Сначала разделы — так известны их номера страниц для содержания и подбора
  const page = makePage(NAME, 3);
  const pageOf = {}, secPage = {};
  const add = (keys, html) => { const n = page.current() + 1; keys.forEach(k => { pageOf[k] = n; }); return page(html); };
  const body = [];
  const S = n => { const s = SECTIONS.find(x => x.n === n); secPage[n] = page.current() + 1; return secHead(s); };

  // 01. Уличные урны
  body.push(add(['gTegerek', 'plaza', 'bp', 'bpPro'], `${S('01')}${head('Металл', 'Напольные', 'Устойчивый металлический корпус с порошковой покраской. Цвет подбираем под объект.')}${grid2(pick('gTegerek', 'plaza', 'bp', 'bpPro'))}`));
  body.push(add(['jashyl', 'a1', 'aw'], `${head('Металл и дерево', 'В раме и на стойках', 'Корпус поднят над землёй: под урной легко убирать.')}
    ${cols(pick('jashyl', 'a1', 'aw'))}
    <div class="band" style="grid-template-columns:1fr 1fr;height:112mm"><div><img src="${pic('a1', 8)}" alt=""></div><div><img src="${pic('aw', 8)}" alt=""></div></div>`));
  body.push(add(['eco', 'kork', 'arnur1', 'arnur2'], `${head('Металл и дерево', 'С деревянной отделкой', 'Каркас из металла и натуральное дерево: для парков, скверов и аллей.')}${grid2(pick('eco', 'kork', 'arnur1', 'arnur2'))}`));

  // 02. Сортировочные
  body.push(add(['sw', 'sw2', 'sw3', 'gw', 'gw2', 'gw3'], `${S('02')}
    ${series('Металл и дерево', 'Серия SW', 'Строгая прямоугольная форма с деревянными вставками.', pick('sw', 'sw2', 'sw3'), 0.85)}
    ${series('Металл и дерево', 'Серия GW', 'Овальный корпус и вертикальные деревянные рейки.', pick('gw', 'gw2', 'gw3'), 1.15)}`));
  body.push(add(['gwr', 'gwr2', 'gwr3', 'g2', 'g3', 'g4'], `
    ${series('Сталь и дерево', 'Серия GWR', 'Козырёк от дождя, порошковое покрытие.', pick('gwr', 'gwr2', 'gwr3'), 1.2)}
    ${series('Металл', 'Серия G', 'Цвет секции подсказывает вид отходов. Откидная крышка, отделение на 45 л.', pick('g2', 'g3', 'g4'), 0.8)}`));
  body.push(add(['karakol2', 'karakol3', 'karakol4', 'burch1', 'burch3'], `
    ${series('Металл', 'Серия Karakol', 'Яркие секции под единым козырьком.', pick('karakol2', 'karakol3', 'karakol4'), 0.75)}
    <article class="series" style="flex-grow:1.25"><div class="s-head"><div><div class="s-kind">Металл</div><h2>Серия 3 BURCH</h2></div><p class="s-lead">Секции-треугольники: одна отдельно или три вместе.</p></div>
      <div class="mdls" style="--n:3">${cols(pick('burch1', 'burch3')).replace(/^<div class="mdls"[^>]*>|<\/div>$/g, '')}<div class="mdl"><div class="fill"><img src="${pic('burch3', 2, 900)}" alt=""></div></div></div></article>`));

  // 03. Контейнеры
  const t = M.taz1100;
  body.push(add(['taz1100'], `${S('03')}${head('Металл · 1100 литров', 'Tazalyk', 'Контейнер для дворов и контейнерных площадок. Четыре цвета, колёса для вывоза.')}
    <div class="split">
      <div class="s-photo dim" data-w="110" data-d="97" data-h="126"><img src="${t.src}" alt=""></div>
      <div><dl class="dl"><dt>Объём</dt><dd>1100 л</dd><dt>Материал</dt><dd>металл</dd><dt>Ширина</dt><dd>110 см</dd><dt>Глубина</dt><dd>97 см</dd><dt>Высота</dt><dd>126 см</dd><dt>Цена</dt><dd>${tag(t.price)}</dd></dl></div>
    </div>
    <div class="swatches" style="--n:4">${['taz1100', 'tazGray', 'tazBlue', 'tazYellow'].map(k => `<figure><img src="${studio(M[k].doc.images[0], 500)}" alt=""><figcaption>${k === 'taz1100' ? 'Зелёный' : esc(M[k].v)}</figcaption></figure>`).join('')}</div>`));
  body.push(add(['tazLid', 'taz660', 'eco2'], `${head('Металл', 'С крышкой, 660 литров и для бутылок', 'Другие размеры и исполнения для дворов и открытых пространств.')}
    <div class="g2 g2--side">${[M.tazLid, M.taz660, { ...M.eco2, tall: true }].map(L.modelCell).join('')}</div>`));

  // 04. Пластик
  body.push(add(['pl20', 'pl40', 'pl50', 'pl80', 'b120', 'b120p', 'b240', 'b240p'], `${S('04')}
    ${series('Для помещений', 'Урны с педалью', 'Кухни, цеха, подсобки. Сортировочные 2-секционные и обычные.', pick('pl20', 'pl40', 'pl50', 'pl80'))}
    ${series('Для двора', 'Баки на колёсах', 'Зелёный, чёрный, красный и синий цвета уточняйте при заказе.', pick('b120', 'b120p', 'b240', 'b240p'))}`));
  body.push(add(['b360', 'b660', 'b1100'], `${head('Для площадок', 'Большие баки на колёсах', 'Для дворов, рынков и предприятий с регулярным вывозом.')}
    ${cols(pick('b360', 'b660', 'b1100'))}
    <div class="band" style="grid-template-columns:1fr 1fr;height:88mm"><div><img src="${pic('b660', 7)}" alt=""></div><div><img src="${pic('b660', 8)}" alt=""></div></div>`));

  // 05. Индивидуальные заказы
  body.push(page(`${S('05')}
    <div class="cust-top">
      <div><div class="s-kind">Производство под заказ</div>
        <h2 class="cust-h">Урны в цвете и стиле вашего объекта</h2>
        <p class="cust-lead">Делаем партии по техническому заданию: нужное число секций, размер, цвет и логотип заказчика.
          Конструкторский отдел MATKASYM подготовит чертёж и расчёт, производство изготовит партию.</p>
        <div class="cust-ask"><span>Стоимость партии</span>${tag(0)}</div>
      </div>
      <div class="cust-draw">${BIN_SVG}</div>
    </div>
    <div class="cust-cols">
      <div><div class="s-kind">Что меняем под вас</div>
        <ul class="list"><li>Число секций и подписи на них</li><li>Размеры корпуса и форма отверстий</li><li>Цвет по каталогу RAL</li><li>Логотип компании, вырезанный лазером или наклейкой</li><li>Отделка деревом и козырёк</li></ul></div>
      <div><div class="s-kind">Для кого</div>
        <ul class="list"><li>Мэрии и городские службы</li><li>Застройщики и управляющие компании</li><li>АЗС, торговые и бизнес-центры</li><li>Школы, вузы, больницы</li><li>Парки и зоны отдыха</li></ul></div>
    </div>
    <div class="band" style="grid-template-columns:1fr 1fr;flex:1 1 0;min-height:0"><div><img src="${pic('bpPro', 5)}" style="object-position:50% 80%" alt=""></div><div><img src="${pic('karakol2', 6)}" style="object-position:50% 60%" alt=""></div></div>
    <div class="cust-stats">
      <div><b>Конструкторский отдел</b><span>Чертёж и расчёт по вашему заданию</span></div>
      <div><b>Лазерная резка и гибка</b><span>Корпуса на своём оборудовании</span></div>
      <div><b>Порошковая покраска</b><span>Любой цвет по каталогу RAL</span></div>
      <div><b>Доставка и монтаж</b><span>Привозим и устанавливаем на объекте</span></div>
    </div>`));
  body.push(orderPage(page, ['Выберите модели по каталогу или пришлите техническое задание.', 'Позвоните или напишите нам: уточним сроки и доставку.', 'Приезжайте в шоурум посмотреть изделия вживую.']));

  // Проверка подбора: каждая модель из разделов ровно один раз
  const used = PURPOSES.flatMap(c => c.lines.flatMap(l => l[1]));
  const dup = used.filter((k, i) => used.indexOf(k) !== i);
  const miss = Object.keys(pageOf).filter(k => !used.includes(k));
  if (dup.length || miss.length) throw new Error(`подбор: дубли ${dup} пропуски ${miss}`);

  // Передние полосы
  const front = makePage(NAME, 0);
  const cover = coverPage(front, [pic('eco', 2), pic('g4', 2), pic('gwr3', 7), pic('karakol4', 2)].map(u => u), NAME, 'Урны · контейнеры · баки');
  const tocRow = s => `<div class="toc-row"><span class="n">${s.n}</span><span class="t">${esc(s.title)}</span><span class="p">${String(secPage[s.n]).padStart(2, '0')}</span></div>`;
  const intro = front(`
    <div class="intro"><h2>${NAME}</h2>
      <p>Урны, сортировочные станции и контейнеры MATKASYM для улиц, дворов и общественных пространств. ${Object.keys(pageOf).length} моделей, от пластиковой урны на 20 литров до контейнера на 1100. Что куда поставить — на странице 03.</p></div>
    <div>${SECTIONS.map(tocRow).join('')}</div>
    <div class="fill"><img src="${pic('gw3', 7, 1800)}" alt=""></div>`);
  const line = ([label, keys]) => { const ms = keys.map(k => M[k]); const prices = ms.map(m => m.price).filter(x => x > 0);
    const price = prices.length ? `${keys.length > 1 ? 'от ' : ''}${L.money(Math.min(...prices))}` : L.money(0);
    return `<li><span class="pp-img"><img src="${ms[0].thumb}" alt=""></span><span class="pp-n"><b>${esc(label)}</b><i>${price}</i></span><span class="pp-p">${pageOf[keys[0]]}</span></li>`; };
  const purpose = front(`
    <div class="sec"><span class="sec-t">Подбор по месту</span><span class="sec-note">Номер справа — страница каталога</span></div>
    <div class="purp">${PURPOSES.map(c => `<div class="pp${c.wide ? ' pp--wide' : ''}"><h3>${esc(c.t)}</h3><p>${esc(c.p)}</p><ul>${c.lines.map(line).join('')}</ul></div>`).join('')}</div>`);

  const html = L.wrapHtml(`Каталог ${NAME}`, [cover, intro, purpose, ...body]);
  const htmlFile = path.join(OUT, '0-tastandy.html');
  fs.writeFileSync(htmlFile, html);
  const pdf = path.join(OUT, `Каталог ${NAME}.pdf`);
  L.renderPdf(htmlFile, pdf);
  console.log('PDF:', pdf, `(${page.current()} стр., ${Object.keys(pageOf).length} моделей)`);
  if (process.argv.includes('--upload')) {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
    const cloudinary = require('../lib/cloudinary');
    const up = await cloudinary.uploader.upload(pdf, { resource_type: 'raw', public_id: 'matkasym/catalogs/0-tastandy.pdf', overwrite: true, invalidate: true });
    console.log('Залит на сайт:', up.secure_url);
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
