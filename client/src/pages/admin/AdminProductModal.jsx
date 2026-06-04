import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { adminDeleteProduct, adminCreateProduct } from '../../api';

const NO_PHOTO = '/logos/no-photo.png';

const PRODUCT_STATUS_META = {
  for_sale:       { label: 'В продаже',           color: '#2d7a3a', bg: '#e8f5e9', icon: '🛒' },
  planned:        { label: 'В плане',             color: '#3b5bdb', bg: '#e8eeff', icon: '📋' },
  in_development: { label: 'В разработке',        color: '#7c3aed', bg: '#f3e8ff', icon: '🔧' },
  improvement:    { label: 'На улучшении',        color: '#c47a00', bg: '#fff3cd', icon: '✏️' },
  on_pause:       { label: 'На паузе',            color: '#6b7280', bg: '#f3f4f6', icon: '⏸' },
  discontinued:   { label: 'Снят',                color: '#888',    bg: '#f5f5f5', icon: '🚫' },
  nelikvid:       { label: 'Неликвид',            color: '#78716c', bg: '#f5f5f4', icon: '🗑' },
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

export default function AdminProductModal({ product, onClose, onDeleted }) {
  const { user }    = useAuth();
  const navigate    = useNavigate();
  const isMobile    = useIsMobile();
  const canEdit     = user?.role === 'owner' || user?.role === 'editor';
  const canDelete   = user?.role === 'owner';
  const [imgIdx,    setImgIdx]    = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [deleting,   setDeleting]   = useState(false);
  const [copying,    setCopying]    = useState(false);

  const handleCopy = async () => {
    setCopying(true);
    try {
      const copy = {
        name:             (product.name     || '') + ' - копия',
        fullName:         (product.fullName || '') + ' - копия',
        sku:              '',
        brand:            product.brand            || '',
        set:              product.set              || '',
        setLevel:         product.setLevel         || '',
        color:            product.color            || '',
        category:         product.category         || 'other',
        isSupplied:       product.isSupplied       || false,
        supplier:         product.supplier         || { company: '', contactName: '', sku: '' },
        inTransit:        product.inTransit        || false,
        priceCost:        product.priceCost        || 0,
        priceWholesale:   product.priceWholesale   || 0,
        priceDealer:      product.priceDealer      || 0,
        price:            product.price            || 0,
        dimensions:       product.dimensions       || '',
        specs:            product.specs            || [],
        description:      product.description      || '',
        tags:             product.tags             || [],
        images:           product.images           || [],
        driveImages:      product.driveImages      || [],
        productStatus:    product.productStatus    || 'for_sale',
        developmentStage: product.developmentStage || '',
        developmentTZ:    product.developmentTZ    || {},
        improvementTZ:    product.improvementTZ    || {},
        stock:       0,
        inStock:     false,
        stockStatus: 'out_of_stock',
        isNew:       false,
      };
      const res = await adminCreateProduct(copy);
      document.body.style.overflow = '';
      navigate(`/admin/products/${res.data._id}/edit`, { replace: true });
    } catch {
      setCopying(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await adminDeleteProduct(product._id);
      document.body.style.overflow = '';
      if (onDeleted) onDeleted(product._id);
      else onClose();
    } catch {
      setDeleting(false);
      setConfirming(false);
    }
  };

  const images = (product.images || []).filter(Boolean);
  const img    = images[imgIdx] || NO_PHOTO;

  const downloadImage = async (url, index) => {
    const orig = url.includes('cloudinary.com')
      ? url.replace(/\/upload\/[^/]+\//, '/upload/')
      : url;
    const name = `${product.name || 'photo'}_${index + 1}.jpg`.replace(/[\\/:*?"<>|]/g, '_');
    try {
      const blob = await fetch(orig).then(r => r.blob());
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(orig, '_blank');
    }
  };

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
          borderRadius: isMobile ? 0 : 18,
          width: '100%', maxWidth: 900,
          maxHeight: isMobile ? '100%' : '92vh',
          height: isMobile ? '100%' : 'auto',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          pointerEvents: 'auto',
          fontFamily: 'var(--admin-font)',
        }}>

          {/* Top bar */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: isMobile ? '10px 12px' : '12px 16px',
            borderBottom: '1px solid var(--admin-line)',
            flexShrink: 0,
            gap: 8,
          }}>
            {/* Left side - back button on mobile, title on desktop */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              {isMobile && (
                <button onClick={onClose}
                  style={{
                    width: 36, height: 36, borderRadius: 10, background: '#f5f5f5',
                    border: 'none', cursor: 'pointer', fontSize: 20,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                  ←
                </button>
              )}
              <div style={{
                fontSize: isMobile ? 14 : 12,
                fontWeight: 600,
                color: isMobile ? '#333' : '#aaa',
                textTransform: isMobile ? 'none' : 'uppercase',
                letterSpacing: isMobile ? 0 : 0.5,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {isMobile ? (product.name || 'Товар') : 'Карточка товара'}
              </div>
            </div>

            {/* Right side - action buttons */}
            <div style={{ display: 'flex', gap: isMobile ? 6 : 8, alignItems: 'center', flexShrink: 0 }}>
              {canDelete && (
                <button onClick={() => setConfirming(true)}
                  style={{
                    padding: isMobile ? '8px 10px' : '7px 14px',
                    borderRadius: 8,
                    background: '#fff0f0',
                    color: '#c00',
                    border: '1.5px solid #f5c6cb',
                    fontWeight: 700,
                    fontSize: isMobile ? 12 : 13,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}>
                  {isMobile ? '🗑' : '🗑 Удалить'}
                </button>
              )}
              {canEdit && !isMobile && (
                <button onClick={handleCopy} disabled={copying}
                  style={{ padding: '7px 14px', borderRadius: 8, background: '#f0f7ff', color: '#3463A3',
                    border: '1.5px solid #b8d0f0', fontWeight: 700, fontSize: 13,
                    cursor: copying ? 'not-allowed' : 'pointer', opacity: copying ? 0.7 : 1 }}>
                  {copying ? '⏳…' : '📋 Копировать'}
                </button>
              )}
              {canEdit && (
                <button onClick={() => { document.body.style.overflow = ''; navigate(`/admin/products/${product._id}/edit`, { replace: true }); }}
                  style={{
                    padding: isMobile ? '8px 12px' : '7px 16px',
                    borderRadius: 8,
                    background: '#111',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: isMobile ? 12 : 13,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}>
                  {isMobile ? '✏️' : '✏️ Редактировать'}
                </button>
              )}
              {!isMobile && (
                <button onClick={onClose}
                  style={{ width: 32, height: 32, borderRadius: 8, background: '#f5f5f5',
                    border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: '32px', textAlign: 'center' }}>
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Body */}
          <div style={{
            flex: 1, minHeight: 0, overflow: 'auto',
            overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch',
            display: isMobile ? 'block' : 'grid', gridTemplateColumns: '1fr 1fr',
          }}>

            {/* Image gallery */}
            <div style={{ background: '#f7f6f3', display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: 1, position: 'relative', minHeight: isMobile ? 280 : 380,
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src={img} alt={product.name}
                  style={{ maxWidth: '100%', maxHeight: isMobile ? 280 : 380, objectFit: 'contain', display: 'block', padding: 16 }}
                  onError={e => { e.target.src = NO_PHOTO; }} />

                {/* Download icon — top-right corner */}
                {img !== NO_PHOTO && (
                  <button
                    onClick={() => downloadImage(img, imgIdx)}
                    title="Скачать фото"
                    style={{
                      position: 'absolute', top: 8, right: 8,
                      width: 32, height: 32, borderRadius: 8,
                      background: 'rgba(0,0,0,0.45)', border: 'none',
                      color: '#fff', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 15, lineHeight: 1, backdropFilter: 'blur(2px)',
                    }}
                  >
                    ↓
                  </button>
                )}

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
                <div style={{ display: 'flex', gap: 6, padding: '8px 12px', overflowX: 'auto', background: '#efece6', flexShrink: 0 }}>
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
                    background: statusMeta.bg, color: statusMeta.color }}>{statusMeta.icon} {statusMeta.label}</span>
                )}
                {product.isNew && (
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
                    background: '#fff3cd', color: '#856404' }}>Новинка</span>
                )}
                {product.inTransit && (
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
                    background: '#eef6ff', color: '#1d4ed8' }}>🚚 В пути</span>
                )}
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
                  background: product.inStock ? '#e8f5e9' : '#fce8e8',
                  color: product.inStock ? '#2d7a3a' : '#c00' }}>{stockLabel}</span>
              </div>

              {/* Status note (pause reason, etc.) */}
              {product.pauseNote && (
                <div style={{
                  background: '#f9fafb', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '10px 14px',
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                    ⏸ Причина паузы
                  </div>
                  <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
                    {product.pauseNote}
                  </div>
                </div>
              )}

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

              {/* Specs + Dimensions combined — dimensions first, then specs */}
              {(() => {
                // Build dimensions row
                let dimRow = null;
                if (product.dimensions) {
                  const raw = product.dimensions.trim();
                  const unitMatch = raw.match(/[а-яёa-z]+\.?$/i);
                  const unit = unitMatch ? unitMatch[0] : 'см';
                  const numStr = raw.replace(/[а-яёa-z]+\.?$/i, '').trim();
                  const parts = numStr.split(/[×x*]/i).map(s => s.trim()).filter(Boolean);
                  const dimValue = parts.length === 3
                    ? <span>
                        {[['Д', parts[0]], ['Ш', parts[1]], ['В', parts[2]]].map(([lbl, val], i) => (
                          <span key={lbl} style={{ marginRight: i < 2 ? 12 : 0 }}>
                            <span style={{ color: '#bbb', fontSize: 11, marginRight: 2 }}>{lbl}</span>
                            <span style={{ fontWeight: 700 }}>{val}</span>
                          </span>
                        ))}
                        <span style={{ color: '#aaa', fontSize: 11, marginLeft: 4 }}>{unit}</span>
                      </span>
                    : <span style={{ fontWeight: 700 }}>{raw}</span>;
                  dimRow = { key: 'Габариты', valueNode: dimValue };
                }

                // Build filtered spec rows
                const seen = new Set();
                // Priority order for common spec keys (normalized lowercase)
                const SPEC_PRIORITY = [
                  'конструкция', 'тип конструкции',
                  'материал', 'материал корпуса',
                  'покрытие', 'цвет',
                  'размещение',
                  'макс. нагрузка', 'максимальная нагрузка', 'нагрузка',
                  'вес товара', 'вес',
                  'вес товара в упаковке', 'вес в упаковке',
                  'количество', 'кол-во',
                ];

                const specPriority = k => {
                  const idx = SPEC_PRIORITY.indexOf(k.trim().toLowerCase());
                  return idx === -1 ? SPEC_PRIORITY.length : idx;
                };

                const visibleSpecs = (product.specs || [])
                  .filter(s => {
                    if (!s.value || /^габарит/i.test(s.key)) return false;
                    const norm = s.key.trim().toLowerCase();
                    if (seen.has(norm)) return false;
                    seen.add(norm);
                    return true;
                  })
                  .sort((a, b) => {
                    const pa = specPriority(a.key);
                    const pb = specPriority(b.key);
                    if (pa !== pb) return pa - pb;
                    return a.key.localeCompare(b.key, 'ru');
                  });

                const hasContent = dimRow || visibleSpecs.length > 0;
                if (!hasContent) return null;

                const capFirst = str => str ? str.charAt(0).toUpperCase() + str.slice(1) : str;

                const guessUnit = (key, value) => {
                  const k = key.trim().toLowerCase();
                  const v = String(value || '');
                  // don't add unit if value already contains letters (unit embedded)
                  if (/[а-яёa-z]/i.test(v)) return '';
                  if (/вес/.test(k))      return 'кг';
                  if (/нагрузк/.test(k))  return 'кг';
                  if (/высот/.test(k) || /ширин/.test(k) || /длин/.test(k) || /глубин/.test(k)) return 'см';
                  if (/количеств|кол-?во/.test(k)) return 'шт';
                  return '';
                };

                return (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                      Характеристики
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {dimRow && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '7px 0', borderBottom: '1px solid #f5f5f5' }}>
                          <span style={{ color: '#aaa', minWidth: 130, flexShrink: 0 }}>{dimRow.key}</span>
                          <span style={{ color: '#1c1c1c' }}>{dimRow.valueNode}</span>
                        </div>
                      )}
                      {visibleSpecs.map((s, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '7px 0', borderBottom: '1px solid #f5f5f5' }}>
                          <span style={{ color: '#aaa', minWidth: 130, flexShrink: 0 }}>{capFirst(s.key)}</span>
                          <span style={{ color: '#1c1c1c', fontWeight: 600 }}>
                            {s.value}
                            {(() => { const u = s.unit || guessUnit(s.key, s.value); return u ? <span style={{ color: '#aaa', fontSize: 11, marginLeft: 3 }}>{u}</span> : null; })()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

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

              {/* Supplier — привозной товар (только для owner и navigator) */}
              {product.isSupplied && (user?.role === 'owner' || user?.role === 'navigator') && (
                <div style={{ background: '#eef6ff', border: '1.5px solid #93c5fd', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                    📦 Привозной товар (поставщик)
                  </div>
                  {[
                    ['Компания',           product.supplier?.company],
                    ['Контактное лицо',    product.supplier?.contactName],
                    ['Артикул поставщика', product.supplier?.sku],
                  ].filter(([, v]) => v).map(([label, value]) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '5px 0' }}>
                      <span style={{ color: '#7aa5d8', minWidth: 130, flexShrink: 0 }}>{label}</span>
                      <span style={{ color: '#1c1c1c', fontWeight: 600 }}>{value}</span>
                    </div>
                  ))}
                  {!product.supplier?.company && !product.supplier?.contactName && !product.supplier?.sku && (
                    <span style={{ fontSize: 13, color: '#7aa5d8' }}>Данные поставщика не заполнены</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* Delete confirmation dialog */}
      {confirming && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1700 }} />
          <div style={{
            position: 'fixed', inset: 0, zIndex: 1701,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}>
            <div style={{ background: '#fff', borderRadius: 16, padding: '28px 28px 24px', maxWidth: 380, width: '100%', boxShadow: '0 8px 40px rgba(0,0,0,.18)' }}>
              <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 12 }}>⚠️</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#111', textAlign: 'center', marginBottom: 8 }}>
                Удалить товар?
              </div>
              <div style={{ fontSize: 13, color: '#666', textAlign: 'center', lineHeight: 1.6, marginBottom: 24 }}>
                «{product.fullName || product.name}» будет удалён из всех каталогов. Это действие нельзя отменить.
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setConfirming(false)} disabled={deleting}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '1.5px solid #e0e0e0', background: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer', color: '#444' }}>
                  Отмена
                </button>
                <button onClick={handleDelete} disabled={deleting}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: '#c00', color: '#fff', fontWeight: 700, fontSize: 14, cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.7 : 1 }}>
                  {deleting ? 'Удаление…' : 'Да, удалить'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>,
    document.body
  );
}
