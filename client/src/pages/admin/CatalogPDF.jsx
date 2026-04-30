import React from 'react';
import {
  Document, Page, Text, View, Image, StyleSheet, Font, pdf,
} from '@react-pdf/renderer';

// ── Стили ──────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: {
    padding: 30,
    backgroundColor: '#ffffff',
    fontFamily: 'Helvetica',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    borderBottom: '2pt solid #e53935',
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: '#e53935',
    letterSpacing: 1,
  },
  headerSub: {
    fontSize: 9,
    color: '#888',
    marginTop: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    width: '47.5%',
    border: '1pt solid #e8e8e8',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 12,
    backgroundColor: '#fafafa',
  },
  imageBox: {
    width: '100%',
    height: 160,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  productImage: {
    width: '100%',
    height: 160,
    objectFit: 'contain',
  },
  noImage: {
    fontSize: 9,
    color: '#bbb',
  },
  cardBody: {
    padding: 10,
  },
  productName: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#222',
    marginBottom: 4,
    lineHeight: 1.3,
  },
  price: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#e53935',
    marginBottom: 6,
  },
  specsTitle: {
    fontSize: 7,
    color: '#888',
    marginBottom: 3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  specRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  specKey: {
    fontSize: 7.5,
    color: '#555',
    width: '45%',
  },
  specVal: {
    fontSize: 7.5,
    color: '#222',
    fontFamily: 'Helvetica-Bold',
    width: '55%',
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 30,
    right: 30,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTop: '1pt solid #eee',
    paddingTop: 6,
  },
  footerText: {
    fontSize: 7,
    color: '#aaa',
  },
  pageNum: {
    fontSize: 7,
    color: '#aaa',
  },
});

// ── Компонент карточки товара ───────────────────────────────────────────────
function ProductCard({ product }) {
  const imageUrl = product.images?.[0];
  const specs = (product.specs || []).filter(s => s.value);

  return (
    <View style={S.card}>
      <View style={S.imageBox}>
        {imageUrl ? (
          <Image src={imageUrl} style={S.productImage} />
        ) : (
          <Text style={S.noImage}>Нет фото</Text>
        )}
      </View>
      <View style={S.cardBody}>
        <Text style={S.productName}>{product.fullName || product.name}</Text>
        <Text style={S.price}>
          {product.price > 0 ? `${product.price.toLocaleString()} сом` : 'Цена по запросу'}
        </Text>
        {specs.length > 0 && (
          <>
            <Text style={S.specsTitle}>Характеристики</Text>
            {specs.slice(0, 5).map((s, i) => (
              <View key={i} style={S.specRow}>
                <Text style={S.specKey}>{s.key}:</Text>
                <Text style={S.specVal}>{s.value}{s.unit ? ` ${s.unit}` : ''}</Text>
              </View>
            ))}
          </>
        )}
      </View>
    </View>
  );
}

// ── Документ PDF ───────────────────────────────────────────────────────────
function CatalogDocument({ products, setName }) {
  // Split into pages of 6 products (3 rows × 2 columns)
  const chunkSize = 6;
  const pages = [];
  for (let i = 0; i < products.length; i += chunkSize) {
    pages.push(products.slice(i, i + chunkSize));
  }

  return (
    <Document title={`Каталог — ${setName}`} author="MATKASYM">
      {pages.map((pageProducts, pageIndex) => (
        <Page key={pageIndex} size="A4" style={S.page}>
          {/* Header */}
          <View style={S.header}>
            <View>
              <Text style={S.headerTitle}>MATKASYM HOME</Text>
              <Text style={S.headerSub}>Коллекция: {setName.toUpperCase()}</Text>
            </View>
            <Text style={S.headerSub}>matkasym.kg</Text>
          </View>

          {/* Products grid */}
          <View style={S.grid}>
            {pageProducts.map(p => (
              <ProductCard key={p._id} product={p} />
            ))}
          </View>

          {/* Footer */}
          <View style={S.footer} fixed>
            <Text style={S.footerText}>MATKASYM HOME — {setName.toUpperCase()}</Text>
            <Text style={S.pageNum} render={({ pageNumber, totalPages }) =>
              `${pageNumber} / ${totalPages}`
            } />
          </View>
        </Page>
      ))}
    </Document>
  );
}

// ── Функция генерации и скачивания PDF ─────────────────────────────────────
export async function downloadCatalogPDF(products, setName) {
  const blob = await pdf(
    <CatalogDocument products={products} setName={setName} />
  ).toBlob();

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `catalog-${setName}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
