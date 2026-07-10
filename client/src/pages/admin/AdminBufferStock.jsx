import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminGetBufferStock } from '../../api';
import { cloudinaryOpt } from '../../utils/drive';
import AdminProductModal from './AdminProductModal';
import { useScrollRestore } from '../../hooks/useScrollRestore';
import { useLazyItems } from '../../hooks/useLazyItems';

const NO_PHOTO = '/logos/no-photo.png';
const ACCENT   = '#c0392b';

export default function AdminBufferStock() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [zones,    setZones]    = useState([]);
  const [counts,   setCounts]   = useState({});
  const [isAdmin,  setIsAdmin]  = useState(false);
  const [zone,     setZone]     = useState('');
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [detailProduct, setDetailProduct] = useState(null);

  useScrollRestore(loading);

  useEffect(() => {
    setLoading(true);
    adminGetBufferStock(zone)
      .then(r => {
        setProducts(r.data.products || []);
        setZones(r.data.zones || []);
        setCounts(r.data.counts || {});
        setIsAdmin(!!r.data.isAdmin);
      })
      .finally(() => setLoading(false));
  }, [zone]);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? products.filter(p => (p.fullName || p.name || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q))
    : products;

  const { visible, sentinelRef, hasMore } = useLazyItems(filtered, 40);

  const tabStyle = active => ({
    padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
    fontWeight: 700, fontSize: 12,
    background: active ? ACCENT : '#f0f0f0',
    color:      active ? '#fff' : '#888',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '0 0 18px 0', borderBottom: '1px solid #eee', marginBottom: 20,
      }}>
        <button onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: '0 4px', color: '#888' }}>←</button>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: ACCENT }}>📉 Ниже буферного запаса</div>
          <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>
            {loading ? '…' : `${products.length} товаров`}
          </div>
        </div>

        {isAdmin && (
          <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', flexWrap: 'wrap' }}>
            <button onClick={() => setZone('')} style={tabStyle(zone === '')}>Все</button>
            {zones.map(z => (
              <button key={z.key} onClick={() => setZone(z.key)} style={tabStyle(zone === z.key)}>
                {z.label}{counts[z.key] != null ? ` · ${counts[z.key]}` : ''}
              </button>
            ))}
          </div>
        )}

        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по названию или артикулу…"
          style={{ marginLeft: isAdmin ? 0 : 'auto', padding: '7px 12px', borderRadius: 8, border: '1.5px solid #e0e0e0', fontSize: 13, width: 220, outline: 'none' }}
        />
      </div>

      {loading ? (
        <div style={{ color: '#aaa', fontSize: 14, textAlign: 'center', paddingTop: 60 }}>Загрузка…</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: '#bbb', fontSize: 14, textAlign: 'center', paddingTop: 60 }}>
          {search ? 'Ничего не найдено' : 'Все остатки выше буферного запаса 🎉'}
        </div>
      ) : (
        <div style={{ border: '1px solid #eee', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '52px 1fr 110px 80px 80px 90px',
            gap: 10, alignItems: 'center', padding: '10px 14px',
            background: '#fafafa', borderBottom: '1px solid #eee',
            fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: .3,
          }}>
            <span />
            <span>Товар</span>
            <span>Артикул</span>
            <span style={{ textAlign: 'right' }}>Остаток</span>
            <span style={{ textAlign: 'right' }}>Буфер</span>
            <span style={{ textAlign: 'right' }}>Не хватает</span>
          </div>

          {visible.map(p => (
            <div key={p._id} onClick={() => setDetailProduct(p)} style={{
              display: 'grid', gridTemplateColumns: '52px 1fr 110px 80px 80px 90px',
              gap: 10, alignItems: 'center', padding: '8px 14px',
              borderBottom: '1px solid #f3f3f3', cursor: 'pointer', background: '#fff',
            }}>
              <img src={cloudinaryOpt(p.images?.[0] || NO_PHOTO, 80)} alt=""
                onError={e => { e.target.src = NO_PHOTO; }}
                style={{ width: 44, height: 44, objectFit: 'contain', borderRadius: 6, background: '#fafafa' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#222' }}>{p.fullName || p.name}</span>
              <span style={{ fontSize: 12, color: '#999' }}>{p.sku || '—'}</span>
              <span style={{ fontSize: 13, fontWeight: 700, textAlign: 'right', color: p.stock > 0 ? '#222' : ACCENT }}>{p.stock}</span>
              <span style={{ fontSize: 13, textAlign: 'right', color: '#666' }}>{p.bufferStock}</span>
              <span style={{ fontSize: 13, fontWeight: 800, textAlign: 'right', color: ACCENT }}>−{p.deficit}</span>
            </div>
          ))}
          {hasMore && <div ref={sentinelRef} style={{ height: 20 }} />}
        </div>
      )}

      {detailProduct && (
        <AdminProductModal
          product={detailProduct}
          onClose={() => setDetailProduct(null)}
          onDeleted={id => { setProducts(p => p.filter(x => x._id !== id)); setDetailProduct(null); }}
        />
      )}
    </div>
  );
}
