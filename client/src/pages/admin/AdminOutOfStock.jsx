import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminGetProducts } from '../../api';
import AdminProductModal from './AdminProductModal';
import AdminProductCard from './AdminProductCard';
import AdminPdfButton from './AdminPdfButton';
import { useScrollRestore } from '../../hooks/useScrollRestore';
import { useLazyItems } from '../../hooks/useLazyItems';

const PRICE_MODES = [
  { key: 'retail',    label: 'Розн.' },
  { key: 'wholesale', label: 'Опт.'  },
  { key: 'dealer',    label: 'Дил.'  },
];

export default function AdminOutOfStock() {
  const navigate = useNavigate();
  const [products,      setProducts]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [priceMode,     setPriceMode]     = useState('retail');
  const [search,        setSearch]        = useState('');
  const [viewMode,      setViewMode]      = useState(() => localStorage.getItem('adminCatalogView') || 'grid');
  const [detailProduct, setDetailProduct] = useState(null);

  useScrollRestore(loading);

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

  const grouped = {};
  filtered.forEach(p => {
    const key = p.name || p.fullName || p._id;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(p);
  });
  const models = Object.entries(grouped);

  const { visible, sentinelRef, hasMore } = useLazyItems(models, 30);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '0 0 18px 0', borderBottom: '1px solid #eee', marginBottom: 20,
      }}>
        <button onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: '0 4px', color: '#888' }}>←</button>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#c0392b' }}>⚠️ Нет в наличии</div>
          <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>
            {loading ? '…' : `${products.length} товаров`}
          </div>
        </div>

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
        <AdminPdfButton products={filtered} label="Нет в наличии" />
        <button onClick={toggleView} title={viewMode === 'grid' ? 'Список' : 'Сетка'} style={{
          padding: '5px 10px', borderRadius: 6, border: '1.5px solid #e0e0e0',
          background: '#fff', cursor: 'pointer', fontSize: 16, color: '#555', lineHeight: 1,
        }}>
          {viewMode === 'grid' ? '☰' : '⊞'}
        </button>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по названию или артикулу…"
          style={{ padding: '7px 12px', borderRadius: 8, border: '1.5px solid #e0e0e0', fontSize: 13, width: 220, outline: 'none' }}
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
          {visible.map(([name, variants]) => (
            <AdminProductCard key={name} product={variants[0]} priceMode={priceMode}
              accent="#c0392b" onOpen={setDetailProduct} viewMode="list" />
          ))}
          {hasMore && <div ref={sentinelRef} style={{ height: 20 }} />}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14, paddingBottom: 24 }}>
          {visible.map(([name, variants]) => (
            <AdminProductCard key={name} product={variants[0]} priceMode={priceMode}
              accent="#c0392b" onOpen={setDetailProduct} viewMode="grid" />
          ))}
          {hasMore && <div ref={sentinelRef} style={{ height: 20, gridColumn: '1 / -1' }} />}
        </div>
      )}

      {detailProduct && (
        <AdminProductModal product={detailProduct} onClose={() => setDetailProduct(null)} />
      )}
    </div>
  );
}
