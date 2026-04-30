import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { adminGetProduct } from '../../api/index';
import { useAuth } from '../../context/AuthContext';
import { CATEGORIES } from '../../config/categorySpecs';
import { cloudinaryOpt } from '../../utils/drive';

const PRODUCT_STATUS_META = {
  for_sale:       { label: 'В продаже',           color: '#2d7a3a' },
  planned:        { label: 'В плане',             color: '#3b5bdb' },
  in_development: { label: 'В разработке',        color: '#7c3aed' },
  improvement:    { label: 'На улучшении',        color: '#c47a00' },
  discontinued:   { label: 'Снят с производства', color: '#888'    },
};
const STOCK_STATUS_META = {
  in_stock:     { label: 'В наличии',     color: '#2d7a3a' },
  out_of_stock: { label: 'Нет в наличии', color: '#c0392b' },
  expected:     { label: 'Ожидается',     color: '#c47a00' },
};

function categoryLabel(value) {
  return CATEGORIES.find(c => c.value === value)?.label || value || '—';
}

export default function AdminProductView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = user?.role === 'owner' || user?.role === 'editor';

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [imgIdx,  setImgIdx]  = useState(0);

  useEffect(() => {
    adminGetProduct(id)
      .then(r => setProduct(r.data))
      .catch(() => navigate('/admin/products'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="admin-empty">Загрузка...</div>;
  if (!product) return null;

  const images = product.images || [];
  const ps = PRODUCT_STATUS_META[product.productStatus] || { label: product.productStatus, color: '#888' };
  const ss = STOCK_STATUS_META[product.stockStatus]     || { label: product.stockStatus,   color: '#888' };

  const imgSrc = (url) => url?.includes('cloudinary.com') ? cloudinaryOpt(url, 600) : url;

  const prevImg = () => setImgIdx(i => (i - 1 + images.length) % images.length);
  const nextImg = () => setImgIdx(i => (i + 1) % images.length);

  return (
    <div>
      {/* Header */}
      <div className="admin-page-header" style={{ marginBottom: 24 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/products')}>
          ← Назад
        </button>
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={() => navigate(`/admin/products/${id}/edit`)}>
            Редактировать
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, alignItems: 'start' }}>

        {/* ── Left: Image slider ── */}
        <div>
          <div style={{
            position: 'relative',
            background: '#f7f8fa',
            borderRadius: 16,
            overflow: 'hidden',
            aspectRatio: '1 / 1',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {images.length > 0 ? (
              <>
                <img
                  src={imgSrc(images[imgIdx])}
                  alt={product.name}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
                {images.length > 1 && (
                  <>
                    <button onClick={prevImg} style={arrowBtn('left')}>‹</button>
                    <button onClick={nextImg} style={arrowBtn('right')}>›</button>
                    <div style={{
                      position: 'absolute', bottom: 12, left: 0, right: 0,
                      display: 'flex', justifyContent: 'center', gap: 6,
                    }}>
                      {images.map((_, i) => (
                        <div key={i} onClick={() => setImgIdx(i)} style={{
                          width: 8, height: 8, borderRadius: '50%', cursor: 'pointer',
                          background: i === imgIdx ? '#000' : '#ccc',
                          transition: 'background .2s',
                        }} />
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <div style={{ fontSize: 64 }}>📦</div>
            )}
          </div>

          {/* Thumbnails */}
          {images.length > 1 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              {images.map((url, i) => (
                <div
                  key={i}
                  onClick={() => setImgIdx(i)}
                  style={{
                    width: 60, height: 60, borderRadius: 8, overflow: 'hidden',
                    border: i === imgIdx ? '2px solid #000' : '2px solid transparent',
                    cursor: 'pointer', background: '#f7f8fa', flexShrink: 0,
                  }}
                >
                  <img
                    src={imgSrc(url)}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Right: Info ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Name + badges */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
              {product.brand?.replace('matkasym-', '').toUpperCase()} · {product.set?.toUpperCase() || '—'}
            </div>
            <h2 style={{ fontSize: 26, fontWeight: 800, margin: 0, lineHeight: 1.2 }}>
              {product.fullName || product.name}
            </h2>
            {product.sku && (
              <div style={{ fontSize: 12, color: 'var(--slate)', marginTop: 4 }}>SKU: {product.sku}</div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: ps.color, background: ps.color + '18', padding: '3px 10px', borderRadius: 20 }}>
                {ps.label}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: ss.color, background: ss.color + '18', padding: '3px 10px', borderRadius: 20 }}>
                {ss.label}
              </span>
              {product.isNew && (
                <span style={{ fontSize: 12, fontWeight: 700, color: '#e10523', background: '#fde8e8', padding: '3px 10px', borderRadius: 20 }}>NEW</span>
              )}
            </div>
          </div>

          {/* Category */}
          <Row label="Категория" value={categoryLabel(product.category)} />

          {/* Dimensions */}
          {product.dimensions && <Row label="Габариты" value={product.dimensions} />}

          {/* Description */}
          {product.description && (
            <div>
              <Label>Описание</Label>
              <p style={{ fontSize: 14, color: '#333', lineHeight: 1.6, margin: 0 }}>{product.description}</p>
            </div>
          )}

          {/* Specs */}
          {product.specs?.length > 0 && (
            <div>
              <Label>Характеристики</Label>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <tbody>
                  {product.specs.map((s, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--gray-200)' }}>
                      <td style={{ padding: '6px 0', color: 'var(--slate)', width: '50%' }}>{s.key}</td>
                      <td style={{ padding: '6px 0', fontWeight: 600 }}>{s.value}{s.unit ? ` ${s.unit}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Prices */}
          <div>
            <Label>Цены</Label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              <PriceCard label="Розничная" value={product.price} />
              <PriceCard label="Оптовая"   value={product.priceWholesale} />
              <PriceCard label="Дилерская" value={product.priceDealer} />
              <PriceCard label="Себестоимость" value={product.priceCost} />
            </div>
          </div>

          {/* Stock */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div>
              <Label>Остаток на складе</Label>
              <span style={{
                fontSize: 28, fontWeight: 800,
                color: product.stock > 10 ? '#2d7a3a' : product.stock > 0 ? '#c47a00' : '#c0392b',
              }}>
                {product.stock ?? 0}
              </span>
              <span style={{ fontSize: 13, color: 'var(--slate)', marginLeft: 4 }}>шт.</span>
            </div>
          </div>

          {canEdit && (
            <button
              className="btn btn-primary"
              onClick={() => navigate(`/admin/products/${id}/edit`)}
              style={{ alignSelf: 'flex-start', marginTop: 8 }}
            >
              Редактировать товар
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Label({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--slate)', marginBottom: 6 }}>{children}</div>;
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: 12, fontSize: 14 }}>
      <span style={{ color: 'var(--slate)', minWidth: 120 }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function PriceCard({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <div style={{ background: '#f7f8fa', borderRadius: 8, padding: '10px 14px' }}>
      <div style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 600, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800 }}>{Number(value).toLocaleString('ru')} сом</div>
    </div>
  );
}

function arrowBtn(side) {
  return {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
    [side]: 12,
    background: 'rgba(255,255,255,.85)', border: 'none', borderRadius: '50%',
    width: 36, height: 36, fontSize: 22, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,.15)', zIndex: 2,
  };
}
