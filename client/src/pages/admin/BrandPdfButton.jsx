import { useState, useRef } from 'react';
import { adminGetProducts } from '../../api/index';
import { downloadCatalogPDF } from './CatalogPDF';

export default function BrandPdfButton({ brandKey, sets = [], brandLabel = 'Каталог' }) {
  const [loading,   setLoading]   = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [priceType, setPriceType] = useState('price');
  const timerRef = useRef(null);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    setProgress(5);

    timerRef.current = setInterval(() => {
      setProgress(p => p < 88 ? p + (88 - p) * 0.08 : p);
    }, 300);

    try {
      const res = await adminGetProducts({ brand: brandKey, limit: 5000 });
      const allProducts = res.data.products || [];

      const availableProducts = allProducts.filter(p =>
        p.inStock || p.stock > 0 || p.isOnOrder || p.inTransit || p.productStatus === 'test_sale'
      );

      if (availableProducts.length === 0) {
        alert('Нет доступных товаров для выгрузки');
        clearInterval(timerRef.current);
        setLoading(false);
        setProgress(0);
        return;
      }

      const setOrder = sets.map(s => s.key);
      const setLabels = {};
      sets.forEach(s => { setLabels[s.key] = s.label || s.key; });

      const grouped = {};
      availableProducts.forEach(p => {
        const setKey = p.set || '_other';
        if (!grouped[setKey]) grouped[setKey] = [];
        grouped[setKey].push(p);
      });

      const pdfGroups = [];

      setOrder.forEach(setKey => {
        if (grouped[setKey] && grouped[setKey].length > 0) {
          pdfGroups.push({
            groupName: setLabels[setKey] || setKey,
            products: grouped[setKey]
          });
        }
      });

      Object.keys(grouped).forEach(setKey => {
        if (!setOrder.includes(setKey) && grouped[setKey].length > 0) {
          pdfGroups.push({
            groupName: setLabels[setKey] || setKey,
            products: grouped[setKey]
          });
        }
      });

      if (pdfGroups.length === 0) {
        alert('Нет товаров для выгрузки');
        clearInterval(timerRef.current);
        setLoading(false);
        setProgress(0);
        return;
      }

      const brand = brandKey === 'matkasym-kyzmat' ? 'kyzmat'
                  : brandKey === 'matkasym-shaar' ? 'shaar' : 'home';

      await downloadCatalogPDF(pdfGroups, brandLabel, priceType, brand);

      clearInterval(timerRef.current);
      setProgress(100);
    } catch (e) {
      console.error('Brand PDF error:', e);
      alert('Ошибка при создании PDF');
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
        {loading && (
          <span style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
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
