// Каталог труб для сета «Dayar Tutuk» — отдельный макет, не общий CatalogPDF:
// клиенту нужен не список карточек с фото, а прайс-лист по размерам, где
// на одном листе видно весь сортамент и цену за шестиметровую трубу.
import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet, Font, pdf } from '@react-pdf/renderer';

Font.register({
  family: 'Roboto',
  fonts: [
    { src: '/fonts/Roboto-Regular.ttf', fontWeight: 400 },
    { src: '/fonts/Roboto-Medium.ttf',  fontWeight: 500 },
    { src: '/fonts/Roboto-Bold.ttf',    fontWeight: 700 },
  ],
});
Font.registerHyphenationCallback(w => [w]);

// ── Палитра ───────────────────────────────────────────────────────────────────
const NAVY      = '#14315E';
const NAVY_DEEP = '#0D2244';
const GOLD      = '#F5B921';
const GOLD_SOFT = '#FFF7E3';
const GOLD_LINE = '#E8C878';
const INK       = '#121A24';
const GRAY      = '#6B7684';
const GRAY_SOFT = '#98A2AF';
const LINE      = '#E2E7EE';
const PHOTO_BG  = '#F1F4F8';
const PAPER     = '#FFFFFF';

const LOGO = '/logos/logo-white.png';

// Длина хлыста; цена в прайсе — за погонный метр, как в базе
const PIPE_LENGTH_M = 6;

// ── Тексты ────────────────────────────────────────────────────────────────────
const L = {
  ky: {
    title: 'ТҮТҮКТӨР КАТАЛОГУ',
    subtitle: 'Металл түтүктөрдүн баа тизмеси',
    common: 'ЖАЛПЫ МҮНӨЗДӨМӨЛӨРҮ',
    page: n => `${n}-БЕТ`,
    colSize: 'ӨЛЧӨМҮ',
    colWall: 'МЕТАЛЛДЫН КАЛЫҢДЫГЫ',
    colPrice: 'БААСЫ, 1 М ҮЧҮН',
    currency: 'сом',
    noPrice: 'келишим боюнча',
    cont: 'уландысы',
    footerTitle: 'КЕҢИРИ АССОРТИМЕНТТЕГИ ТҮТҮКТӨР',
    footerBullets: [
      'Ар кандай өлчөмдөр жеткиликтүү',
      'Өзгөчө суроо-талаптар боюнча өндүрүү мүмкүн',
    ],
    types: {
      'Круглая':       { name: 'ТЕГЕРЕК ТҮТҮК',     note: 'Ар кандай курулуш жана өндүрүш иштерине ылайыктуу' },
      'Квадратная':    { name: 'КВАДРАТ ТҮТҮК',     note: 'Каркас жана металл конструкциялар үчүн' },
      'Прямоугольная': { name: 'ТИК БУРЧТУУ ТҮТҮК', note: 'Рамалар, тосмолор жана эмерек үчүн' },
      'Овальная':      { name: 'ОВАЛ ТҮТҮК',        note: 'Эмерек жана декоративдик конструкциялар үчүн' },
    },
    file: 'matkasym-tutukter-katalogu.pdf',
  },
  ru: {
    title: 'КАТАЛОГ ТРУБ',
    subtitle: 'Прайс-лист на металлические трубы',
    common: 'ОБЩИЕ ХАРАКТЕРИСТИКИ',
    page: n => `СТР. ${n}`,
    colSize: 'РАЗМЕР',
    colWall: 'ТОЛЩИНА МЕТАЛЛА',
    colPrice: 'ЦЕНА ЗА 1 М',
    currency: 'сом',
    noPrice: 'по запросу',
    cont: 'продолжение',
    footerTitle: 'ШИРОКИЙ АССОРТИМЕНТ ТРУБ',
    footerBullets: [
      'Доступны любые размеры',
      'Возможно производство по индивидуальному заказу',
    ],
    types: {
      'Круглая':       { name: 'КРУГЛАЯ ТРУБА',       note: 'Подходит для любых строительных и производственных работ' },
      'Квадратная':    { name: 'КВАДРАТНАЯ ТРУБА',    note: 'Для каркасов и металлоконструкций' },
      'Прямоугольная': { name: 'ПРЯМОУГОЛЬНАЯ ТРУБА', note: 'Для рам, ограждений и мебели' },
      'Овальная':      { name: 'ОВАЛЬНАЯ ТРУБА',      note: 'Для мебели и декоративных конструкций' },
    },
    file: 'matkasym-katalog-trub.pdf',
  },
};

