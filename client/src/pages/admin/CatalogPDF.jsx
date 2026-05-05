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

// ── Design tokens (from Figma) ────────────────────────────────────────────────
const RED      = '#D8232A';
const INK      = '#1A1A1A';
const GRAY     = '#6E7378';
const HAIRLINE = '#D9DCDE';
const STEEL    = '#8FA3B0';
const WHITE    = '#FFFFFF';
const YELLOW   = '#F2C84A';
const ORANGE   = '#E89B3C';

// A4: 595.28 × 841.89 pt
// content width  = 595.28 - 2×28 = 539.28 → card = (539.28 - 14) / 2 = 262.64 ≈ 262
// content height = 841.89 - 28 - 36 = 777.89; header ~32 → grid = 745; row = (745-14)/2 = 365
const CARD_W   = 262;
const IMG_H    = 200;
const LOGO     = '/logos/logo-main.png';

// ── Styles ────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({

  // ── Cover ──────────────────────────────────────────────────────────────────
  coverPage: {
    fontFamily: 'Roboto',
    backgroundColor: WHITE,
    position: 'relative',
  },

  // Red pentagon shape: rectangle + downward triangle
  coverRect: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 160,
    backgroundColor: RED,
  },
  coverTriangle: {
    position: 'absolute',
    top: 160,
    left: 0,
    width: 0,
    height: 0,
    borderStyle: 'solid',
    borderLeftWidth: 297.5,
    borderRightWidth: 297.5,
    borderTopWidth: 70,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: RED,
  },

  // Logo inside red area, centered
  coverLogoWrap: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  coverLogo: {
    width: 160,
    height: 32,
  },

  // Title block below the red shape
  coverBody: {
    position: 'absolute',
    top: 270,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  coverH1: {
    fontSize: 60,
    fontWeight: 700,
    color: INK,
    letterSpacing: 2,
    lineHeight: 1.05,
    textAlign: 'center',
  },
  coverSubtitle: {
    fontSize: 13,
    fontWeight: 500,
    color: STEEL,
    letterSpacing: 6,
    marginTop: 12,
  },

  // Tagline bottom-left
  coverTagline: {
    position: 'absolute',
    bottom: 52,
    left: 44,
  },
  coverTaglineText: {
    fontSize: 13,
    fontWeight: 500,
    color: INK,
    marginBottom: 8,
  },
  barsRow: {
    flexDirection: 'row',
    gap: 5,
  },
  bar: {
    width: 7,
    height: 30,
    borderRadius: 2,
  },

  // ── Content pages ──────────────────────────────────────────────────────────
  contentPage: {
    fontFamily: 'Roboto',
    backgroundColor: WHITE,
    paddingTop: 24,
    paddingHorizontal: 28,
    paddingBottom: 32,
  },
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  headerLogo: {
    width: 96,
    height: 19,
  },
  headerSetName: {
    fontSize: 16,
    fontWeight: 700,
    color: INK,
    letterSpacing: 0.3,
  },
  headerHairline: {
    height: 0.75,
    backgroundColor: HAIRLINE,
    marginBottom: 14,
  },

  // ── Grid: explicit rows to avoid react-pdf flexWrap bug ────────────────────
  grid: {
    flexDirection: 'column',
    gap: 14,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 14,
  },

  // ── Card ───────────────────────────────────────────────────────────────────
  card: {
    width: CARD_W,
  },

  // Image area
  imageArea: {
    width: CARD_W,
    height: IMG_H,
    backgroundColor: '#f7f7f7',
    marginBottom: 0,
    position: 'relative',
  },
  productImg: {
    width: CARD_W,
    height: IMG_H,
    objectFit: 'contain',
  },
  // "СКОРО!" black-covered product
  soonImgArea: {
    width: CARD_W,
    height: IMG_H,
    backgroundColor: '#1A1A1A',
    marginBottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },

  swatchRow: {
    position: 'absolute',
    bottom: 7,
    right: 8,
    flexDirection: 'row',
    gap: 4,
  },
  swatch: {
    width: 12,
    height: 12,
    borderRadius: 999,
  },
  swatchWhite: {
    borderWidth: 1,
    borderColor: '#bbbbbb',
    backgroundColor: WHITE,
  },
  swatchBlack: {
    backgroundColor: INK,
  },

  // Meta row: kicker (left) + "розничная цена" label (right)
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 8,
    marginBottom: 2,
  },
  kicker: {
    fontSize: 8,
    color: GRAY,
    fontWeight: 400,
    lineHeight: 1.2,
  },
  priceLabel: {
    fontSize: 8,
    color: GRAY,
    fontWeight: 400,
  },

  // Name row: product name (left) + red price badge (right)
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  productName: {
    fontSize: 16,
    fontWeight: 700,
    color: INK,
    lineHeight: 1.15,
    flex: 1,
    marginRight: 8,
  },
  priceBadge: {
    backgroundColor: RED,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 3,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  priceText: {
    fontSize: 9,
    fontWeight: 700,
    color: WHITE,
    whiteSpace: 'nowrap',
  },

  // Hairline between name block and specs
  nameHairline: {
    height: 0.75,
    backgroundColor: HAIRLINE,
    marginBottom: 0,
  },

  // Spec rows
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
    borderBottomWidth: 0.75,
    borderBottomColor: HAIRLINE,
  },
  specKey: {
    fontSize: 8,
    color: GRAY,
    fontWeight: 400,
    width: '55%',
  },
  specVal: {
    fontSize: 8,
    color: INK,
    fontWeight: 400,
    width: '43%',
    textAlign: 'right',
  },
  // Empty spec line for СКОРО! placeholder
  specRowEmpty: {
    height: 18.75,
    borderBottomWidth: 0.75,
    borderBottomColor: HAIRLINE,
  },

  // ── Page footer ────────────────────────────────────────────────────────────
  pageFooter: {
    position: 'absolute',
    bottom: 12,
    left: 28,
    right: 28,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  pageNum: {
    fontSize: 8,
    color: '#cccccc',
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
    width: 220,
    height: 44,
  },
  backFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: RED,
    paddingVertical: 28,
    paddingHorizontal: 40,
    flexDirection: 'row',
  },
  backCol: {
    flex: 1,
  },
  backColLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: WHITE,
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  backColText: {
    fontSize: 9,
    color: WHITE,
    fontWeight: 400,
    lineHeight: 1.7,
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const COLOR_HEX = {
  white: '#ffffff', black: '#1a1a1a', grey: '#888', gray: '#888',
  red: '#D8232A', blue: '#1565C0', silver: '#c0c0c0',
  gold: '#d4af37', brown: '#795548', beige: '#d4b896',
};

const CATEGORY_LABELS = {
  'clothes-dryer':        'сушилка для белья',
  'laundry-basket':       'корзина для белья',
  'ironing-board':        'гладильная доска',
  'wardrobe-rack':        'напольная вешалка',
  'coat-hanger':          'вешалка',
  'shoe-rack':            'обувная полка',
  'wall-hanger':          'настенная вешалка',
  'toilet-shelf':         'над унитазная полка',
  'bath-shelf':           'над стиральная полка',
  'bath-corner-shelf':    'угловая полка',
  'flower-stand':         'подставка для цветов',
  'bbq-grill':            'мангал',
  'antenna':              'антенна наружная',
  'antenna-indoor':       'антенна комнатная',
  'tv-bracket':           'кронштейн для TV',
  'electric-panel':       'электрощит',
  'wall-shelf':           'настенная полка',
  'hook':                 'крючки',
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
      {/* Red pentagon: rectangle + downward triangle */}
      <View style={S.coverRect} />
      <View style={S.coverTriangle} />

      {/* Logo centered in red area */}
      <View style={S.coverLogoWrap}>
        <Image src={LOGO} style={S.coverLogo} />
      </View>

      {/* Title */}
      <View style={S.coverBody}>
        <Text style={S.coverH1}>{'MATKASYM\nHOME'}</Text>
        <Text style={S.coverSubtitle}>ТОВАРЫ ДЛЯ ДОМА</Text>
      </View>

      {/* Tagline bottom-left */}
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
            matkasymovllc@gmail.com{'\n'}@matkasym_home{'\n'}@make_in_kg
          </Text>
        </View>
      </View>
    </Page>
  );
}

