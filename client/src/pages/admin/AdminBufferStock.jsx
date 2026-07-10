import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminGetBufferStock } from '../../api';
import { cloudinaryOpt } from '../../utils/drive';
import AdminProductModal from './AdminProductModal';
import { useScrollRestore } from '../../hooks/useScrollRestore';
import { useLazyItems } from '../../hooks/useLazyItems';

const NO_PHOTO = '/logos/no-photo.png';
const ACCENT   = '#c0392b';
const COLS     = '52px minmax(0, 1fr) 110px 84px 84px 96px';

function useIsMobile() {
  const [mob, setMob] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const h = () => setMob(window.innerWidth < 640);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return mob;
}

const ZONE_COLOR = { ikea: '#0d9488', home: '#3b5bdb', shaar: '#c47a00' };

function ZoneChip({ zone, label }) {
  if (!zone) return null;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
      background: `${ZONE_COLOR[zone]}15`, color: ZONE_COLOR[zone], whiteSpace: 'nowrap',
    }}>{label}</span>
  );
}

export default function AdminBufferStock() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [products, setProducts] = useState([]);
  const [zones,    setZones]    = useState([]);
  const [counts,   setCounts]   = useState({});
  const [total,    setTotal]    = useState(0);
  const [ownZone,  setOwnZone]  = useState('');
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
        setTotal(r.data.totalCount || 0);
        setOwnZone(r.data.ownZone || '');
      })
      .finally(() => setLoading(false));
  }, [zone]);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? products.filter(p => (p.fullName || p.name || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q))
    : products;

  const { visible, sentinelRef, hasMore } = useLazyItems(filtered, 40);
  const zoneLabel = z => zones.find(x => x.key === z)?.label || '';

  const tabStyle = active => ({
    padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
    fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap',
    background: active ? ACCENT : '#f0f0f0',
    color:      active ? '#fff' : '#888',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '0 0 16px 0', borderBottom: '1px solid #eee', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => navigate(-1)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: '0 4px', color: '#888' }}>←</button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: isMobile ? 16 : 18, fontWeight: 800, color: ACCENT }}>📉 Ниже буферного запаса</div>
            <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>
              {loading ? '…' : `${filtered.length} товаров`}
            </div>
          </div>
        </div>

        {/* Зоны видны всем — каждый может посмотреть чужие товары */}
        <div style={{ display: 'flex', gap: 6, marginTop: 12, overflowX: 'auto', paddingBottom: 2, WebkitOverflowScrolling: 'touch' }}>
          <button onClick={() => setZone('')} style={tabStyle(zone === '')}>Все · {total}</button>
          {zones.map(z => (
            <button key={z.key} onClick={() => setZone(z.key)} style={tabStyle(zone === z.key)}>
              {z.label} · {counts[z.key] ?? 0}{z.key === ownZone ? ' ★' : ''}
            </button>
          ))}
        </div>

        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по названию или артикулу…"
          style={{
            marginTop: 10, padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e0e0e0',
            fontSize: 13, width: '100%', maxWidth: isMobile ? '100%' : 280, outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      {loading ? (
        <div style={{ color: '#aaa', fontSize: 14, textAlign: 'center', paddingTop: 60 }}>Загрузка…</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: '#bbb', fontSize: 14, textAlign: 'center', paddingTop: 60 }}>
          {search ? 'Ничего не найдено' : 'Все остатки выше буферного запаса 🎉'}
        </div>
      ) : isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 24 }}>
          {visible.map(p => (
            <div key={p._id} onClick={() => setDetailProduct(p)} style={{
              display: 'flex', gap: 10, padding: 10, background: '#fff',
              border: '1px solid #eee', borderRadius: 10, cursor: 'pointer',
            }}>
              <img src={cloudinaryOpt(p.images?.[0] || NO_PHOTO, 120)} alt=""
                onError={e => { e.target.src = NO_PHOTO; }}
                style={{ width: 56, height: 56, flexShrink: 0, objectFit: 'contain', borderRadius: 6, background: '#fafafa' }} />

              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <ZoneChip zone={p.zone} label={zoneLabel(p.zone)} />
                  <span style={{ fontSize: 11, color: '#bbb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.sku || '—'}
                  </span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#222', lineHeight: 1.3 }}>{p.fullName || p.name}</div>

                <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 12 }}>
                  <span style={{ color: '#888' }}>Остаток <b style={{ color: p.stock > 0 ? '#222' : ACCENT }}>{p.stock}</b></span>
                  <span style={{ color: '#888' }}>Буфер <b style={{ color: '#555' }}>{p.bufferStock}</b></span>
                  <span style={{ color: ACCENT, fontWeight: 800, marginLeft: 'auto' }}>−{p.deficit}</span>
                </div>
              </div>
            </div>
          ))}
          {hasMore && <div ref={sentinelRef} style={{ height: 20 }} />}
        </div>
      ) : (
        <div style={{ border: '1px solid #eee', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: COLS, gap: 10, alignItems: 'center',
            padding: '10px 14px', background: '#fafafa', borderBottom: '1px solid #eee',
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
              display: 'grid', gridTemplateColumns: COLS, gap: 10, alignItems: 'center',
              padding: '8px 14px', borderBottom: '1px solid #f3f3f3', cursor: 'pointer', background: '#fff',
            }}>
              <img src={cloudinaryOpt(p.images?.[0] || NO_PHOTO, 80)} alt=""
                onError={e => { e.target.src = NO_PHOTO; }}
                style={{ width: 44, height: 44, objectFit: 'contain', borderRadius: 6, background: '#fafafa' }} />
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#222', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.fullName || p.name}
                </span>
                <ZoneChip zone={p.zone} label={zoneLabel(p.zone)} />
              </span>
              <span style={{ fontSize: 12, color: '#999', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.sku || '—'}</span>
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
