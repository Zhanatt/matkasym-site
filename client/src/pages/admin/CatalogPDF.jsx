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
const HAIRLINE = '#D9DCDE';
const STEEL    = '#8FA3B0';
const WHITE    = '#FFFFFF';
const YELLOW   = '#F2C84A';
const ORANGE   = '#E89B3C';

const LOGO = '/logos/logo-main.png';

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

  // ── 2×2 grid ───────────────────────────────────────────────────────────────
  // A4 content width = 595.28 - 56 = 539.28pt
  // 2 cards + 14pt gap → each card = (539.28 - 14) / 2 = 262.64pt
  // A4 content height = 841.89 - 64 = 777.89pt; header ~40pt → grid = 737pt
  // 2 rows + 14pt gap → each row = (737 - 14) / 2 = 361.5pt
  grid: {
    flexDirection: 'column',
    gap: 14,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 14,
  },
  card: {
    width: 262,
  },

  // ── Image area ─────────────────────────────────────────────────────────────
  imageWrap: {
    width: 262,
    height: 190,
    backgroundColor: '#f8f8f8',
    marginBottom: 8,
    position: 'relative',
  },
  productImg: {
    width: 262,
    height: 190,
    objectFit: 'contain',
  },
  noImageWrap: {
    width: 262,
    height: 190,
    backgroundColor: '#1A1A1A',
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noImageText: {
    fontSize: 7,
    color: '#444',
    fontWeight: 400,
  },
  swatchRow: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    flexDirection: 'row',
    gap: 3,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },

  // ── Card body ─────────────────────────────────────────────────────────────
  kicker: {
    fontSize: 8,
    color: GRAY,
    fontWeight: 400,
    marginBottom: 3,
    lineHeight: 1.2,
  },
  productName: {
    fontSize: 12,
    fontWeight: 700,
    color: INK,
    marginBottom: 5,
    lineHeight: 1.2,
  },
  nameHairline: {
    height: 0.75,
    backgroundColor: HAIRLINE,
    marginBottom: 0,
  },

  // price row
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: HAIRLINE,
  },
  priceLabel: {
    fontSize: 8,
    color: GRAY,
    fontWeight: 400,
  },
  priceValue: {
    fontSize: 9,
    fontWeight: 700,
    color: RED,
  },

  // spec row
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3.5,
    borderBottomWidth: 0.5,
    borderBottomColor: HAIRLINE,
  },
  specKey: {
    fontSize: 7.5,
    color: GRAY,
    fontWeight: 400,
    width: '55%',
  },
  specVal: {
    fontSize: 7.5,
    color: INK,
    fontWeight: 400,
    width: '43%',
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

// ── Product Card ──────────────────────────────────────────────────────────────
function ProductCard({ product }) {
  const imageUrl = product.images?.[0];
  const specs    = (product.specs || []).filter(s => s.value).slice(0, 4);
  const catLabel = CATEGORY_LABELS[product.category] || 'товар для дома';

  const swatches = [];
  if (product.color) {
    const c = product.color.toLowerCase();
    if (COLOR_HEX[c]) swatches.push(c);
  }

  return (
    <View style={S.card}>
      {/* Image */}
      {imageUrl ? (
        <View style={S.imageWrap}>
          <Image src={imageUrl} style={S.productImg} />
          {swatches.length > 0 && (
            <View style={S.swatchRow}>
              {swatches.map((c, i) => (
                <View key={i} style={[S.swatch, {
                  backgroundColor: COLOR_HEX[c],
                  borderWidth: c === 'white' ? 0.5 : 0,
                  borderColor: HAIRLINE,
                }]} />
              ))}
            </View>
          )}
        </View>
      ) : (
        <View style={S.noImageWrap}>
          <Text style={S.noImageText}>product photo</Text>
        </View>
      )}

      {/* Kicker */}
      <Text style={S.kicker}>{catLabel}</Text>

      {/* Name */}
      <Text style={S.productName}>{product.name || product.fullName}</Text>

      {/* Hairline */}
      <View style={S.nameHairline} />

      {/* Price */}
      <View style={S.priceRow}>
        <Text style={S.priceLabel}>розн. цена</Text>
        <Text style={S.priceValue}>
          {product.price > 0 ? `${product.price.toLocaleString('ru')} сом` : 'по запросу'}
        </Text>
      </View>

      {/* Specs */}
      {specs.map((s, i) => (
        <View key={i} style={S.specRow}>
          <Text style={S.specKey}>{s.key}</Text>
          <Text style={S.specVal}>{s.value}{s.unit ? ` ${s.unit}` : ''}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Content Page ──────────────────────────────────────────────────────────────
function ContentPage({ products, setName, pageIndex }) {
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
          {products[0] && <ProductCard product={products[0]} />}
          {products[1] && <ProductCard product={products[1]} />}
        </View>
        <View style={S.gridRow}>
          {products[2] && <ProductCard product={products[2]} />}
          {products[3] && <ProductCard product={products[3]} />}
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
function CatalogDocument({ products, setName }) {
  const PER_PAGE = 4;
  const pages = [];
  for (let i = 0; i < products.length; i += PER_PAGE) {
    pages.push(products.slice(i, i + PER_PAGE));
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
  a.download = `matkasym-catalog-${setName.toLowerCase().replace(/\s+/g, '-')}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