// ── Color Swatches ────────────────────────────────────────────────────────────
function Swatches({ color }) {
  if (!color) return null;
  const c = color.toLowerCase();
  const hasWhite = ['white', 'белый', 'белый, черный'].includes(c) || c.includes('бел');
  const hasBlack = ['black', 'черный', 'белый, черный'].includes(c) || c.includes('черн');
  const other    = !hasWhite && !hasBlack && COLOR_HEX[c];

  if (!hasWhite && !hasBlack && !other) return null;
  return (
    <View style={S.swatchRow}>
      {hasWhite && <View style={[S.swatch, S.swatchWhite]} />}
      {hasBlack && <View style={[S.swatch, S.swatchBlack]} />}
      {other    && <View style={[S.swatch, { backgroundColor: COLOR_HEX[c] }]} />}
    </View>
  );
}

// ── Product Card ──────────────────────────────────────────────────────────────
function ProductCard({ product }) {
  const imageUrl  = product.images?.[0];
  const specs     = (product.specs || []).filter(s => s.value).slice(0, 4);
  const catLabel  = CATEGORY_LABELS[product.category] || 'товар для дома';
  const isSoon    = !imageUrl && !product.price;
  const priceStr  = product.price > 0
    ? `${product.price.toLocaleString('ru')} сом`
    : null;

  return (
    <View style={S.card}>
      {/* Image area */}
      {imageUrl ? (
        <View style={S.imageArea}>
          <Image src={imageUrl} style={S.productImg} />
          <Swatches color={product.color} />
        </View>
      ) : (
        <View style={S.soonImgArea}>
          <Swatches color={product.color} />
        </View>
      )}

      {/* Meta row: kicker | "розничная цена" */}
      <View style={S.metaRow}>
        <Text style={S.kicker}>{catLabel}</Text>
        <Text style={S.priceLabel}>розничная цена</Text>
      </View>

      {/* Name row: name | price badge */}
      <View style={S.nameRow}>
        <Text style={S.productName}>
          {isSoon ? 'СКОРО!' : (product.name || product.fullName)}
        </Text>
        <View style={S.priceBadge}>
          {priceStr ? <Text style={S.priceText}>{priceStr}</Text> : null}
        </View>
      </View>

      {/* Hairline */}
      <View style={S.nameHairline} />

      {/* Specs — or empty placeholder lines for СКОРО! */}
      {isSoon ? (
        <>
          <View style={S.specRowEmpty} />
          <View style={S.specRowEmpty} />
          <View style={S.specRowEmpty} />
          <View style={S.specRowEmpty} />
        </>
      ) : (
        specs.map((s, i) => (
          <View key={i} style={S.specRow}>
            <Text style={S.specKey}>{s.key}</Text>
            <Text style={S.specVal}>{s.value}{s.unit ? ` ${s.unit}` : ''}</Text>
          </View>
        ))
      )}
    </View>
  );
}

