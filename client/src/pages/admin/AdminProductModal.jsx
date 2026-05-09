import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const NO_PHOTO = '/logos/no-photo.png';

const PRODUCT_STATUS_META = {
  for_sale:       { label: 'В продаже',           color: '#2d7a3a', bg: '#e8f5e9' },
  planned:        { label: 'В плане',             color: '#3b5bdb', bg: '#e8eeff' },
  in_development: { label: 'В разработке',        color: '#7c3aed', bg: '#f3e8ff' },
  improvement:    { label: 'На улучшении',        color: '#c47a00', bg: '#fff3cd' },
  discontinued:   { label: 'Снят с производства', color: '#888',    bg: '#f5f5f5' },
};

function useIsMobile() {
  const [mob, setMob] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const h = () => setMob(window.innerWidth < 640);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return mob;
}

export default function AdminProductModal({ product, onClose }) {
  const { user }  = useAuth();
  const navigate  = useNavigate();
  const isMobile  = useIsMobile();
  const canEdit   = user?.role === 'owner' || user?.role === 'editor';
  const [imgIdx, setImgIdx] = useState(0);

  const images = (product.images || []).filter(Boolean);
  const img    = images[imgIdx] || NO_PHOTO;

  const prices = [
    { label: 'Розничная',     value: product.price },
    { label: 'Оптовая',       value: product.priceWholesale },
    { label: 'Дилерская',     value: product.priceDealer },
    { label: 'Себестоимость', value: product.priceCost },
  ].filter(p => p.value > 0);

  const statusMeta = PRODUCT_STATUS_META[product.productStatus];
  const stockLabel = product.stock > 0 ? `${product.stock} шт.` : (product.inStock ? 'Есть' : 'Нет');

  // Keyboard navigation + Escape
  useEffect(() => {
    const h = e => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft'  && images.length > 1) setImgIdx(i => (i - 1 + images.length) % images.length);
      if (e.key === 'ArrowRight' && images.length > 1) setImgIdx(i => (i + 1) % images.length);
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [images.length, onClose]);

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Browser back → close modal
  useEffect(() => {
    window.history.pushState({ adminModal: true }, '');
    const handlePop = () => onClose();
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, [onClose]);

  return createPortal(
    <>
      <div onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1600 }} />

      <div style={{
        position: 'fixed', inset: 0, zIndex: 1601,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: isMobile ? 0 : 24, pointerEvents: 'none',
      }}>
        <div style={{
          background: '#fff',
          borderRadius: isMobile ? 0 : 16,
          width: '100%', maxWidth: 900,
          maxHeight: isMobile ? '100%' : '92vh',
          height: isMobile ? '100%' : 'auto',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          pointerEvents: 'auto',
        }}>

          {/* Top bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Карточка товара
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {canEdit && (
                <button onClick={() => navigate(`/admin/products/${product._id}/edit`)}
                  style={{ padding: '7px 16px', borderRadius: 8, background: '#111', color: '#fff',
                    border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                  ✏️ Редактировать
                </button>
              )}
              <button onClick={onClose}
                style={{ width: 32, height: 32, borderRadius: 8, background: '#f5f5f5',
                  border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: '32px', textAlign: 'center' }}>
                ✕
              </button>
            </div>
          </div>

          {/* Body */}
          <div style={{
            flex: 1, minHeight: 0, overflow: 'auto',
            overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch',
            display: isMobile ? 'block' : 'grid', gridTemplateColumns: '1fr 1fr',
          }}>

            {/* Image gallery */}
            <div style={{ background: '#f5f5f7', display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: 1, position: 'relative', minHeight: isMobile ? 280 : 380,
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src={img} alt={product.name}
                  style={{ maxWidth: '100%', maxHeight: isMobile ? 280 : 380, objectFit: 'contain', display: 'block', padding: 16 }}
                  onError={e => { e.target.src = NO_PHOTO; }} />
                {images.length > 1 && (
                  <>
                    <button onClick={() => setImgIdx(i => (i - 1 + images.length) % images.length)}
                      style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                        background: 'rgba(0,0,0,.35)', color: '#fff', border: 'none', borderRadius: 8,
                        width: 36, height: 36, fontSize: 20, cursor: 'pointer', lineHeight: '36px', textAlign: 'center' }}>‹</button>
                    <button onClick={() => setImgIdx(i => (i + 1) % images.length)}
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                        background: 'rgba(0,0,0,.35)', color: '#fff', border: 'none', borderRadius: 8,
                        width: 36, height: 36, fontSize: 20, cursor: 'pointer', lineHeight: '36px', textAlign: 'center' }}>›</button>
                    <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
                      fontSize: 11, color: '#999', background: 'rgba(255,255,255,.8)', borderRadius: 10, padding: '2px 8px' }}>
                      {imgIdx + 1} / {images.length}
                    </div>
                  </>
                )}
              </div>
              {images.length > 1 && (
                <div style={{ display: 'flex', gap: 6, padding: '8px 12px', overflowX: 'auto', background: '#eee', flexShrink: 0 }}>
                  {images.map((src, i) => (
                    <img key={i} src={src} alt="" onClick={() => setImgIdx(i)}
                      style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 6, cursor: 'pointer', flexShrink: 0,
                        border: i === imgIdx ? '2px solid #333' : '2px solid transparent',
                        opacity: i === imgIdx ? 1 : 0.6 }} />
                  ))}
                </div>
              )}
            </div>

            {/* Info */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', overscrollBehavior: 'contain',
              WebkitOverflowScrolling: 'touch', display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Badges */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {statusMeta && (
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
                    background: statusMeta.bg, color: statusMeta.color }}>{statusMeta.label}</span>
                )}
                {product.isNew && (
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
                    background: '#fff3cd', color: '#856404' }}>Новинка</span>
                )}
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
                  background: product.inStock ? '#e8f5e9' : '#fce8e8',
                  color: product.inStock ? '#2d7a3a' : '#c00' }}>{stockLabel}</span>
              </div>

              {/* Title */}
              <div>
                <div style={{ fontSize: isMobile ? 16 : 19, fontWeight: 800, color: '#111', lineHeight: 1.25 }}>
                  {product.fullName || product.name}
                </div>
                {product.fullName && product.name !== product.fullName && (
                  <div style={{ fontSize: 13, color: '#888', marginTop: 3 }}>{product.name}</div>
                )}
                {product.sku && <div style={{ fontSize: 12, color: '#bbb', marginTop: 4 }}>SKU: {product.sku}</div>}
              </div>

              {/* Prices */}
              {prices.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                    Цены
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
                    {prices.map(p => (
                      <div key={p.label} style={{ background: '#f8f8f8', borderRadius: 8, padding: '8px 12px' }}>
                        <div style={{ fontSize: 10, color: '#aaa', fontWeight: 600 }}>{p.label}</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: '#111' }}>{p.value.toLocaleString('ru')} сом</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Specs */}
              {product.specs?.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                    Характеристики
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {product.specs.map((s, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, paddingBottom: 5, borderBottom: '1px solid #f5f5f5' }}>
                        <span style={{ color: '#aaa', minWidth: 110, flexShrink: 0 }}>{s.key}</span>
                        <span style={{ color: '#1c1c1c', fontWeight: 600 }}>{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Description */}
              {product.description && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                    Описание
                  </div>
                  <div style={{ fontSize: 13, color: '#555', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                    {product.description}
                  </div>
                </div>
              )}

              {/* Dimensions */}
              {product.dimensions && (
                <div style={{ fontSize: 13, color: '#888' }}>
                  <span style={{ color: '#bbb' }}>Габариты:</span> {product.dimensions}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