// Порядок разделов каталога задан владельцем: круглая → овальная → квадратная
// → прямоугольная. По нему же нумеруются секции.
const TYPE_ORDER = ['Круглая', 'Овальная', 'Квадратная', 'Прямоугольная'];

// Характеристики в каталоге читаются как свойства товара, а не как строки базы:
// «Шов: Нет» превращается в «Бесшовная».
const SPEC_PHRASE = {
  ky: {
    'материал':            v => v,
    'прокат':              v => (/холодно/i.test(v) ? 'Муздак прокат' : v),
    'шов':                 v => (/нет/i.test(v) ? 'Тигишсиз' : 'Тигиши бар'),
    'страна производства': v => `Өндүрүлгөн жери: ${v}`,
    'длина трубы':         v => `Узундугу ${v}`,
  },
  ru: {
    'материал':            v => v,
    'прокат':              v => v,
    'шов':                 v => (/нет/i.test(v) ? 'Бесшовная' : 'Со швом'),
    'страна производства': v => `Производство: ${v}`,
    'длина трубы':         v => `Длина ${v}`,
  },
};

// Размерные и штучные характеристики у каждой позиции свои — в общий блок не идут.
const PER_ITEM_SPECS = new Set([
  'тип', 'толщина стенки', 'диаметр', 'диаметр трубы', 'размер трубы', 'сечение',
  'количество в пачке', 'количество в одной пачке', 'количество',
]);

// Характеристики, совпадающие у ВСЕХ труб каталога: их место в шапке, а не в
// каждой строке таблицы. Считаем по данным, а не списком в коде, — поменяют
// сталь или страну в карточках, каталог подхватит сам.
const SPEC_RANK = ['материал', 'шов', 'прокат', 'длина трубы', 'страна производства'];

const commonSpecs = (products, lang) => {
  const [first] = products;
  if (!first) return [];
  const phrase = SPEC_PHRASE[lang] || SPEC_PHRASE.ky;
  const out = [];
  for (const s of first.specs || []) {
    const key = String(s.key || '').trim();
    const val = String(s.value || '').trim();
    if (!key || !val || PER_ITEM_SPECS.has(key.toLowerCase())) continue;
    const everywhere = products.every(p => (p.specs || []).some(x =>
      String(x.key || '').trim().toLowerCase() === key.toLowerCase() &&
      String(x.value || '').trim() === val));
    if (everywhere) out.push({ key: key.toLowerCase(), text: (phrase[key.toLowerCase()] || (v => `${key}: ${v}`))(val) });
  }
  const rank = k => (SPEC_RANK.indexOf(k) + 1 || 99);
  return out.sort((a, b) => rank(a.key) - rank(b.key)).map(x => x.text);
};

// ── Разбор товара ─────────────────────────────────────────────────────────────
const spec = (p, key) => (p.specs || []).find(s => s.key?.trim().toLowerCase() === key)?.value?.trim();

// null — значит позиция не труба (в сете лежат ещё и услуги вроде лазерной резки)
const typeOf = (p) => {
  const t = spec(p, 'тип');
  if (t && TYPE_ORDER.includes(t)) return t;
  const n = (p.name || '').toLowerCase();
  if (!n.startsWith('труба')) return null;
  return TYPE_ORDER.find(x => n.includes(x.toLowerCase())) || null;
};

