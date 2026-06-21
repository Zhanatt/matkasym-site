import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { adminDeleteProduct, adminCreateProduct, adminReceiveProduct, adminAddStock } from '../../api';

const NO_PHOTO = '/logos/no-photo.png';

const PRODUCT_STATUS_META = {
  for_sale:       { label: 'В продаже',           color: '#2d7a3a', bg: '#e8f5e9', icon: '🛒' },
  planned:        { label: 'В плане',             color: '#3b5bdb', bg: '#e8eeff', icon: '📋' },
  in_development: { label: 'В разработке',        color: '#7c3aed', bg: '#f3e8ff', icon: '🔧' },
  improvement:    { label: 'На улучшении',        color: '#c47a00', bg: '#fff3cd', icon: '✏️' },
  on_pause:       { label: 'На паузе',            color: '#6b7280', bg: '#f3f4f6', icon: '⏸' },
  discontinued:   { label: 'Снят',                color: '#888',    bg: '#f5f5f5', icon: '🚫' },
  liquidation:    { label: 'Ликвидация',          color: '#92400e', bg: '#fef3c7', icon: '🏷️' },
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

export default function AdminProductModal({ product, onClose, onDeleted, onSaved, extraActions }) {
  const { user }    = useAuth();
  const navigate    = useNavigate();
  const isMobile    = useIsMobile();
  const canEdit     = user?.role === 'owner' || user?.role === 'editor';
  const canDelete   = user?.role === 'owner';
  const canReceive  = ['owner', 'editor', 'warehouse'].includes(user?.role);
  const [imgIdx,    setImgIdx]    = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [deleting,   setDeleting]   = useState(false);
  const [copying,    setCopying]    = useState(false);
  const [receiving,  setReceiving]  = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [receiveQty, setReceiveQty] = useState(0);
  const [receiveAlert, setReceiveAlert] = useState('ok');
  const [receiveComment, setReceiveComment] = useState('');
  const [showAddStockModal, setShowAddStockModal] = useState(false);
  const [addStockQty, setAddStockQty] = useState(1);
  const [addStockComment, setAddStockComment] = useState('');
  const [addingStock, setAddingStock] = useState(false);
  const [localProduct, setLocalProduct] = useState(product);

  const needsReceive = localProduct.inTransit || localProduct.pendingReceive;
  const expectedQty = localProduct.inTransitQty || localProduct.pendingReceiveQty || 0;

  const openReceiveModal = () => {
    setReceiveQty(expectedQty || 1);
    setReceiveAlert('ok');
    setReceiveComment('');
    setShowReceiveModal(true);
  };

  const openAddStockModal = () => {
    setAddStockQty(1);
    setAddStockComment('');
    setShowAddStockModal(true);
  };

  const handleAddStock = async () => {
    if (addStockQty <= 0) return;
    setAddingStock(true);
    try {
      const res = await adminAddStock(localProduct._id, {
        qty: addStockQty,
        comment: addStockComment,
      });
      setLocalProduct(res.data.product);
      setShowAddStockModal(false);
      alert(`✓ Добавлено ${addStockQty} шт.`);
    } catch (e) {
      alert('Ошибка: ' + (e.response?.data?.error || e.message));
    } finally {
      setAddingStock(false);
    }
  };

  const handleReceive = async () => {
    if (!needsReceive) return;
    setReceiving(true);
    try {
      const res = await adminReceiveProduct(localProduct._id, {
        receivedQty: receiveQty,
        alertType: receiveAlert,
        comment: receiveComment,
      });
      setLocalProduct(res.data.product);
      setShowReceiveModal(false);
      alert(`✓ Принято ${receiveQty} шт. на склад`);
    } catch (e) {
      alert('Ошибка: ' + (e.response?.data?.error || e.message));
    } finally {
      setReceiving(false);
    }
  };

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
  const hasColorOnly = product.color && images.length === 0;

  // Swipe handlers
  const minSwipeDistance = 40;
  const touchStartRef = { current: null };
  const onTouchStart = (e) => {
    touchStartRef.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e) => {
    if (touchStartRef.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const distance = touchStartRef.current - touchEndX;
    touchStartRef.current = null;
    if (Math.abs(distance) < minSwipeDistance) return;
    if (distance > 0) {
      // swipe left → next
      setImgIdx(i => (i + 1) % images.length);
    } else {
      // swipe right → prev
      setImgIdx(i => (i - 1 + images.length) % images.length);
    }
  };

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
            <div style={{ background: hasColorOnly ? product.color : '#f7f6f3', display: 'flex', flexDirection: 'column' }}>
              <div
                onTouchStart={images.length > 1 ? onTouchStart : undefined}
                onTouchEnd={images.length > 1 ? onTouchEnd : undefined}
                style={{ flex: 1, position: 'relative', minHeight: isMobile ? 280 : 380,
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {hasColorOnly ? (
                  <div style={{
                    width: '100%', height: isMobile ? 280 : 380,
                    background: product.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexDirection: 'column', gap: 8,
                  }}>
                    <div style={{
                      fontSize: 14, fontWeight: 700, color: '#fff',
                      textShadow: '0 1px 3px rgba(0,0,0,0.3)',
                      background: 'rgba(0,0,0,0.2)', padding: '6px 14px', borderRadius: 8,
                    }}>
                      {product.color}
                    </div>
                  </div>
                ) : (
                  <img src={img} alt={product.name}
                    style={{ maxWidth: '100%', maxHeight: isMobile ? 280 : 380, objectFit: 'contain', display: 'block', padding: 16 }}
                    onError={e => { e.target.src = NO_PHOTO; }} />
                )}

                {/* Download icon — top-right corner */}
                {!hasColorOnly && img !== NO_PHOTO && (
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
                {localProduct.inTransit && (
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
                    background: '#eef6ff', color: '#1d4ed8' }}>
                    🚚 В пути {localProduct.inTransitQty > 0 && `(${localProduct.inTransitQty} шт)`}
                  </span>
                )}
                {localProduct.pendingReceive && !localProduct.inTransit && (
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
                    background: '#fef3c7', color: '#92400e' }}>
                    📋 Ожидает приёмки {localProduct.pendingReceiveQty > 0 && `(${localProduct.pendingReceiveQty} шт)`}
                  </span>
                )}
                {canReceive && needsReceive && (
                  <button
                    onClick={openReceiveModal}
                    style={{
                      fontSize: 11, fontWeight: 700, padding: '3px 12px', borderRadius: 20,
                      background: '#2d7a3a', color: '#fff',
                      border: 'none', cursor: 'pointer',
                    }}>
                    {receiving ? '⏳...' : '📦 Принять'}
                  </button>
                )}
                {canReceive && !needsReceive && (
                  <button
                    onClick={openAddStockModal}
                    style={{
                      fontSize: 11, fontWeight: 700, padding: '3px 12px', borderRadius: 20,
                      background: '#3b82f6', color: '#fff',
                      border: 'none', cursor: 'pointer',
                    }}>
                    ➕ Добавить
                  </button>
                )}
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
                  background: localProduct.isKit && localProduct.kitType === 'independent' ? '#f5f3ff' : (localProduct.inStock ? '#e8f5e9' : '#fce8e8'),
                  color: localProduct.isKit && localProduct.kitType === 'independent' ? '#7c3aed' : (localProduct.inStock ? '#2d7a3a' : '#c00') }}>
                  {localProduct.isKit && localProduct.kitType === 'independent' ? 'Комплект' : (localProduct.stock > 0 ? `${localProduct.stock} шт.` : (localProduct.inStock ? 'Есть' : 'Нет'))}
                </span>
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

              {/* Kit parts — состав комплекта */}
              {product.isKit && product.kitParts?.length > 0 && (() => {
                const missingParts = product.kitParts.filter(part => {
                  const p = part.product;
                  return p && (p.stock || 0) < (part.qty || 1);
                });
                const hasMissing = missingParts.length > 0;
                return (
                <div style={{
                  background: hasMissing ? '#fef2f2' : '#f0fdf4',
                  border: `1.5px solid ${hasMissing ? '#fecaca' : '#86efac'}`,
                  borderRadius: 10, padding: '12px 14px'
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: hasMissing ? '#dc2626' : '#16a34a', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                    📦 Состав комплекта ({product.kitParts.length} деталей)
                  </div>
                  {hasMissing && (
                    <div style={{ background: '#fee2e2', borderRadius: 6, padding: '8px 10px', marginBottom: 10, fontSize: 11, color: '#dc2626', fontWeight: 600 }}>
                      ⚠️ Не хватает деталей для сборки комплекта
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {product.kitParts.map((part, i) => {
                      const p = part.product;
                      if (!p) return null;
                      const needed = part.qty || 1;
                      const available = p.stock || 0;
                      const isMissing = available < needed;
                      return (
                        <div key={i} style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          background: isMissing ? '#fee2e2' : '#fff',
                          borderRadius: 10, padding: '12px 14px',
                          border: isMissing ? '1px solid #fecaca' : '1px solid #e5e7eb'
                        }}>
                          {p.images?.[0] && (
                            <img src={p.images[0]} alt="" style={{ width: 48, height: 48, objectFit: 'contain', borderRadius: 8, background: '#f8f8f8' }} />
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {p.fullName || p.name}
                            </div>
                            <div style={{ fontSize: 12, color: isMissing ? '#dc2626' : '#16a34a', fontWeight: 600, marginTop: 2 }}>
                              {available} шт{isMissing && ` (нужно ${needed})`}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>
                              {p.price?.toLocaleString('ru')} сом
                            </div>
                            {needed > 1 && (
                              <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                                × {needed} шт
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${hasMissing ? '#fecaca' : '#bbf7d0'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: hasMissing ? '#dc2626' : '#16a34a', fontWeight: 600 }}>Итого</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#111' }}>
                      {product.kitParts.reduce((sum, part) => sum + (part.product?.price || 0) * (part.qty || 1), 0).toLocaleString('ru')} сом
                    </span>
                  </div>
                </div>
                );
              })()}

              {/* Extra actions slot */}
              {extraActions}
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

      {/* Модалка приёма товара */}
      {showReceiveModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
        }} onClick={() => setShowReceiveModal(false)}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: 24, width: '90%', maxWidth: 400,
            boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
              📦 Приём товара
            </div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>
              <strong>{localProduct.fullName || localProduct.name}</strong>
            </div>

            {/* Сравнение ожидаемое/получено */}
            <div style={{
              display: 'flex', gap: 12, marginBottom: 16, padding: 12,
              background: '#f8f8f8', borderRadius: 10,
            }}>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>ОЖИДАЕТСЯ</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#333' }}>
                  {expectedQty || '—'}
                </div>
              </div>
              <div style={{ width: 1, background: '#ddd' }} />
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>ПОЛУЧЕНО</div>
                <input
                  type="number"
                  value={receiveQty}
                  onChange={e => {
                    const qty = Number(e.target.value);
                    setReceiveQty(qty);
                    if (qty === expectedQty) setReceiveAlert('ok');
                    else if (qty < expectedQty) setReceiveAlert('shortage');
                    else setReceiveAlert('excess');
                  }}
                  min={0}
                  style={{
                    width: 80, padding: '8px', fontSize: 24, fontWeight: 700,
                    border: '2px solid #3b82f6', borderRadius: 8, textAlign: 'center',
                    color: receiveQty === expectedQty ? '#22c55e' :
                           receiveQty < expectedQty ? '#ef4444' : '#3b82f6',
                  }}
                />
              </div>
            </div>

            {/* Автоматический статус */}
            {expectedQty > 0 && receiveQty !== expectedQty && (
              <div style={{
                padding: '10px 14px', borderRadius: 8, marginBottom: 16,
                background: receiveQty < expectedQty ? '#fef2f2' : '#eff6ff',
                color: receiveQty < expectedQty ? '#dc2626' : '#2563eb',
                fontSize: 13, fontWeight: 600,
              }}>
                {receiveQty < expectedQty
                  ? `⚠️ Недостача: не хватает ${expectedQty - receiveQty} шт.`
                  : `📈 Излишек: пришло на ${receiveQty - expectedQty} шт. больше`
                }
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>
                Дополнительно (если есть проблемы):
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {[
                  { key: 'damaged', label: '💔 Повреждён', color: '#ef4444' },
                  { key: 'wrong', label: '❌ Не тот товар', color: '#ef4444' },
                ].map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setReceiveAlert(receiveAlert === opt.key ? 'ok' : opt.key)}
                    style={{
                      padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 16,
                      background: receiveAlert === opt.key ? opt.color : '#f0f0f0',
                      color: receiveAlert === opt.key ? '#fff' : '#555',
                      border: 'none', cursor: 'pointer',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {((expectedQty > 0 && receiveQty !== expectedQty) || receiveAlert === 'damaged' || receiveAlert === 'wrong') && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>
                  Комментарий (опционально):
                </label>
                <textarea
                  value={receiveComment}
                  onChange={e => setReceiveComment(e.target.value)}
                  placeholder="Опишите ситуацию..."
                  style={{
                    width: '100%', minHeight: 60, padding: 10, fontSize: 13,
                    border: '1.5px solid #ddd', borderRadius: 8, resize: 'vertical',
                    fontFamily: 'inherit', boxSizing: 'border-box',
                  }}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowReceiveModal(false)}
                style={{
                  flex: 1, padding: '12px', fontSize: 14, fontWeight: 600,
                  background: '#f5f5f5', color: '#666', border: 'none', borderRadius: 10,
                  cursor: 'pointer',
                }}
              >
                Отмена
              </button>
              <button
                onClick={handleReceive}
                disabled={receiving}
                style={{
                  flex: 1, padding: '12px', fontSize: 14, fontWeight: 700,
                  background: receiving ? '#ccc' : '#2d7a3a', color: '#fff',
                  border: 'none', borderRadius: 10,
                  cursor: receiving ? 'not-allowed' : 'pointer',
                }}
              >
                {receiving ? '⏳...' : '✓ Принять'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модалка добавления остатков */}
      {showAddStockModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
        }} onClick={() => setShowAddStockModal(false)}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: 24, width: '90%', maxWidth: 360,
            boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
              ➕ Добавить остатки
            </div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
              <strong>{localProduct.fullName || localProduct.name}</strong>
              <br />Сейчас на складе: <strong>{localProduct.stock || 0} шт.</strong>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>
                Добавить:
              </label>
              <input
                type="number"
                value={addStockQty}
                onChange={e => setAddStockQty(Number(e.target.value))}
                min={1}
                style={{
                  width: '100%', padding: '10px 12px', fontSize: 16, fontWeight: 700,
                  border: '2px solid #ddd', borderRadius: 8, textAlign: 'center',
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>
                Комментарий (необязательно):
              </label>
              <input
                type="text"
                value={addStockComment}
                onChange={e => setAddStockComment(e.target.value)}
                placeholder="Откуда поступление..."
                style={{
                  width: '100%', padding: '8px 12px', fontSize: 13,
                  border: '1.5px solid #ddd', borderRadius: 8,
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowAddStockModal(false)}
                style={{
                  flex: 1, padding: '12px', fontSize: 14, fontWeight: 600,
                  background: '#f5f5f5', color: '#666', border: 'none', borderRadius: 10,
                  cursor: 'pointer',
                }}
              >
                Отмена
              </button>
              <button
                onClick={handleAddStock}
                disabled={addingStock || addStockQty <= 0}
                style={{
                  flex: 1, padding: '12px', fontSize: 14, fontWeight: 700,
                  background: addingStock || addStockQty <= 0 ? '#ccc' : '#3b82f6', color: '#fff',
                  border: 'none', borderRadius: 10,
                  cursor: addingStock || addStockQty <= 0 ? 'not-allowed' : 'pointer',
                }}
              >
                {addingStock ? '⏳...' : '✓ Добавить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}
