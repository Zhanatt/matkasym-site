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
    width: 100,
    height: 20,
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
  imageWrap: {
    width: 263,
    height: 193,
    backgroundColor: WHITE,
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
    backgroundColor: '#F2F3F5',
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
  'other':                'товар для дома',
};

// ── Cover Page ────────────────────────────────────────────────────────────────
function CoverPage() {
  return (
    <Page size="A4" style={S.coverPage}>
      {/* Red arch plaque */}
      <View style={S.coverPlaque} />

      {/* Main title + logo */}
      <View style={S.coverBody}>
        <Image src={LOGO} style={S.coverLogo} />
        <Text style={S.coverH1a}>MATKASYM</Text>
        <Text style={S.coverH1b}>HOME</Text>
        <Text style={S.coverSubtitle}>ТОВАРЫ ДЛЯ ДОМА</Text>
      </View>

      {/* Tagline + 3 bars */}
      <View style={S.coverTagline}>
        <Text style={S.coverTaglineText}>сделаем лучше!</Text>
        <View style={S.barsRow}>
          <View style={[S.bar, { backgroundColor: RED    }]} />
          <View style={[S.bar, { backgroundColor: YELLOW }]} />
          <View style={[S.bar, { backgroundColor: ORANGE }]} />
        </View>
      </View>
    </Page>
  );
}

// ── Back Cover ────────────────────────────────────────────────────────────────
function BackCoverPage() {
  return (
    <Page size="A4" style={S.backPage}>
      <Image src={LOGO} style={S.backLogo} />

      <View style={S.backFooter}>
        <View style={S.backCol}>
          <Text style={S.backColLabel}>АДРЕС</Text>
          <Text style={S.backColText}>с. Маевка,{'\n'}ул. Тепличная,{'\n'}уч. 1/2</Text>
        </View>
        <View style={S.backCol}>
          <Text style={S.backColLabel}>ТЕЛЕФОН</Text>
          <Text style={S.backColText}>+996 706 042 018</Text>
        </View>
        <View style={S.backCol}>
          <Text style={S.backColLabel}>КОНТАКТЫ</Text>
          <Text style={S.backColText}>
            matkasymovllc@gmail.com{'\n'}
            @matkasym_home{'\n'}
            @make_in_kg
          </Text>
        </View>
      </View>
    </Page>
  );
}

const PRICE_LABELS = {
  price:          'розн. цена',
  priceWholesale: 'опт. цена',
  priceDealer:    'дил. цена',
};

const SPEC_ROWS = 4;

