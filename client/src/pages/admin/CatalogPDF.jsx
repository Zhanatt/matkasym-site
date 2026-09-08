import React from 'react';
import {
  Document, Page, Text, View, Image, StyleSheet, Font, pdf,
} from '@react-pdf/renderer';

Font.register({
  family: 'Roboto',
  fonts: [
    { src: '/fonts/Roboto-Regular.ttf', fontWeight: 400 },
    { src: '/fonts/Roboto-Medium.ttf',  fontWeight: 500 },
    { src: '/fonts/Roboto-Bold.ttf',    fontWeight: 700 },
  ],
});
Font.registerHyphenationCallback(w => [w]);

// ── Design System ─────────────────────────────────────────────────────────────
const RED      = '#D8232A';
const INK      = '#1A1A1A';
const GRAY     = '#6E7378';
const HAIRLINE = '#E4E6E8';
const STEEL    = '#8FA3B0';
const WHITE    = '#FFFFFF';
const YELLOW   = '#F2C84A';
const ORANGE   = '#E89B3C';
const BG_SPEC  = '#F7F8F9';
const RED_SOFT = '#FFF0F0';

const LOGO      = '/logos/logo-main.png';
const NO_PHOTO  = '/logos/no-photo.png';

// ── Styles ────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({

  // ── Cover ──────────────────────────────────────────────────────────────────
  coverPage: {
    fontFamily: 'Roboto',
    backgroundColor: WHITE,
    position: 'relative',
  },
  coverPlaque: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 240,
    backgroundColor: RED,
    borderBottomLeftRadius: 120,
    borderBottomRightRadius: 120,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 20,
  },
  coverLogo: {
    width: 180,
    height: 36,
    marginTop: 24,
  },
  coverBody: {
    position: 'absolute',
    top: 260,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  coverH1a: {
    fontSize: 64,
    fontWeight: 700,
    color: INK,
    letterSpacing: 4,
    lineHeight: 1,
  },
  coverH1b: {
    fontSize: 64,
    fontWeight: 700,
    color: INK,
    letterSpacing: 4,
    lineHeight: 1.05,
    marginBottom: 18,
  },
  coverSubtitle: {
    fontSize: 13,
    fontWeight: 500,
    color: STEEL,
    letterSpacing: 6,
  },
  coverTagline: {
    position: 'absolute',
    bottom: 56,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  coverTaglineText: {
    fontSize: 15,
    fontWeight: 500,
    color: INK,
    marginBottom: 10,
  },
  barsRow: {
    flexDirection: 'row',
    gap: 5,
  },
  bar: {
    width: 6,
    height: 28,
    borderRadius: 2,
  },

  // ── Content page ───────────────────────────────────────────────────────────
  contentPage: {
    fontFamily: 'Roboto',
    backgroundColor: WHITE,
    paddingTop: 28,
    paddingHorizontal: 28,
    paddingBottom: 36,
  },
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 7,
  },
  pageHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLogo: {
    width: 120,
    height: 16,
  },
  headerSetName: {
    fontSize: 14,
    fontWeight: 700,
    color: INK,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  headerHairline: {
    height: 0.75,
    backgroundColor: HAIRLINE,
    marginBottom: 14,
  },

  // ── 2×2 grid — exact static layout ────────────────────────────────────────
  // A4 841.89pt − padding(64) − header(42) − footer(14) = 721.89pt
  // CARD_H = (721.89 − 12gap) / 2 = 354.9 ≈ 355
  // CARD_W = (539.28 − 12gap) / 2 = 263.6 ≈ 263
  grid: {
    flexDirection: 'column',
    gap: 12,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 12,
  },

  // ── Card — fixed 263 × 355 ─────────────────────────────────────────────────
  card: {
    width: 263,
    height: 355,
    borderWidth: 0.75,
    borderColor: HAIRLINE,
    overflow: 'hidden',
    backgroundColor: WHITE,
  },

  // ── Image — fixed 263 × 193 ────────────────────────────────────────────────
  // Снимок вписывается в кадр целиком, и у вертикальных фото по бокам остаётся
  // пустое поле. На белом оно читалось как незаполненная карточка — на общем
  // светлом фоне поле выглядит студийным задником, и все карточки на полосе
  // становятся похожи друг на друга независимо от пропорций исходника.
  imageWrap: {
    width: 263,
    height: 193,
    backgroundColor: BG_SPEC,
    borderBottomWidth: 0.75,
    borderBottomColor: HAIRLINE,
  },
  productImg: {
    width: 263,
    height: 193,
    objectFit: 'contain',
  },
  noImageWrap: {
    width: 263,
    height: 193,
    backgroundColor: BG_SPEC,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 0.75,
    borderBottomColor: HAIRLINE,
  },
  noImageText: {
    fontSize: 7,
    color: '#aaa',
    fontWeight: 400,
  },

  // ── Card body — fixed 263 × 161 ────────────────────────────────────────────
  // 355 − 193 − 0.75border ≈ 161
  // paddingH 9, paddingTop 7, paddingBottom 6 → inner 148pt
  // kicker 10 + gap2 + name 28 + gap4 + price 26 + gap3 + 4×specs 18 = 145pt ✓
  cardBody: {
    width: 263,
    height: 161,
    paddingHorizontal: 9,
    paddingTop: 7,
    paddingBottom: 6,
  },

  kicker: {
    height: 10,
    fontSize: 7,
    color: STEEL,
    fontWeight: 500,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  // Артикул — единственная строка, по которой из каталога можно сделать заказ,
  // поэтому он вытесняет категорию: та повторялась на полосе по четыре раза,
  // а сет и так написан в шапке.
  kickerSku: {
    height: 10,
    fontSize: 7,
    color: GRAY,
    fontWeight: 500,
    letterSpacing: 0.5,
    marginBottom: 2,
  },

  nameWrap: {
    height: 28,
    overflow: 'hidden',
    marginBottom: 4,
  },
  productName: {
    fontSize: 11,
    fontWeight: 700,
    color: INK,
    lineHeight: 1.25,
  },

  // price block — fixed height 26
  priceBlock: {
    height: 26,
    backgroundColor: RED_SOFT,
    paddingHorizontal: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  priceLabel: {
    fontSize: 7,
    color: RED,
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  priceValue: {
    fontSize: 11,
    fontWeight: 700,
    color: RED,
  },
  priceSom: {
    fontSize: 7.5,
    fontWeight: 400,
    color: RED,
  },

  // spec row — fixed height 18 each
  specRow: {
    height: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: HAIRLINE,
  },
  specRowAlt: {
    height: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
    backgroundColor: BG_SPEC,
    borderBottomWidth: 0.5,
    borderBottomColor: HAIRLINE,
  },
  specKey: {
    fontSize: 7.5,
    color: GRAY,
    fontWeight: 400,
    width: '53%',
  },
  specVal: {
    fontSize: 7.5,
    color: INK,
    fontWeight: 500,
    width: '45%',
    textAlign: 'right',
  },

  // ── Титул раздела ──────────────────────────────────────────────────────────
  // Занимает ту же ячейку 263 × 355, что и товар: сетка 2 × 2 не ломается, а
  // разделы наконец видно — раньше смену сета выдавало только слово в шапке.
  sectionCard: {
    width: 263,
    height: 355,
    backgroundColor: RED,
    paddingHorizontal: 22,
    paddingVertical: 26,
    justifyContent: 'flex-end',
  },
  sectionKicker: {
    fontSize: 7.5,
    color: WHITE,
    opacity: 0.75,
    fontWeight: 500,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  sectionName: {
    fontSize: 21,
    color: WHITE,
    fontWeight: 700,
    lineHeight: 1.15,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  sectionRule: {
    width: 44,
    height: 2.5,
    backgroundColor: WHITE,
    marginTop: 14,
    marginBottom: 10,
  },
  sectionCount: {
    fontSize: 8,
    color: WHITE,
    opacity: 0.8,
    fontWeight: 400,
  },

  // ── Содержание ─────────────────────────────────────────────────────────────
  tocPage: {
    fontFamily: 'Roboto',
    backgroundColor: WHITE,
    paddingTop: 54,
    paddingHorizontal: 56,
    paddingBottom: 40,
  },
  tocTitle: {
    fontSize: 26,
    fontWeight: 700,
    color: INK,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  tocRule: {
    width: 44,
    height: 2.5,
    backgroundColor: RED,
    marginTop: 12,
    marginBottom: 26,
  },
  tocRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingVertical: 9,
    borderBottomWidth: 0.5,
    borderBottomColor: HAIRLINE,
  },
  tocName: {
    fontSize: 10.5,
    fontWeight: 500,
    color: INK,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  tocCount: {
    fontSize: 8,
    color: STEEL,
    marginLeft: 8,
  },
  tocDots: {
    flex: 1,
    borderBottomWidth: 0.5,
    borderBottomColor: HAIRLINE,
    marginHorizontal: 8,
    marginBottom: 3,
  },
  tocPageNum: {
    fontSize: 10.5,
    fontWeight: 700,
    color: RED,
  },

  // ── Page footer ────────────────────────────────────────────────────────────
  pageFooter: {
    position: 'absolute',
    bottom: 14,
    left: 28,
    right: 28,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  pageNum: {
    fontSize: 7.5,
    color: HAIRLINE,
    fontWeight: 400,
  },

  // ── Back cover ─────────────────────────────────────────────────────────────
  backPage: {
    fontFamily: 'Roboto',
    backgroundColor: WHITE,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  backLogo: {
    width: 240,
    height: 48,
    marginBottom: 0,
  },
  backFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: RED,
    paddingVertical: 28,
    paddingHorizontal: 36,
    flexDirection: 'row',
  },
  backCol: {
    flex: 1,
  },
  backColLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: WHITE,
    letterSpacing: 0.5,
    marginBottom: 5,
  },
  backColText: {
    fontSize: 9,
    color: WHITE,
    fontWeight: 400,
    lineHeight: 1.6,
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

// react-pdf doesn't support WebP — convert via Cloudinary f_jpg transformation
function pdfImg(url) {
  if (!url) return url;
  if (url.includes('cloudinary.com')) return url.replace('/upload/', '/upload/f_jpg/');
  return url.replace(/\.webp(\?.*)?$/, '.jpg$1');
}

const COLOR_HEX = {
  white: '#f0f0f0', black: '#1a1a1a', grey: '#888', gray: '#888',
  red: '#e53935', blue: '#1565C0', silver: '#c0c0c0',
  gold: '#d4af37', brown: '#795548', beige: '#d4b896',
};

const CATEGORY_LABELS = {
  'clothes-dryer':        'сушилка для белья',
  'laundry-basket':       'корзина для белья',
  'ironing-board':        'гладильная доска',
  'wardrobe-rack':        'напольная вешалка',
  'coat-hanger':          'костюмная вешалка',
  'shoe-rack':            'обувная полка',
  'wall-hanger':          'настенная вешалка',
  'toilet-shelf':         'полка для туалета',
  'bath-shelf':           'полка для ванной',
  'bath-corner-shelf':    'угловая полка',
  'flower-stand':         'подставка для цветов',
  'bbq-grill':            'мангал',
  'antenna':              'антенна',
  'tv-bracket':           'кронштейн для ТВ',
  'electric-panel':       'электрощит',
  'wall-shelf':           'настенная полка',
  'hook':                 'крючки',
  'organizer-kitchen':    'кухонный органайзер',
  'dish-drainer':         'сушилка для посуды',
  'school-desk':          'школьная парта',
  'school-chair':         'школьный стул',
  'ladder':               'стремянка',
  'industrial-shelf':     'промышленный стеллаж',
  'storage-tumba':        'тумба',
  'ac-basket':            'корзина для кондиционера',
  'ac-mount':             'кронштейн для кондиционера',
  'appliances':           'бытовая техника',
  'clothing-racks':       'вешалка для одежды',
  'cosmetics-storage':    'хранение косметики',
  'electric-panel-floor': 'напольный электрощит',
  'electric-panel-mount': 'настенный электрощит',
  'electric-panel-outdoor':'уличный электрощит',
  'electric-panel-plumbing':'сантехнический щит',
  'fan-barrier':          'фан-барьер',
  'floor-hanger':         'напольная вешалка',
  'home-decor':           'декор для дома',
  'ironing-board-ext':    'насадка для гладильной доски',
  'jewelry-storage':      'хранение украшений',
  'kids':                 'детские товары',
  'mosquito-nets':        'москитная сетка',
  'play-tents':           'игровая палатка',
  'shelf-corner':         'угловая полка',
  'shoe-racks':           'полка для обуви',
  'stools':               'табурет',
  'storage':              'хранение',
  'tv-mount':             'кронштейн для ТВ',
  'waste-bin':            'урна',
  // «other» — это «категорию не выбрали». Печатать вместо неё «товар для дома»
  // значит выдумывать: в SHAAR так подписывались уличные урны. Оставляем пусто.
  'other':                '',
};

// ── Cover images (Cloudinary URLs with optimization for react-pdf) ───────────
const COVERS = {
  home:   {
    title: 'https://res.cloudinary.com/dnbg21ef8/image/upload/f_jpg,q_90,w_595/v1780894224/matkasym/covers/title-page-home.png',
    end:   'https://res.cloudinary.com/dnbg21ef8/image/upload/f_jpg,q_90,w_595/v1780894227/matkasym/covers/end-page-home.png'
  },
  shaar:  {
    title: 'https://res.cloudinary.com/dnbg21ef8/image/upload/f_jpg,q_90,w_595/v1780894225/matkasym/covers/title-page-shaar.png',
    end:   'https://res.cloudinary.com/dnbg21ef8/image/upload/f_jpg,q_90,w_595/v1780894228/matkasym/covers/end-page-shaar.png'
  },
  kyzmat: {
    title: 'https://res.cloudinary.com/dnbg21ef8/image/upload/f_jpg,q_90,w_595/v1780894226/matkasym/covers/title-page-kyzmat.png',
    end:   'https://res.cloudinary.com/dnbg21ef8/image/upload/f_jpg,q_90,w_595/v1780894229/matkasym/covers/end-page-kyzmat.png'
  },
};

// ── Cover Page ────────────────────────────────────────────────────────────────
function CoverPage({ brand = 'home' }) {
  const coverSrc = COVERS[brand]?.title || COVERS.home.title;

  return (
    <Page size="A4" style={{ padding: 0 }}>
      <Image src={coverSrc} cache={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </Page>
  );
}

// ── Back Cover ────────────────────────────────────────────────────────────────
function BackCoverPage({ brand = 'home' }) {
  const backSrc = COVERS[brand]?.end || COVERS.home.end;

  return (
    <Page size="A4" style={{ padding: 0 }}>
      <Image src={backSrc} cache={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </Page>
  );
}

const PRICE_LABELS = {
  price:          'розн. цена',
  priceWholesale: 'опт. цена',
  priceDealer:    'дил. цена',
};

const SPEC_ROWS = 4;
const PER_PAGE  = 4;   // карточек на полосе, сетка 2 × 2

// ── Product Card ──────────────────────────────────────────────────────────────
function ProductCard({ product, priceType, currency = 'сом' }) {
  const imageUrl = pdfImg(product.images?.[0]);
  const noPhoto  = !imageUrl;
  // Над названием — категория товара. Словарь ниже переводит старые
  // слаги («bbq-grill» → «мангал»), но большинство категорий давно записаны
  // по-русски и в словаре их нет. Раньше всё незнакомое становилось «товаром
  // для дома»: сортировочная урна в каталоге SHAAR подписывалась именно так.
  // Своя категория товара всегда точнее любой замены.
  const catLabel = CATEGORY_LABELS[product.category] || product.category || '';

  // Build spec list (dimensions + color + specs), max SPEC_ROWS
  const rawSpecs = (product.specs || []).filter(s => s.value);
  const filled = [];
  if (product.dimensions) filled.push({ key: 'Размеры', value: product.dimensions });
  if (product.color && product.color !== '') filled.push({ key: 'Цвет', value: product.color });
  rawSpecs.forEach(s => { if (!filled.find(a => a.key === s.key)) filled.push(s); });

  // Строк ровно столько, сколько фактов. Раньше список добивался пустышками до
  // SPEC_ROWS: у товара с одной характеристикой под ней оставались три пустые
  // полосы с зеброй и разделителями — карточка читалась как сломанная таблица.
  // Высота тела карточки фиксирована, поэтому сетка держится и без них: место,
  // которое строки не заняли, остаётся белым.
  const specs = filled.slice(0, SPEC_ROWS);

  // Цвет годится в заливку, только если это код: в поле бывает и слово
  // («white», «серый»), его в backgroundColor отдавать нельзя.
  const swatch = /^#[0-9a-f]{3,8}$/i.test(String(product.color || '').trim())
    ? product.color.trim() : null;

  const priceVal   = priceType !== 'none' ? (product[priceType] || 0) : null;
  const priceNum   = priceVal > 0 ? priceVal.toLocaleString('ru') : null;
  const priceLabel = PRICE_LABELS[priceType] || '';

  return (
    <View style={S.card}>
      {/* Image — fixed height */}
      {/* Краски фотографировать нечего: у всех сорока карточек фото нет, зато
          задан цвет. Показываем его плашкой — как в каталоге на сайте, где
          такие товары рисуются заливкой. «Нет фото» на странице покраски
          выглядело браком выгрузки, хотя товар описан полностью. */}
      {noPhoto && swatch ? (
        <View style={[S.noImageWrap, { backgroundColor: swatch }]} />
      ) : noPhoto ? (
        <View style={S.noImageWrap}><Text style={S.noImageText}>нет фото</Text></View>
      ) : (
        <View style={S.imageWrap}>
          <Image src={imageUrl} style={S.productImg} />
        </View>
      )}

      {/* Body — fixed height */}
      <View style={S.cardBody}>
        {product.sku
          ? <Text style={S.kickerSku}>{product.sku}</Text>
          : <Text style={S.kicker}>{catLabel}</Text>}

        <View style={S.nameWrap}>
          <Text style={S.productName}>{product.name || product.fullName}</Text>
        </View>

        {/* Плашка цены — только когда цена есть. Пустая розовая полоса была самым
            насыщенным пятном на полосе и не несла ничего: в выгрузке без цен
            фирменный красный уходил на пустоту. */}
        {priceNum && (
          <View style={S.priceBlock}>
            <Text style={S.priceLabel}>{priceLabel}</Text>
            <Text style={S.priceValue}>
              {priceNum} <Text style={S.priceSom}>{currency}</Text>
            </Text>
          </View>
        )}

        {/* Always exactly SPEC_ROWS rows */}
        {specs.map((s, i) => (
          <View key={i} style={i % 2 === 0 ? S.specRow : S.specRowAlt}>
            <Text style={S.specKey}>{s.key}</Text>
            <Text style={S.specVal}>{s.value}{s.unit ? ` ${s.unit}` : ''}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Титул раздела ─────────────────────────────────────────────────────────────
function SectionCard({ name, count }) {
  return (
    <View style={S.sectionCard}>
      <Text style={S.sectionKicker}>Раздел</Text>
      <Text style={S.sectionName}>{name}</Text>
      <View style={S.sectionRule} />
      <Text style={S.sectionCount}>{count} {plural(count, 'позиция', 'позиции', 'позиций')}</Text>
    </View>
  );
}

function plural(n, one, few, many) {
  const d10 = n % 10, d100 = n % 100;
  if (d10 === 1 && d100 !== 11) return one;
  if (d10 >= 2 && d10 <= 4 && (d100 < 10 || d100 >= 20)) return few;
  return many;
}

// ── Содержание ────────────────────────────────────────────────────────────────
function TocPage({ sections, setName }) {
  return (
    <Page size="A4" style={S.tocPage}>
      <Text style={S.tocTitle}>{setName}</Text>
      <View style={S.tocRule} />
      {sections.map((sec, i) => (
        <View key={i} style={S.tocRow}>
          <Text style={S.tocName}>{sec.name}</Text>
          <Text style={S.tocCount}>{sec.count} {plural(sec.count, 'позиция', 'позиции', 'позиций')}</Text>
          <View style={S.tocDots} />
          <Text style={S.tocPageNum}>{sec.page}</Text>
        </View>
      ))}
      <View style={S.pageFooter} fixed>
        <Text style={S.pageNum} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
      </View>
    </Page>
  );
}

// Раскладка каталога одним потоком: раньше каждый сет резался по четыре отдельно
// от остальных, поэтому последняя полоса КАЖДОГО сета оставалась недобранной —
// на двадцати четырёх сетах это около десяти полос впустую. Теперь сеты текут
// подряд, а границу между ними держит карточка-титул.
function buildSlots(groups) {
  const slots = [];
  const sections = [];

  groups.forEach(group => {
    if (!group.products.length) return;

    // Плоский список без имени раздела (выгрузка одного сета) титула не требует.
    if (group.groupName) {
      // Титул последним на полосе — висячий заголовок: раздел начался, а товара
      // под ним уже нет. Двигаем на следующую полосу.
      if (slots.length % PER_PAGE === PER_PAGE - 1) slots.push(null);
      sections.push({ name: group.groupName, count: group.products.length, slotIndex: slots.length });
      slots.push({ kind: 'section', name: group.groupName, count: group.products.length });
    }
    group.products.forEach(product => slots.push({ kind: 'product', product }));
  });

  return { slots, sections };
}

// ── Content Page ──────────────────────────────────────────────────────────────
function ContentPage({ slots, setName, pageNumber, priceType, currency }) {
  // Логотип уходит к внешнему краю разворота — по НАСТОЯЩЕМУ номеру полосы.
  // Прежний счётчик считал только полосы с товаром и обложку не учитывал, так
  // что с чётностью разворота он мог и не совпадать.
  const logoLeft = pageNumber % 2 === 0;

  const cell = (slot, i) => {
    if (!slot) return null;
    return slot.kind === 'section'
      ? <SectionCard key={i} name={slot.name} count={slot.count} />
      : <ProductCard key={i} product={slot.product} priceType={priceType} currency={currency} />;
  };
  return (
    <Page size="A4" style={S.contentPage}>
      {/* Header — alternates logo side per page */}
      <View style={S.pageHeader}>
        {logoLeft ? (
          <>
            <Image src={LOGO} style={S.headerLogo} />
            <Text style={S.headerSetName}>{setName}</Text>
          </>
        ) : (
          <>
            <Text style={S.headerSetName}>{setName}</Text>
            <Image src={LOGO} style={S.headerLogo} />
          </>
        )}
      </View>
      <View style={S.headerHairline} />

      {/* 2×2 grid — explicit rows to avoid flexWrap issues in react-pdf */}
      <View style={S.grid}>
        <View style={S.gridRow}>
          {cell(slots[0], 0)}
          {cell(slots[1], 1)}
        </View>
        <View style={S.gridRow}>
          {cell(slots[2], 2)}
          {cell(slots[3], 3)}
        </View>
      </View>

      {/* Page number */}
      <View style={S.pageFooter} fixed>
        <Text
          style={S.pageNum}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        />
      </View>
    </Page>
  );
}

// ── Document ──────────────────────────────────────────────────────────────────
// groups: [{ groupName: string|null, products: Product[] }, ...]
function CatalogDocument({ groups, setName, priceType, brand = 'home', currency = 'сом' }) {
  const { slots, sections } = buildSlots(groups);

  const pages = [];
  for (let i = 0; i < slots.length; i += PER_PAGE) pages.push(slots.slice(i, i + PER_PAGE));

  // Содержание есть, только когда разделов больше одного: на выгрузке одного
  // сета оно вырождается в единственную строку.
  const hasToc = sections.length > 1;
  const firstContentPage = hasToc ? 3 : 2;   // обложка — 1

  const tocRows = sections.map(sec => ({
    ...sec,
    page: firstContentPage + Math.floor(sec.slotIndex / PER_PAGE),
  }));

  // Шапка полосы называет раздел, действующий к её концу: если новый раздел
  // начался в первой ячейке, вся полоса уже про него, а не про предыдущий.
  const sectionAt = lastSlot => {
    let current = null;
    for (const sec of sections) {
      if (sec.slotIndex <= lastSlot) current = sec.name; else break;
    }
    return current;
  };

  return (
    <Document title={`Каталог — ${setName}`} author={`MATKASYM ${brand.toUpperCase()}`}>
      <CoverPage brand={brand} />
      {hasToc && <TocPage sections={tocRows} setName={setName} />}
      {pages.map((chunk, pageIdx) => (
        <ContentPage
          key={pageIdx}
          slots={chunk}
          setName={sectionAt(pageIdx * PER_PAGE + chunk.length - 1) || setName}
          pageNumber={firstContentPage + pageIdx}
          priceType={priceType}
          currency={currency}
        />
      ))}
      <BackCoverPage brand={brand} />
    </Document>
  );
}

// ── Export ────────────────────────────────────────────────────────────────────
// groups: [{ groupName: string|null, products: Product[] }, ...]
export async function downloadCatalogPDF(groups, setName, priceType = 'price', brand = 'home', currency = 'сом') {
  const blob = await pdf(
    <CatalogDocument groups={groups} setName={setName} priceType={priceType} brand={brand} currency={currency} />
  ).toBlob();

  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = `matkasym-catalog-${setName.toLowerCase().replace(/\s+/g, '-')}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
