import { useState, useRef } from 'react';
import { downloadCatalogPDF } from './CatalogPDF';

const PRICE_MODE_TO_TYPE = {
  retail: 'price',
  wholesale: 'priceWholesale',
  dealer: 'priceDealer',
  none: 'none',
};

// choices — список [{ category, label }]. Если он задан, кнопка сперва
// спрашивает, какой каталог выгружать: в сете услуг общий PDF смысла не имеет,
// покраску и сварку показывают разным людям и в разных разговорах.
// label из choices идёт в заголовок PDF: в базе категория называется
// «отдел-сварки», а в каталоге это «Сварка».
export default function AdminPdfButton({ products, groups, label = 'Каталог', priceMode = 'retail', currency = 'сом', choices = null }) {
  const [loading,   setLoading]   = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [picking,   setPicking]   = useState(false);
  const priceType = PRICE_MODE_TO_TYPE[priceMode] || 'price';
  const timerRef = useRef(null);

  if (!products?.length) return null;

  // pick — выбранный пункт из choices; null означает «весь набор, как раньше».
  const handleClick = async (pick = null) => {
    if (loading) return;
    setPicking(false);
    setLoading(true);
    setProgress(5);

    const useGroups = pick
      ? (groups || []).filter(([groupName]) => groupName === pick.category)
      : groups;
    const title = pick ? pick.label : label;

    // Build grouped data for PDF
    // «В пути» в PDF не попадает: на складе товара нет, печатать его в каталоге
    // нельзя. Позиции с остатком проходят по stock/inStock как обычно.
    let pdfGroups = null;

    if (useGroups && useGroups.length > 0) {
      // Use category groups — filter out "Нет в наличии" and empty groups
      pdfGroups = useGroups
        .filter(([groupName]) => groupName !== 'Нет в наличии')
        .map(([groupName, items]) => {
          // items is array of [name, variants] — extract first variant (primary product)
          const groupProducts = items
            .map(([, variants]) => variants[0])
            .filter(p => p.inStock || p.stock > 0 || p.isOnOrder || p.productStatus === 'test_sale');
          return { groupName, products: groupProducts };
        })
        .filter(g => g.products.length > 0);

      if (pdfGroups.length === 0) {
        alert(pick ? `В разделе «${pick.label}» нет товаров в наличии` : 'Нет товаров в наличии для выгрузки');
        setLoading(false);
        return;
      }
    } else {
      // No groups — use flat list filtered by availability
      const availableProducts = products.filter(p => p.inStock || p.stock > 0 || p.isOnOrder || p.productStatus === 'test_sale');
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
      await downloadCatalogPDF(pdfGroups, title, priceType, brand, currency);
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
    <>
    {picking && (
      <div
        onClick={() => setPicking(false)}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10001,
          background: 'rgba(17,20,24,.45)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: 16,
        }}
      >
        <div onClick={e => e.stopPropagation()} style={{
          background: '#fff', borderRadius: 14, width: 'min(360px, 100%)',
          padding: '18px 20px', boxShadow: '0 12px 40px rgba(0,0,0,.25)',
        }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#111' }}>Какой каталог скачать?</div>
          <div style={{ fontSize: 11, color: '#aab3bd', marginTop: 3 }}>
            Выгрузится один раздел — его название встанет в заголовок PDF.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 14 }}>
            {choices.map(c => {
              // Пункт без товаров в наличии показываем, но не даём нажать:
              // иначе непонятно, куда делся раздел.
              const has = (groups || []).some(([g, items]) => g === c.category && items.length > 0);
              return (
                <button key={c.category} onClick={() => has && handleClick(c)} disabled={!has}
                  style={{
                    padding: '10px 14px', borderRadius: 10, textAlign: 'left',
                    border: '1.5px solid ' + (has ? '#d6dee7' : '#eef0f3'),
                    background: '#fff', color: has ? '#111' : '#c3cad2',
                    fontSize: 13, fontWeight: 700, cursor: has ? 'pointer' : 'default',
                  }}>
                  {c.label}
                  {!has && <span style={{ fontWeight: 500, fontSize: 11 }}> — нет товаров</span>}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
            <button onClick={() => setPicking(false)} style={{
              padding: '7px 14px', borderRadius: 9, border: '1.5px solid #e0e0e0',
              background: '#fff', color: '#555', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>Отмена</button>
          </div>
        </div>
      </div>
    )}
    <button
        onClick={() => (choices?.length ? setPicking(true) : handleClick())}
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
    </>
  );
}