// ── Content Page ──────────────────────────────────────────────────────────────
function ContentPage({ products, setName, pageIndex }) {
  // Odd pages: Logo left, SetName right. Even: SetName left, Logo right.
  const logoLeft = pageIndex % 2 === 0;
  return (
    <Page size="A4" style={S.contentPage}>
      {/* Header */}
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

      {/* 2×2 grid — explicit rows */}
      <View style={S.grid}>
        <View style={S.gridRow}>
          {products[0] && <ProductCard product={products[0]} />}
          {products[1] && <ProductCard product={products[1]} />}
        </View>
        <View style={S.gridRow}>
          {products[2] && <ProductCard product={products[2]} />}
          {products[3] && <ProductCard product={products[3]} />}
        </View>
      </View>

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
function CatalogDocument({ products, setName }) {
  const pages = [];
  for (let i = 0; i < products.length; i += 4) {
    pages.push(products.slice(i, i + 4));
  }
  return (
    <Document title={`Каталог — ${setName}`} author="MATKASYM HOME">
      <CoverPage />
      {pages.map((chunk, idx) => (
        <ContentPage key={idx} products={chunk} setName={setName} pageIndex={idx} />
      ))}
      <BackCoverPage />
    </Document>
  );
}

// ── Export ────────────────────────────────────────────────────────────────────
export async function downloadCatalogPDF(products, setName) {
  const blob = await pdf(
    <CatalogDocument products={products} setName={setName} />
  ).toBlob();
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = `matkasym-${setName.toLowerCase().replace(/\s+/g, '-')}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