// «Труба круглая 16×0,5» → ['16', '0,5'];  «Труба квадратная 15x15x0,9» → ['15x15', '0,9']
const fromName = (name) => {
  const tail = (name || '').replace(/^.*?(\d)/, '$1').split(/[×x*]/).map(s => s.trim());
  if (tail.length < 2) return [null, null];
  return [tail.slice(0, -1).join('×'), tail[tail.length - 1]];
};

const num = (s) => parseFloat(String(s ?? '').replace(',', '.').replace(/[^\d.]/g, '')) || 0;

// Режим цен из шапки каталога → поле товара. 'none' — каталог без цен:
// такой прайс возят на переговоры, где цену называют голосом.
const PRICE_FIELD = { retail: 'price', wholesale: 'priceWholesale', dealer: 'priceDealer' };

const rowOf = (p, type, dict, priceField) => {
  const [nSize, nWall] = fromName(p.name);
  const round = type === 'Круглая';
  const size  = (spec(p, 'диаметр трубы') || spec(p, 'размер трубы') || p.dimensions || nSize || '')
                  .replace(/\s*мм$/i, '').replace(/^[⌀Øø]\s*/, '').trim();
  const wall  = (spec(p, 'толщина стенки') || nWall || '').replace(/\s*мм$/i, '').trim();
  if (!size || !wall) return null;           // без размеров строка в прайсе бессмысленна
  const price = priceField && Number(p[priceField]) > 0 ? Number(p[priceField]) : null;
  return {
    key:   p._id || p.sku,
    size:  round ? `Ø ${size} мм` : `${size.replace(/[x*]/g, '×')} мм`,
    wall:  `${String(wall).replace('.', ',')} мм`,
    price: price === null ? null : price.toLocaleString('ru-RU'),
    sortA: num(size),
    sortB: num(wall),
  };
};

// ── Раскладка ─────────────────────────────────────────────────────────────────
// Высота строки таблицы. Ею же раскладка считает, сколько строк влезет на лист,
// и её же использует стиль tr — модель и вёрстка не должны расходиться.
// 15 pt подобрано так, чтобы круглая с овальной уместились на первый лист, а
// квадратная с прямоугольной на второй: при 17 pt круглая занимала лист целиком
// и каталог разъезжался на три страницы с пустотой внизу первой.
const ROW_H        = 15;
const BLOCK_CHROME = 44;   // шапка таблицы и отступ под карточкой
const BLOCK_SPLIT  = 14;   // разделитель, если карточка не первая на листе
// Колонка с фото и свойствами трубы. Растёт вместе с photoWrap: если оставить
// прежнюю высоту, раскладка посчитает карточку ниже, чем она есть, и последняя
// на листе налезет на колонтитул.
const BLOCK_MIN_H  = 280;
const MIN_ROWS     = 4;    // хвост короче уже не выглядит таблицей
const FOOTER_H     = 96;
const PAGE_BODY_H  = 700;  // A4 за вычетом шапки и колонтитула

const blockHeight = (rows, split) =>
  Math.max(BLOCK_MIN_H, BLOCK_CHROME + rows * ROW_H) + (split ? BLOCK_SPLIT : 0);

// Фото для секции — то, что стоит у большинства позиций линейки: это общий кадр
// трубы. У отдельных товаров первым лежит рекламный баннер с текстом и ценой —
// в прайсе он смотрелся бы рекламой внутри рекламы.
const sectionPhoto = (items) => {
  const count = new Map();
  // считаем по всей галерее: общий кадр у части позиций лежит не первым
  items.forEach(p => (p.images || []).forEach(u => count.set(u, (count.get(u) || 0) + 1)));
  let best = null, top = 0;
  for (const [url, n] of count) if (n > top) { best = url; top = n; }
  return best;
};

