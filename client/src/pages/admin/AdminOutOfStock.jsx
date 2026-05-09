import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminGetProducts } from '../../api';
import AdminProductModal from './AdminProductModal';

const NO_PHOTO = '/logos/no-photo.png';

const PRICE_MODES = [
  { key: 'retail',    label: 'Розн.' },
  { key: 'wholesale', label: 'Опт.'  },
  { key: 'dealer',    label: 'Дил.'  },
];

function getPrice(p, mode) {
  if (mode === 'retail')    return p.price;
  if (mode === 'wholesale') return p.priceWholesale;
  if (mode === 'dealer')    return p.priceDealer;
  return null;
}

export default function AdminOutOfStock() {
  const navigate = useNavigate();
  const [products,      setProducts]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [priceMode,     setPriceMode]     = useState('retail');
  const [search,        setSearch]        = useState('');
  const [viewMode,      setViewMode]      = useState(() => localStorage.getItem('adminCatalogView') || 'grid');
  const [detailProduct, setDetailProduct] = useState(null);

  const toggleView = () => {
    const next = viewMode === 'grid' ? 'list' : 'grid';
    setViewMode(next);
    localStorage.setItem('adminCatalogView', next);
  };

  useEffect(() => {
    adminGetProducts({ inStock: false, limit: 1000 })
      .then(r => setProducts(r.data.products || []))
      .finally(() => setLoading(false));
  }, []);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? products.filter(p => (p.fullName || p.name || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q))
    : products;

  // Group by name
  const grouped = {};
  filtered.forEach(p => {
    const key = p.name || p.fullName || p._id;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(p);
  });
  const models = Object.entries(grouped);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '0 0 18px 0', borderBottom: '1px solid #eee', marginBottom: 20,
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: '0 4px', color: '#888' }}
        >←</button>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#c0392b' }}>
            ⚠️ Нет в наличии
          </div>
          <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>
            {loading ? '…' : `${products.length} товаров`}
          </div>
        </div>

        {/* Price mode */}
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {PRICE_MODES.map(m => (
            <button key={m.key} onClick={() => setPriceMode(m.key)} style={{
              padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: 12,
              background: priceMode === m.key ? '#c0392b' : '#f0f0f0',
              color:      priceMode === m.key ? '#fff'    : '#888',
            }}>{m.label}</button>
          ))}
        </div>
        <button onClick={toggleView} title={viewMode === 'grid' ? 'Список' : 'Сетка'} style={{
          padding: '5px 10px', borderRadius: 6, border: '1.5px solid #e0e0e0',
          background: '#fff', cursor: 'pointer', fontSize: 16, color: '#555', lineHeight: 1,
        }}>
          {viewMode === 'grid' ? '☰' : '⊞'}
        </button>

        {/* Search */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по названию или артикулу…"
          style={{
            padding: '7px 12px', borderRadius: 8, border: '1.5px solid #e0e0e0',
            fontSize: 13, width: 220, outline: 'none',
          }}
        />
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{ color: '#aaa', fontSize: 14, textAlign: 'center', paddingTop: 60 }}>Загрузка…</div>
      ) : models.length === 0 ? (
        <div style={{ color: '#bbb', fontSize: 14, textAlign: 'center', paddingTop: 60 }}>
          {search ? 'Ничего не найдено' : 'Все товары в наличии 🎉'}
        </div>
      ) : viewMode === 'list' ? (
          <div style={{ border: '1px solid #eee', borderRadius: 8, overflow: 'hidden' }}>
            {models.map(([name, variants]) => {
              const primary = variants[0];
              const img     = primary.images?.[0] || NO_PHOTO;
              const price   = getPrice(primary, priceMode);
              return (
                <div key={name} onClick={() => setDetailProduct(primary)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px',
                    borderBottom: '1px solid #f0f0f0', background: '#fff', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f7f8fa'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                >
                  <img src={img} alt={name}
                    style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
                    onError={e => { e.target.src = NO_PHOTO; }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {primary.fullName || name}
                    </div>
                    {primary.sku && <div style={{ fontSize: 10, color: '#ccc' }}>{primary.sku}</div>}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#c0392b', flexShrink: 0 }}>
                    {price > 0 ? `${price.toLocaleString('ru')} сом` : '—'}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 5,
                    background: '#fce8e8', color: '#c00', flexShrink: 0 }}>
                    Нет
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14, overflowY: 'auto', paddingBottom: 24 }}>
            {models.map(([name, variants]) => {
              const primary = variants[0];
              const img     = primary.images?.[0] || NO_PHOTO;
              const price   = getPrice(primary, priceMode);
              return (
                <div key={name} onClick={() => setDetailProduct(primary)}
                  style={{ border: '1px solid #e8e8e8', borderRadius: 12, overflow: 'hidden',
                    background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,.05)',
                    cursor: 'pointer', transition: 'box-shadow .15s, transform .15s' }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,.12)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,.05)';  e.currentTarget.style.transform = 'none'; }}
                >
                  <div style={{ aspectRatio: '1', overflow: 'hidden', background: '#f8f8f8' }}>
                    <img src={img} alt={name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={e => { e.target.src = NO_PHOTO; }} />
                  </div>
                  <div style={{ padding: '10px 11px' }}>
                    {primary.sku && <div style={{ fontSize: 9, color: '#bbb', marginBottom: 3 }}>{primary.sku}</div>}
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#111', lineHeight: 1.3,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {primary.fullName || name}
                    </div>
                    {variants.length > 1 && <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>{variants.length} вариантов</div>}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#c0392b' }}>
                        {price > 0 ? `${price.toLocaleString('ru')} сом` : '—'}
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 5,
                        background: '#fce8e8', color: '#c00' }}>Нет</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      {detailProduct && (
        <AdminProductModal product={detailProduct} onClose={() => setDetailProduct(null)} />
      )}
    </div>
  );
}