// ── Product Card ──────────────────────────────────────────────────────────────
function ProductCard({ product, priceType }) {
  const imageUrl = pdfImg(product.images?.[0]);
  const noPhoto  = !imageUrl;
  const catLabel = CATEGORY_LABELS[product.category] || 'товар для дома';

  // Build spec list (dimensions + color + specs), max SPEC_ROWS
  const rawSpecs = (product.specs || []).filter(s => s.value);
  const filled = [];
  if (product.dimensions) filled.push({ key: 'Размеры', value: product.dimensions });
  if (product.color && product.color !== '') filled.push({ key: 'Цвет', value: product.color });
  rawSpecs.forEach(s => { if (!filled.find(a => a.key === s.key)) filled.push(s); });

  // Always exactly SPEC_ROWS rows — pad with empty if needed
  const specs = Array.from({ length: SPEC_ROWS }, (_, i) => filled[i] || { key: '', value: '' });

  const priceVal   = priceType !== 'none' ? (product[priceType] || 0) : null;
  const priceNum   = priceVal > 0 ? priceVal.toLocaleString('ru') : null;
  const priceLabel = PRICE_LABELS[priceType] || '';

  return (
    <View style={S.card}>
      {/* Image — fixed height */}
      {noPhoto ? (
        <View style={S.noImageWrap}><Text style={S.noImageText}>нет фото</Text></View>
      ) : (
        <View style={S.imageWrap}>
          <Image src={imageUrl} style={S.productImg} />
        </View>
      )}

      {/* Body — fixed height */}
      <View style={S.cardBody}>
        <Text style={S.kicker}>{catLabel}</Text>

        <View style={S.nameWrap}>
          <Text style={S.productName}>{product.name || product.fullName}</Text>
        </View>

        {/* Price — always shown (blank if none) */}
        <View style={S.priceBlock}>
          {priceType !== 'none' ? (
            <>
              <Text style={S.priceLabel}>{priceLabel}</Text>
              <Text style={S.priceValue}>
                {priceNum || '—'}{priceNum ? ' ' : ''}
                {priceNum && <Text style={S.priceSom}>сом</Text>}
              </Text>
            </>
          ) : (
            <Text style={S.priceLabel}> </Text>
          )}
        </View>

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

// ── Content Page ──────────────────────────────────────────────────────────────
function ContentPage({ products, setName, pageIndex, priceType }) {
  const logoLeft = pageIndex % 2 === 0;
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
          {products[0] && <ProductCard product={products[0]} priceType={priceType} />}
          {products[1] && <ProductCard product={products[1]} priceType={priceType} />}
        </View>
        <View style={S.gridRow}>
          {products[2] && <ProductCard product={products[2]} priceType={priceType} />}
          {products[3] && <ProductCard product={products[3]} priceType={priceType} />}
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

// ── Category Divider Page ─────────────────────────────────────────────────────
function CategoryDividerPage({ categoryName }) {
  return (
    <Page size="A4" style={S.coverPage}>
      <View style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 180,
        backgroundColor: RED,
        borderBottomLeftRadius: 80,
        borderBottomRightRadius: 80,
      }} />
      <View style={{
        position: 'absolute',
        top: 220,
        left: 0,
        right: 0,
        alignItems: 'center',
      }}>
        <Text style={{
          fontSize: 42,
          fontWeight: 700,
          color: INK,
          textAlign: 'center',
          paddingHorizontal: 40,
        }}>{categoryName}</Text>
      </View>
      <View style={{
        position: 'absolute',
        bottom: 80,
        left: 0,
        right: 0,
        alignItems: 'center',
      }}>
        <View style={S.barsRow}>
          <View style={[S.bar, { backgroundColor: RED }]} />
          <View style={[S.bar, { backgroundColor: YELLOW }]} />
          <View style={[S.bar, { backgroundColor: ORANGE }]} />
        </View>
      </View>
    </Page>
  );
}

// ── Document ──────────────────────────────────────────────────────────────────
// groups: [{ groupName: string|null, products: Product[] }, ...]
function CatalogDocument({ groups, setName, priceType }) {
  const PER_PAGE = 4;
  const hasMultipleGroups = groups.length > 1 || (groups.length === 1 && groups[0].groupName);

  return (
    <Document title={`Каталог — ${setName}`} author="MATKASYM HOME">
      <CoverPage />
      {groups.map((group, groupIdx) => {
        const pages = [];
        for (let i = 0; i < group.products.length; i += PER_PAGE) {
          pages.push(group.products.slice(i, i + PER_PAGE));
        }
        return [
          hasMultipleGroups && group.groupName && (
            <CategoryDividerPage key={`div-${groupIdx}`} categoryName={group.groupName} />
          ),
          ...pages.map((chunk, pageIdx) => (
            <ContentPage
              key={`${groupIdx}-${pageIdx}`}
              products={chunk}
              setName={group.groupName || setName}
              pageIndex={groupIdx * 100 + pageIdx}
              priceType={priceType}
            />
          )),
        ];
      })}
      <BackCoverPage />
    </Document>
  );
}

// ── Export ────────────────────────────────────────────────────────────────────
// groups: [{ groupName: string|null, products: Product[] }, ...]
export async function downloadCatalogPDF(groups, setName, priceType = 'price') {
  const blob = await pdf(
    <CatalogDocument groups={groups} setName={setName} priceType={priceType} />
  ).toBlob();

  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = `matkasym-catalog-${setName.toLowerCase().replace(/\s+/g, '-')}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