const groupRows = (products, dict, priceField) => {
  const byType = {};
  products.forEach(p => {
    const t = typeOf(p);
    if (t) (byType[t] ||= []).push(p);
  });
  return TYPE_ORDER.filter(t => byType[t]?.length).map(type => ({
    type,
    photo: sectionPhoto(byType[type]),
    rows:  byType[type].map(p => rowOf(p, type, dict, priceField)).filter(Boolean)
             .sort((a, b) => a.sortA - b.sortA || a.sortB - b.sortB),
  })).filter(g => g.rows.length);
};

// Карточка не переносится по строкам — она цельная, с фото и заголовком. Поэтому
// страницы набиваем сами: длинный тип режем ровно по месту, что осталось на листе,
// а хвост короче MIN_ROWS не оставляем — двумя строками лист начинать некрасиво.
const layout = (products, dict, priceField) => {
  const pages = [];
  let page = [], left = PAGE_BODY_H;

  const flush = () => { if (page.length) pages.push(page); page = []; left = PAGE_BODY_H; };

  groupRows(products, dict, priceField).forEach((group, i) => {
    let rest = group.rows, cont = false;
    while (rest.length) {
      const split    = page.length > 0;
      const chrome   = BLOCK_CHROME + (split ? BLOCK_SPLIT : 0);
      const capacity = Math.floor((left - chrome) / ROW_H);
      if (capacity < MIN_ROWS || left < BLOCK_MIN_H + (split ? BLOCK_SPLIT : 0)) { flush(); continue; }
      // рвать тип посреди листа стоит только если он и на пустой лист не влезает
      if (capacity < rest.length && blockHeight(rest.length, false) <= PAGE_BODY_H && split) { flush(); continue; }

      let take = Math.min(capacity, rest.length);
      if (rest.length - take > 0 && rest.length - take < MIN_ROWS) take = rest.length - MIN_ROWS;

      page.push({ type: group.type, num: i + 1, photo: group.photo, rows: rest.slice(0, take), cont });
      left -= blockHeight(take, split);
      rest = rest.slice(take);
      cont = true;
    }
  });
  flush();

  const used = (pages[pages.length - 1] || []).reduce((s, b, i) => s + blockHeight(b.rows.length, i > 0), 0);
  return { pages, footerOnLast: PAGE_BODY_H - used >= FOOTER_H };
};

