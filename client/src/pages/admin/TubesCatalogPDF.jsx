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
const NAVY      = '#123C7A';
const NAVY_DARK = '#0C2A57';
const BLUE      = '#1B57B0';
const BLUE_SOFT = '#E8F0FB';
const PAPER     = '#EFF3F8';
const GRID      = '#DCE5F0';
const INK       = '#12233D';
const GRAY      = '#5E6C80';
const WHITE     = '#FFFFFF';

const LOGO = '/logos/logo-white.png';

// Труба продаётся хлыстом; в базе цена за погонный метр
const PIPE_LENGTH_M = 6;

// Ходовые размеры — отмечены синей меткой в каталоге
const POPULAR = new Set([
  'MKS-Tkr-16-05', 'MKS-Tkr-19-09', 'MKS-Tkr-19-10',
  'MKS-Tkr-25-07', 'MKS-Tkr-25-09', 'MKS-Tkr-32-09',
  'MKS-Tkv-1515-09', 'MKS-Tkv-2020-09', 'MKS-Tkv-2525-09',
  'MKS-Tpr-2010-09',
]);

// ── Тексты ────────────────────────────────────────────────────────────────────
const L = {
  ky: {
    title: 'ТҮТҮКТӨР КАТАЛОГУ',
    legend: 'КӨК БЕЛГИ — КӨП ТАНДАЛГАН ӨЛЧӨМ',
    page: n => `${n}-БЕТ`,
    colSize: 'ӨЛЧӨМҮ',
    colWall: 'МЕТАЛЛДЫН\nКАЛЫҢДЫГЫ',
    colPrice: `БААСЫ (${PIPE_LENGTH_M} М ҮЧҮН)`,
    length: `УЗУНДУГУ: ${PIPE_LENGTH_M} м`,
    popular: 'КӨП ТАНДАЛАТ',
    priceUnit: `сом/${PIPE_LENGTH_M} м`,
    noPrice: 'келишим боюнча',
    contKey: '(уландысы)',
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
    legend: 'СИНЯЯ МЕТКА — ХОДОВОЙ РАЗМЕР',
    page: n => `СТР. ${n}`,
    colSize: 'РАЗМЕР',
    colWall: 'ТОЛЩИНА\nМЕТАЛЛА',
    colPrice: `ЦЕНА (ЗА ${PIPE_LENGTH_M} М)`,
    length: `ДЛИНА: ${PIPE_LENGTH_M} м`,
    popular: 'ХОДОВОЙ',
    priceUnit: `сом/${PIPE_LENGTH_M} м`,
    noPrice: 'по запросу',
    contKey: '(продолжение)',
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

const TYPE_ORDER = ['Круглая', 'Квадратная', 'Прямоугольная', 'Овальная'];

// ── Разбор товара ─────────────────────────────────────────────────────────────
const spec = (p, key) => (p.specs || []).find(s => s.key?.trim().toLowerCase() === key)?.value?.trim();

const typeOf = (p) => {
  const t = spec(p, 'тип');
  if (t && TYPE_ORDER.includes(t)) return t;
  const n = (p.name || '').toLowerCase();
  return TYPE_ORDER.find(x => n.includes(x.toLowerCase())) || 'Круглая';
};

// «Труба круглая 16×0,5» → ['16', '0,5'];  «Труба квадратная 15x15x0,9» → ['15x15', '0,9']
const fromName = (name) => {
  const tail = (name || '').replace(/^.*?(\d)/, '$1').split(/[×x*]/).map(s => s.trim());
  if (tail.length < 2) return [null, null];
  return [tail.slice(0, -1).join('×'), tail[tail.length - 1]];
};

const num = (s) => parseFloat(String(s ?? '').replace(',', '.').replace(/[^\d.]/g, '')) || 0;

const rowOf = (p, dict) => {
  const [nSize, nWall] = fromName(p.name);
  const round = typeOf(p) === 'Круглая';
  const size  = (spec(p, 'диаметр трубы') || spec(p, 'размер трубы') || nSize || '').replace(/\s*мм$/i, '');
  const wall  = (spec(p, 'толщина стенки') || nWall || '').replace(/\s*мм$/i, '');
  const price = Number(p.price) > 0 ? Number(p.price) * PIPE_LENGTH_M : null;
  return {
    key:   p._id || p.sku,
    size:  round ? `Ø ${size} мм` : `${size.replace(/[x*]/g, '×')} мм`,
    wall:  `${String(wall).replace('.', ',')} мм`,
    price: price === null ? dict.noPrice : `${price.toLocaleString('ru-RU')} ${dict.priceUnit}`,
    hot:   POPULAR.has(p.sku),
    sortA: num(size),
    sortB: num(wall),
  };
};

// ── Раскладка: блоки по типам, блоки по страницам ─────────────────────────────
const ROW_H       = 20;
const BLOCK_CHROME = 80;  // шапка таблицы, полоса «длина 6 м», отступы карточки
const BLOCK_MIN_H  = 168; // ниже фото и заголовок в левой колонке уже не помещаются
const FOOTER_H     = 96;
const PAGE_BODY_H  = 740; // A4 минус шапка и поля страницы

const blockHeight = (rows) => Math.max(BLOCK_MIN_H, BLOCK_CHROME + rows.length * ROW_H);

// Блок не переносится по строкам: каждая часть — цельная карточка со своим фото.
// Если тип не влезает на страницу, режем его на РАВНЫЕ части, иначе получается
// длинный блок и куцый хвост из двух строк на следующей странице.
const buildBlocks = (products, dict) => {
  const byType = {};
  products.forEach(p => {
    const t = typeOf(p);
    (byType[t] ||= []).push(p);
  });

  const maxRows = Math.floor((PAGE_BODY_H - BLOCK_CHROME) / ROW_H);
  const blocks = [];
  let n = 0;
  TYPE_ORDER.filter(t => byType[t]?.length).forEach(type => {
    n += 1;
    const rows = byType[type].map(p => rowOf(p, dict)).sort((a, b) => a.sortA - b.sortA || a.sortB - b.sortB);
    const photo = byType[type].find(p => p.images?.[0])?.images?.[0] || null;
    const parts = Math.ceil(rows.length / maxRows);
    const per   = Math.ceil(rows.length / parts);
    for (let i = 0; i < rows.length; i += per) {
      blocks.push({ type, num: n, photo, rows: rows.slice(i, i + per), cont: i > 0 });
    }
  });
  return blocks;
};

const paginate = (blocks) => {
  const pages = [];
  let page = [], left = PAGE_BODY_H;
  blocks.forEach(b => {
    const h = blockHeight(b.rows);
    if (page.length && h > left) { pages.push(page); page = []; left = PAGE_BODY_H; }
    page.push(b); left -= h;
  });
  if (page.length) pages.push(page);
  // Хвост «широкий ассортимент» — на последней странице, если там осталось место
  const tail = pages[pages.length - 1] || [];
  const used = tail.reduce((s, b) => s + blockHeight(b.rows), 0);
  return { pages, footerOnLast: PAGE_BODY_H - used >= FOOTER_H };
};

// ── Стили ─────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page:      { fontFamily: 'Roboto', backgroundColor: PAPER, paddingBottom: 18 },
  grid:      { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  gridLine:  { position: 'absolute', backgroundColor: GRID },

  header:    { backgroundColor: NAVY, paddingHorizontal: 22, paddingTop: 14, paddingBottom: 10 },
  headRow:   { flexDirection: 'row', alignItems: 'center' },
  logo:      { width: 96, height: 18, marginRight: 14 },
  title:     { flex: 1, color: WHITE, fontSize: 21, fontWeight: 700, letterSpacing: 1 },
  pageChip:  { backgroundColor: BLUE, borderRadius: 3, paddingHorizontal: 8, paddingVertical: 3 },
  pageChipT: { color: WHITE, fontSize: 8.5, fontWeight: 700, letterSpacing: 0.6 },
  legendRow: { flexDirection: 'row', alignItems: 'center', marginTop: 7 },
  legendDot: { width: 15, height: 8, borderRadius: 2, backgroundColor: BLUE, marginRight: 7 },
  legendT:   { color: '#BDD2F0', fontSize: 8, fontWeight: 500, letterSpacing: 0.7 },

  body:      { paddingHorizontal: 18, paddingTop: 12 },

  block:     { backgroundColor: WHITE, borderRadius: 6, borderWidth: 1.4, borderColor: NAVY,
               marginBottom: 10, flexDirection: 'row', padding: 7, minHeight: BLOCK_MIN_H },
  side:      { width: '35%', paddingRight: 8 },
  sideTitle: { backgroundColor: NAVY, borderRadius: 3, paddingVertical: 5, paddingHorizontal: 8 },
  sideTitleT:{ color: WHITE, fontSize: 11, fontWeight: 700, letterSpacing: 0.4 },
  sideNote:  { color: GRAY, fontSize: 7.5, marginTop: 6, lineHeight: 1.35 },
  photo:     { marginTop: 7, width: '100%', height: 104, borderRadius: 4, objectFit: 'cover' },

  table:     { width: '65%' },
  th:        { flexDirection: 'row', backgroundColor: NAVY, borderRadius: 3 },
  thCell:    { color: WHITE, fontSize: 7, fontWeight: 700, textAlign: 'center', paddingVertical: 6,
               paddingHorizontal: 3, lineHeight: 1.25 },
  tr:        { flexDirection: 'row', alignItems: 'center', height: ROW_H,
               borderBottomWidth: 0.6, borderBottomColor: '#D7E2F2' },
  trHot:     { backgroundColor: BLUE_SOFT },
  td:        { fontSize: 8.5, color: INK, textAlign: 'center', paddingHorizontal: 3 },
  tdSize:    { fontSize: 9, color: INK, fontWeight: 500 },
  cSize:     { width: '42%', flexDirection: 'row', alignItems: 'center', paddingLeft: 5 },
  cWall:     { width: '25%' },
  cPrice:    { width: '33%' },
  hotChip:   { backgroundColor: BLUE, borderRadius: 2, paddingHorizontal: 3, paddingVertical: 1.5, marginRight: 5 },
  hotChipT:  { color: WHITE, fontSize: 4.6, fontWeight: 700, lineHeight: 1.1, textAlign: 'center' },
  lenBar:    { backgroundColor: BLUE_SOFT, borderRadius: 3, marginTop: 5, paddingVertical: 4, paddingHorizontal: 8 },
  lenBarT:   { color: NAVY, fontSize: 8, fontWeight: 700, letterSpacing: 0.4 },

  footer:    { backgroundColor: NAVY_DARK, borderRadius: 6, padding: 12, marginTop: 2 },
  footerT:   { color: WHITE, fontSize: 12, fontWeight: 700, letterSpacing: 0.6, marginBottom: 7 },
  bullet:    { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  bulletDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#7FA8E8', marginRight: 6 },
  bulletT:   { color: '#D6E3F7', fontSize: 8.5 },
});

// ── Куски документа ───────────────────────────────────────────────────────────
const Grid = () => (
  <View style={S.grid} fixed>
    {Array.from({ length: 47 }, (_, i) => (
      <View key={`h${i}`} style={[S.gridLine, { left: 0, right: 0, top: i * 18, height: 0.4 }]} />
    ))}
    {Array.from({ length: 34 }, (_, i) => (
      <View key={`v${i}`} style={[S.gridLine, { top: 0, bottom: 0, left: i * 18, width: 0.4 }]} />
    ))}
  </View>
);

const Header = ({ dict }) => (
  <View style={S.header} fixed>
    <View style={S.headRow}>
      <Image src={LOGO} style={S.logo} />
      <Text style={S.title}>{dict.title}</Text>
      <View style={S.pageChip}>
        <Text style={S.pageChipT} render={({ pageNumber }) => dict.page(pageNumber)} />
      </View>
    </View>
    <View style={S.legendRow}>
      <View style={S.legendDot} />
      <Text style={S.legendT}>{dict.legend}</Text>
    </View>
  </View>
);

const Block = ({ block, dict }) => {
  const meta = dict.types[block.type] || { name: block.type, note: '' };
  return (
    <View style={S.block} wrap={false}>
      <View style={S.side}>
        <View style={S.sideTitle}>
          <Text style={S.sideTitleT}>
            {block.num}. {meta.name}{block.cont ? ` ${dict.contKey}` : ''}
          </Text>
        </View>
        <Text style={S.sideNote}>{meta.note}</Text>
        {block.photo && <Image src={block.photo} style={S.photo} />}
      </View>

      <View style={S.table}>
        <View style={S.th}>
          <Text style={[S.thCell, { width: '42%' }]}>{dict.colSize}</Text>
          <Text style={[S.thCell, { width: '25%' }]}>{dict.colWall}</Text>
          <Text style={[S.thCell, { width: '33%' }]}>{dict.colPrice}</Text>
        </View>
        {block.rows.map(r => (
          <View key={r.key} style={[S.tr, r.hot && S.trHot]}>
            <View style={S.cSize}>
              {r.hot && (
                <View style={S.hotChip}>
                  <Text style={S.hotChipT}>{dict.popular}</Text>
                </View>
              )}
              <Text style={[S.td, S.tdSize]}>{r.size}</Text>
            </View>
            <Text style={[S.td, S.cWall]}>{r.wall}</Text>
            <Text style={[S.td, S.cPrice]}>{r.price}</Text>
          </View>
        ))}
        <View style={S.lenBar}><Text style={S.lenBarT}>{dict.length}</Text></View>
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

function TubesDocument({ products, lang }) {
  const dict = L[lang] || L.ky;
  const { pages, footerOnLast } = paginate(buildBlocks(products, dict));

  return (
    <Document title={dict.title} author="MATKASYM">
      {pages.map((blocks, i) => (
        <Page key={i} size="A4" style={S.page}>
          <Grid />
          <Header dict={dict} />
          <View style={S.body}>
            {blocks.map((b, j) => <Block key={`${b.type}-${j}`} block={b} dict={dict} />)}
            {footerOnLast && i === pages.length - 1 && <Footer dict={dict} />}
          </View>
        </Page>
      ))}
      {!footerOnLast && (
        <Page size="A4" style={S.page}>
          <Grid />
          <Header dict={dict} />
          <View style={S.body}><Footer dict={dict} /></View>
        </Page>
      )}
    </Document>
  );
}

// ── Экспорт ───────────────────────────────────────────────────────────────────
export async function downloadTubesCatalogPDF(products, lang = 'ky') {
  const dict = L[lang] || L.ky;
  const blob = await pdf(<TubesDocument products={products} lang={lang} />).toBlob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = dict.file;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

export default TubesDocument;
