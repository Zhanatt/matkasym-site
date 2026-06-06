import { useState, useRef } from 'react';
import { downloadCatalogPDF } from './CatalogPDF';

export default function AdminPdfButton({ products, groups, label = 'Каталог' }) {
  const [loading,   setLoading]   = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [priceType, setPriceType] = useState('price');
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
            .filter(p => p.inStock || p.stock > 0 || p.isOnOrder || p.inTransit);
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
      const availableProducts = products.filter(p => p.inStock || p.stock > 0 || p.isOnOrder || p.inTransit);
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

    // Determine brand from products (shaar vs home)
    const allProducts = pdfGroups.flatMap(g => g.products);
    const brand = allProducts.some(p => p.brand === 'matkasym-shaar') ? 'shaar' : 'home';

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
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <select
        value={priceType}
        onChange={e => setPriceType(e.target.value)}
        disabled={loading}
        style={{ padding: '5px 8px', borderRadius: 6, border: '1.5px solid #e0e0e0',
          fontSize: 12, background: '#fff', cursor: 'pointer', outline: 'none' }}
      >
        <option value="price">Розничная</option>
        <option value="priceWholesale">Оптовая</option>
        <option value="priceDealer">Дилерская</option>
        <option value="none">Без цены</option>
      </select>

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
    </div>
  );
}
