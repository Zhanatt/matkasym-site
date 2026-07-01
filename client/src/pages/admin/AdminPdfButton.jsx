import { useState, useRef } from 'react';
import { downloadCatalogPDF } from './CatalogPDF';

const PRICE_MODE_TO_TYPE = {
  retail: 'price',
  wholesale: 'priceWholesale',
  dealer: 'priceDealer',
  none: 'none',
};

export default function AdminPdfButton({ products, groups, label = 'Каталог', priceMode = 'retail' }) {
  const [loading,   setLoading]   = useState(false);
  const [progress,  setProgress]  = useState(0);
  const priceType = PRICE_MODE_TO_TYPE[priceMode] || 'price';
  const timerRef = useRef(null);

  if (!products?.length) return null;

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    setProgress(5);

    // Build grouped data for PDF
    let pdfGroups = null;

    if (groups && groups.length > 0) {
      // Use category groups — filter out "Нет в наличии" and empty groups
      pdfGroups = groups
        .filter(([groupName]) => groupName !== 'Нет в наличии')
        .map(([groupName, items]) => {
          // items is array of [name, variants] — extract first variant (primary product)
          const groupProducts = items
            .map(([, variants]) => variants[0])
            .filter(p => p.inStock || p.stock > 0 || p.isOnOrder || p.inTransit || p.productStatus === 'test_sale');
          return { groupName, products: groupProducts };
        })
        .filter(g => g.products.length > 0);

      if (pdfGroups.length === 0) {
        alert('Нет товаров в наличии для выгрузки');
        setLoading(false);
        return;
      }
    } else {
      // No groups — use flat list filtered by availability
      const availableProducts = products.filter(p => p.inStock || p.stock > 0 || p.isOnOrder || p.inTransit || p.productStatus === 'test_sale');
      if (availableProducts.length === 0) {
        alert('Нет доступных товаров для выгрузки');
        setLoading(false);
        return;
      }
      pdfGroups = [{ groupName: null, products: availableProducts }];
    }

    // Fake progress: ramps to ~88% while PDF generates, then snaps to 100%
    timerRef.current = setInterval(() => {
      setProgress(p => p < 88 ? p + (88 - p) * 0.12 : p);
    }, 250);

    // Determine brand from products (kyzmat, shaar, or home)
    const allProducts = pdfGroups.flatMap(g => g.products);
    const brand = allProducts.some(p => p.brand === 'matkasym-kyzmat') ? 'kyzmat'
                : allProducts.some(p => p.brand === 'matkasym-shaar') ? 'shaar' : 'home';

    try {
      await downloadCatalogPDF(pdfGroups, label, priceType, brand);
      clearInterval(timerRef.current);
      setProgress(100);
    } catch (e) {
      console.error('PDF error:', e);
      clearInterval(timerRef.current);
    } finally {
      setTimeout(() => { setLoading(false); setProgress(0); }, 600);
    }
  };

  return (
    <button
        onClick={handleClick}
        disabled={loading}
        style={{
          position: 'relative', overflow: 'hidden',
          padding: '5px 14px', borderRadius: 6, border: 'none',
          cursor: loading ? 'wait' : 'pointer',
          background: '#1a73e8', color: '#fff',
          fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap', minWidth: 90,
        }}
      >
        {/* progress fill behind text */}
        {loading && (
          <span style={{
            position: 'absolute', inset: 0,
            background: 'rgba(255,255,255,0.22)',
            width: `${progress}%`,
            transition: 'width 0.25s ease',
            borderRadius: 6,
          }} />
        )}
        <span style={{ position: 'relative', zIndex: 1 }}>
          {loading ? `⏳ ${Math.round(progress)}%` : '📄 PDF'}
        </span>
      </button>
  );
}
