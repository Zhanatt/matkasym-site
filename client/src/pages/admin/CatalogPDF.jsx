import React from 'react';
import {
  Document, Page, Text, View, Image, StyleSheet, Font, pdf,
} from '@react-pdf/renderer';

// ── Cyrillic-capable font ───────────────────────────────────────────────────
Font.register({
  family: 'Roboto',
  fonts: [
    { src: '/fonts/Roboto-Regular.ttf', fontWeight: 400 },
    { src: '/fonts/Roboto-Medium.ttf',  fontWeight: 500 },
    { src: '/fonts/Roboto-Bold.ttf',    fontWeight: 700 },
  ],
});
Font.registerHyphenationCallback(w => [w]); // disable hyphenation

const RED   = '#E53935';
const BLACK = '#111111';
const GRAY  = '#888888';
const LGRAY = '#f4f4f4';

// ── Styles ─────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingHorizontal: 28,
    paddingBottom: 36,
    backgroundColor: '#ffffff',
    fontFamily: 'Roboto',
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 18,
  },
  headerSetName: {
    fontSize: 20,
    fontWeight: 700,
    color: BLACK,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  logoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  logoImg: {
    width: 28,
    height: 28,
  },
  logoText: {
    fontSize: 11,
    fontWeight: 700,
    color: BLACK,
    letterSpacing: 1,
  },

  // Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  card: {
    width: '47.8%',
    marginBottom: 14,
  },

  // Image area
  imageBox: {
    width: '100%',
    height: 200,
    backgroundColor: '#f8f8f8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  productImage: {
    width: '100%',
    height: 200,
    objectFit: 'contain',
  },
  noImageBox: {
    width: '100%',
    height: 200,
    backgroundColor: '#1a1a1a',
    marginBottom: 8,
  },

  // Color dots
  dotsRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 6,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 999,
  },

  // Card body
  categoryLabel: {
    fontSize: 8,
    color: GRAY,
    fontWeight: 400,
    marginBottom: 2,
  },
  productName: {
    fontSize: 13,
    fontWeight: 700,
    color: BLACK,
    marginBottom: 6,
    lineHeight: 1.25,
  },

  // Price row
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  priceLabel: {
    fontSize: 8,
    color: GRAY,
    fontWeight: 400,
  },
  priceBadge: {
    backgroundColor: RED,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 3,
  },
  priceText: {
    fontSize: 10,
    fontWeight: 700,
    color: '#ffffff',
  },

  // Specs
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e5e5e5',
  },
  specKey: {
    fontSize: 8,
    color: GRAY,
    fontWeight: 400,
    width: '50%',
  },
  specVal: {
    fontSize: 8,
    color: BLACK,
    fontWeight: 500,
    width: '48%',
    textAlign: 'right',
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 14,
    left: 28,
    right: 28,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 8,
    color: '#bbbbbb',
    fontWeight: 400,
  },
});

// ── Color map ───────────────────────────────────────────────────────────────
const COLOR_HEX = {
  white: '#f0f0f0', black: '#1a1a1a', grey: '#888888',
  gray: '#888888', red: '#e53935', blue: '#1565C0',
  silver: '#c0c0c0', gold: '#d4af37', brown: '#795548',
};

// ── Category labels ─────────────────────────────────────────────────────────
const CATEGORY_LABELS = {
  'clothes-dryer':   'сушилка для белья',
  'laundry-basket':  'корзина для белья',
  'ironing-board':   'гладильная доска',
  'wardrobe-rack':   'напольная вешалка',
  'coat-hanger':     'костюмная вешалка',
  'toilet-brush':    'ершик для туалета',
  'mop':             'швабра',
  'cleaning-set':    'щётка / стекломойка',
  'bath-mat':        'коврик для ванной',
  'entrance-mat':    'коврик для прихожей',
  'bath-accessories':'аксессуары для ванны',
  'bath-curtain-rod':'карниз для шторки',
  'bath-shower-curtain':'шторка для душа',
  'ladder':          'стремянка',
  'hook':            'крючки',
  'organizer-kitchen':'кухонный органайзер',
  'dish-drainer':    'сушилка для посуды',
  'hanger-clip':     'плечики',
  'ac-basket':       'корзина для кондиционера',
  'ac-mount':        'кронштейн кондиционера',
  'industrial-shelf':'промышленный стеллаж',
  'storage-tumba':   'тумба',
  'school-desk':     'школьная парта',
  'other':           'товар для дома',
};

// ── Product Card ─────────────────────────────────────────────────────────────
function ProductCard({ product }) {
  const imageUrl = product.images?.[0];
  const specs    = (product.specs || []).filter(s => s.value).slice(0, 5);
  const catLabel = CATEGORY_LABELS[product.category] || 'товар для дома';

  // Color dots
  const colors = [];
  if (product.color) colors.push(product.color);
  else if (product.name?.toLowerCase().includes('бел')) colors.push('white');
  if (product.name?.toLowerCase().includes('черн')) colors.push('black');

  return (
    <View style={S.card}>
      {/* Image */}
      {imageUrl ? (
        <Image src={imageUrl} style={S.productImage} />
      ) : (
        <View style={S.noImageBox} />
      )}

      {/* Color dots */}
      {colors.length > 0 && (
        <View style={S.dotsRow}>
          {colors.map((c, i) => (
            <View
              key={i}
              style={[S.dot, {
                backgroundColor: COLOR_HEX[c] || '#ccc',
                borderWidth: c === 'white' ? 0.5 : 0,
                borderColor: '#ccc',
              }]}
            />
          ))}
        </View>
      )}

      {/* Category + Name */}
      <Text style={S.categoryLabel}>{catLabel}</Text>
      <Text style={S.productName}>{product.fullName || product.name}</Text>

      {/* Price */}
      <View style={S.priceRow}>
        <Text style={S.priceLabel}>розн. цена</Text>
        {product.price > 0 ? (
          <View style={S.priceBadge}>
            <Text style={S.priceText}>{product.price.toLocaleString('ru')} сом</Text>
          </View>
        ) : (
          <View style={[S.priceBadge, { backgroundColor: '#555' }]}>
            <Text style={S.priceText}>по запросу</Text>
          </View>
        )}
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

// ── PDF Document ─────────────────────────────────────────────────────────────
function CatalogDocument({ products, setName }) {
  const PER_PAGE = 4; // 2×2
  const pages = [];
  for (let i = 0; i < products.length; i += PER_PAGE) {
    pages.push(products.slice(i, i + PER_PAGE));
  }

  const logoSrc = '/logos/logo-main.png';

  return (
    <Document title={`Каталог — ${setName}`} author="MATKASYM">
      {pages.map((pageProducts, pageIndex) => (
        <Page key={pageIndex} size="A4" style={S.page}>

          {/* Header */}
          <View style={S.header}>
            <Text style={S.headerSetName}>{setName}</Text>
            <View style={S.logoWrap}>
              <Image src={logoSrc} style={S.logoImg} />
              <Text style={S.logoText}>MATKASYM</Text>
            </View>
          </View>

          {/* Products 2×2 */}
          <View style={S.grid}>
            {pageProducts.map(p => (
              <ProductCard key={p._id || p.name} product={p} />
            ))}
          </View>

          {/* Footer */}
          <View style={S.footer} fixed>
            <Text
              style={S.footerText}
              render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
            />
          </View>
        </Page>
      ))}
    </Document>
  );
}

// ── Export function ───────────────────────────────────────────────────────────
export async function downloadCatalogPDF(products, setName) {
  const blob = await pdf(
    <CatalogDocument products={products} setName={setName} />
  ).toBlob();

  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = `catalog-${setName}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