// ── Стили ─────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page:       { fontFamily: 'Roboto', backgroundColor: PAPER, paddingBottom: 34 },

  header:     { backgroundColor: NAVY, paddingHorizontal: 26, paddingTop: 15, paddingBottom: 13 },
  headRow:    { flexDirection: 'row', alignItems: 'flex-start' },
  headLeft:   { flex: 1 },
  logo:       { width: 88, height: 16, marginBottom: 9 },
  title:      { color: PAPER, fontSize: 20, fontWeight: 700, letterSpacing: 1.6 },
  subtitle:   { color: '#9CB3D4', fontSize: 8, marginTop: 3, letterSpacing: 0.3 },
  pageNum:    { borderWidth: 0.8, borderColor: '#5C7BAA', borderRadius: 2,
                paddingHorizontal: 7, paddingVertical: 3 },
  pageNumT:   { color: PAPER, fontSize: 7.5, fontWeight: 500, letterSpacing: 0.9 },
  goldRule:   { height: 2.6, backgroundColor: GOLD },


  props:      { marginTop: 9, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: LINE },
  propRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 3.5 },
  propDot:    { width: 2.6, height: 2.6, borderRadius: 1.3, backgroundColor: GOLD, marginRight: 6 },
  propText:   { color: INK, fontSize: 7.8, fontWeight: 700 },

  body:       { paddingHorizontal: 26, paddingTop: 14 },

  block:      { flexDirection: 'row', marginBottom: 14, minHeight: BLOCK_MIN_H },
  blockSplit: { borderTopWidth: 0.5, borderTopColor: LINE, paddingTop: 14 },
  side:       { width: '31%', paddingRight: 16 },
  numBox:     { width: 21, height: 21, borderRadius: 2, backgroundColor: NAVY,
                alignItems: 'center', justifyContent: 'center', marginBottom: 7 },
  numT:       { color: PAPER, fontSize: 10, fontWeight: 700 },
  typeName:   { color: INK, fontSize: 11.5, fontWeight: 700, letterSpacing: 0.5, lineHeight: 1.2 },
  contMark:   { color: GRAY_SOFT, fontSize: 7.5, fontWeight: 400, letterSpacing: 0.4, marginTop: 2 },
  typeNote:   { color: GRAY, fontSize: 7.5, marginTop: 5, lineHeight: 1.45 },
  photoWrap:  { marginTop: 9, backgroundColor: PHOTO_BG, borderRadius: 3, padding: 10, height: 150 },
  photo:      { width: '100%', height: '100%', objectFit: 'contain' },

  table:      { flex: 1 },
  th:         { flexDirection: 'row', alignItems: 'flex-end', height: 26, paddingBottom: 5,
                borderBottomWidth: 1, borderBottomColor: NAVY },
  thT:        { color: GRAY, fontSize: 6.2, fontWeight: 700, letterSpacing: 0.9, textAlign: 'center' },

  tr:         { flexDirection: 'row', alignItems: 'center', height: ROW_H,
                borderBottomWidth: 0.5, borderBottomColor: LINE },

  cSize:      { flex: 1 },
  cWall:      { width: 96, textAlign: 'center' },
  cPrice:     { width: 96, textAlign: 'right', paddingRight: 3, flexDirection: 'row',
                alignItems: 'baseline', justifyContent: 'flex-end' },


  tdSize:     { fontSize: 9, color: INK, fontWeight: 500 },
  tdWall:     { fontSize: 8.5, color: GRAY },
  tdPrice:    { fontSize: 9.5, color: INK, fontWeight: 700 },
  tdCur:      { fontSize: 7.5, color: GRAY, marginLeft: 3 },
  tdAsk:      { fontSize: 8, color: GRAY_SOFT },


  footer:     { backgroundColor: NAVY_DEEP, borderRadius: 4, paddingVertical: 16, paddingHorizontal: 18 },
  footerT:    { color: GOLD, fontSize: 12, fontWeight: 700, letterSpacing: 1 },
  bullet:     { flexDirection: 'row', alignItems: 'center', marginTop: 7 },
  bulletDot:  { width: 3, height: 3, borderRadius: 1.5, backgroundColor: GOLD, marginRight: 7 },
  bulletT:    { color: '#D3DEEE', fontSize: 8.5 },

  pageFoot:   { position: 'absolute', bottom: 15, left: 26, right: 26,
                flexDirection: 'row', justifyContent: 'space-between',
                borderTopWidth: 0.5, borderTopColor: LINE, paddingTop: 7 },
  pageFootT:  { color: GRAY_SOFT, fontSize: 6.5, letterSpacing: 1 },
});

// ── Куски документа ───────────────────────────────────────────────────────────
const Header = ({ dict }) => (
  <View fixed>
    <View style={S.header}>
      <View style={S.headRow}>
        <View style={S.headLeft}>
          <Image src={LOGO} style={S.logo} />
          <Text style={S.title}>{dict.title}</Text>
          <Text style={S.subtitle}>{dict.subtitle}</Text>
        </View>
        <View style={S.pageNum}>
          <Text style={S.pageNumT} render={({ pageNumber }) => dict.page(pageNumber)} />
        </View>
      </View>
    </View>
    <View style={S.goldRule} />
  </View>
);

