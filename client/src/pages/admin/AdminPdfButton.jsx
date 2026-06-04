import { useState, useRef } from 'react';
import { downloadCatalogPDF } from './CatalogPDF';

export default function AdminPdfButton({ products, label = 'Каталог' }) {
  const [loading,   setLoading]   = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [priceType, setPriceType] = useState('price');
  const timerRef = useRef(null);

  if (!products?.length) return null;

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    setProgress(5);

    // Filter only products in stock
    const inStockProducts = products.filter(p => p.inStock || p.stock > 0);
    if (inStockProducts.length === 0) {
      alert('Нет товаров в наличии для выгрузки');
      setLoading(false);
      return;
    }

    // Fake progress: ramps to ~88% while PDF generates, then snaps to 100%
    timerRef.current = setInterval(() => {
      setProgress(p => p < 88 ? p + (88 - p) * 0.12 : p);
    }, 250);

    try {
      await downloadCatalogPDF(inStockProducts, label, priceType);
      clearInterval(timerRef.current);
      setProgress(100);
    } catch (e) {
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