const Block = ({ block, dict, common, first, showPrice }) => {
  const meta = dict.types[block.type] || { name: block.type, note: '' };
  return (
    <View style={[S.block, !first && S.blockSplit]} wrap={false}>
      <View style={S.side}>
        <View style={S.numBox}><Text style={S.numT}>{block.num}</Text></View>
        <Text style={S.typeName}>{meta.name}</Text>
        {block.cont && <Text style={S.contMark}>{dict.cont}</Text>}
        <Text style={S.typeNote}>{meta.note}</Text>
        {block.photo && (
          <View style={S.photoWrap}>
            <Image src={block.photo} style={S.photo} />
          </View>
        )}
        {common.length > 0 && (
          <View style={S.props}>
            {common.map(c => (
              <View key={c} style={S.propRow}>
                <View style={S.propDot} />
                <Text style={S.propText}>{c}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={S.table}>
        <View style={S.th}>
          <Text style={[S.thT, S.cSize, { textAlign: 'left', paddingLeft: 3 }]}>{dict.colSize}</Text>
          <Text style={[S.thT, S.cWall]}>{dict.colWall}</Text>
          {showPrice && (
            <Text style={[S.thT, { width: 96, textAlign: 'right', paddingRight: 3 }]}>{dict.colPrice}</Text>
          )}
        </View>

        {block.rows.map(r => (
          <View key={r.key} style={S.tr}>
            <Text style={[S.tdSize, S.cSize, { paddingLeft: 3 }]}>{r.size}</Text>
            <Text style={[S.tdWall, S.cWall]}>{r.wall}</Text>
            {/* Колонки нет вовсе, а не пустая: «уточняйте» в каждой строке
                выглядело бы как отсутствие цены, а не как каталог без цен.
                Размер растянется на освободившееся место — у него flex: 1. */}
            {showPrice && (
              <View style={S.cPrice}>
                {r.price
                  ? <><Text style={S.tdPrice}>{r.price}</Text><Text style={S.tdCur}>{dict.currency}</Text></>
                  : <Text style={S.tdAsk}>{dict.noPrice}</Text>}
              </View>
            )}
          </View>
        ))}

      </View>
    </View>
  );
};

const Footer = ({ dict }) => (
  <View style={S.footer} wrap={false}>
    <Text style={S.footerT}>{dict.footerTitle}</Text>
    {dict.footerBullets.map(b => (
      <View key={b} style={S.bullet}>
        <View style={S.bulletDot} />
        <Text style={S.bulletT}>{b}</Text>
      </View>
    ))}
  </View>
);

const PageFoot = ({ dict }) => (
  <View style={S.pageFoot} fixed>
    <Text style={S.pageFootT}>MATKASYM</Text>
    <Text style={S.pageFootT} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
  </View>
);

function TubesDocument({ products, lang, priceMode = 'retail' }) {
  const priceField = PRICE_FIELD[priceMode] || null;   // null = каталог без цен
  const showPrice  = !!priceField;
  const dict = L[lang] || L.ky;
  const common = commonSpecs(products.filter(p => typeOf(p)), lang);
  const { pages, footerOnLast } = layout(products, dict, priceField);

  return (
    <Document title={dict.title} author="MATKASYM">
      {pages.map((blocks, i) => (
        <Page key={i} size="A4" style={S.page}>
          <Header dict={dict} />
          <View style={S.body}>
            {blocks.map((b, j) => (
              <Block key={`${b.type}-${j}`} block={b} dict={dict} common={common} first={j === 0} showPrice={showPrice} />
            ))}
            {footerOnLast && i === pages.length - 1 && <Footer dict={dict} />}
          </View>
          <PageFoot dict={dict} />
        </Page>
      ))}
      {!footerOnLast && (
        <Page size="A4" style={S.page}>
          <Header dict={dict} />
          <View style={S.body}><Footer dict={dict} /></View>
          <PageFoot dict={dict} />
        </Page>
      )}
    </Document>
  );
}

// ── Экспорт ───────────────────────────────────────────────────────────────────
export async function downloadTubesCatalogPDF(products, lang = 'ky', priceMode = 'retail') {
  const dict = L[lang] || L.ky;
  const blob = await pdf(<TubesDocument products={products} lang={lang} priceMode={priceMode} />).toBlob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = dict.file;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

export default TubesDocument;
