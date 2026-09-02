import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { adminDeleteProduct, adminCreateProduct, adminReceiveProduct, adminAddStock, adminSetBufferStock, adminGetProduct } from '../../api';
import { cloudinaryOpt } from '../../utils/drive';
import { fetchImageFile, saveImageFiles } from '../../utils/saveImage';
import { signOf, costSignOf } from '../../utils/price';
import { dimensionLabel } from '../../utils/dimensions';

const NO_PHOTO = '/logos/no-photo.png';

// Прайсы баз 1С (зеркалит server/lib/stockBases.js). Набор цен у баз разный.
const PRICE_BASES = [
  { key: 'makein',   label: 'Make-in',     icon: '📦', hint: 'Кыргызстан', priceTypes: ['retail', 'wholesale', 'dealer', 'cost'] },
  { key: 'matkasym', label: 'Matkasym',    icon: '🏠', hint: 'Кыргызстан', priceTypes: ['retail', 'dealer', 'wholesale', 'cost', 'export'] },
  { key: 'qtop',     label: 'Matkasym KZ', icon: '🇰🇿', hint: 'Казахстан',  priceTypes: ['retail', 'wholesale', 'cost'], kz: true },
];
const PRICE_LABEL = { retail: 'розн.', wholesale: 'опт.', dealer: 'дилер.', cost: 'закуп.', export: 'экспорт' };
// Развёрнутые подписи — для карточек баз в новом макете
const PRICE_FULL  = { retail: 'Розничная цена', wholesale: 'Оптовая цена', dealer: 'Дилерская цена', cost: 'Закупочная цена', export: 'Экспортная цена' };

// Палитра карточки: светлый холст + белые панели, как в остальной админке
const UI = {
  canvas: '#eef2f8', card: '#ffffff', line: '#e6ecf4', lineSoft: '#f1f5f9',
  ink: '#0f172a', muted: '#64748b', label: '#94a3b8',
  blue: '#2563eb', blueWash: '#eff6ff', green: '#15803d', red: '#dc2626',
  shadow: '0 1px 2px rgba(16,24,40,.05)',
};

// Иконка характеристики по названию — тайлы «Общих характеристик»
const SPEC_ICONS = [
  [/габарит|размер/,            '📐'],
  [/конструкц/,                 '✂️'],
  [/материал чехла|чехол|ткан/, '🧵'],
  [/материал|корпус/,           '🧱'],
  [/покрыт/,                    '🖌'],
  [/цвет/,                      '🎨'],
  [/размещен|установ/,          '📍'],
  [/нагрузк/,                   '🏋️'],
  [/вес упаковки|упаковк/,      '📦'],
  [/вес/,                       '⚖️'],
  [/количеств|кол-?во/,         '🔢'],
  [/предназначен|назначен/,     '✅'],
  [/столешниц|полк/,            '🪵'],
  [/высот|ширин|длин|глубин/,   '📏'],
];
const specIcon = key => (SPEC_ICONS.find(([re]) => re.test(String(key).toLowerCase())) || [null, '🔹'])[1];

// Строка «подпись — значение» в карточке базы
const baseRow = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
  padding: '8px 0', borderTop: '1px solid #e8eff8',
};
// Пункт меню «⋮»
const menuItemStyle = (color = '#334155') => ({
  display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px',
  borderRadius: 10, background: 'transparent', border: 'none',
  color, fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
});
// Стрелки галереи
const galleryArrow = side => ({
  position: 'absolute', [side]: 10, top: '50%', transform: 'translateY(-50%)',
  width: 36, height: 36, borderRadius: 11, fontSize: 20, lineHeight: 1,
  background: 'rgba(255,255,255,.92)', border: '1px solid #e6ecf4', color: '#334155',
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  boxShadow: '0 2px 8px rgba(15,23,42,.12)',
});

// Экспортный прайс всегда в долларах; Matkasym KZ закупается по нему же, а продаёт в тенге
const priceCurrency = (base, type) =>
  type === 'export' ? '$' : base === 'qtop' ? (type === 'cost' ? '$' : '₸') : 'сом';

const PRODUCT_STATUS_META = {
  for_sale:       { label: 'В продаже',           color: '#2d7a3a', bg: '#e8f5e9', icon: '🛒' },
  planned:        { label: 'В плане',             color: '#3b5bdb', bg: '#e8eeff', icon: '📋' },
  in_development: { label: 'В разработке',        color: '#7c3aed', bg: '#f3e8ff', icon: '🔧' },
  improvement:    { label: 'На улучшении',        color: '#c47a00', bg: '#fff3cd', icon: '✏️' },
  on_pause:       { label: 'На паузе',            color: '#6b7280', bg: '#f3f4f6', icon: '⏸' },
  discontinued:   { label: 'Снят',                color: '#888',    bg: '#f5f5f5', icon: '🚫' },
  liquidation:    { label: 'Ликвидация',          color: '#92400e', bg: '#fef3c7', icon: '🏷️' },
  kit_part:       { label: 'Деталь комплекта',    color: '#16a34a', bg: '#f0fdf4', icon: '📦' },
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

// zBase — этаж модалки. Деталь комплекта открывается такой же карточкой поверх родительской,
// поэтому слои не зашиты, а сдвигаются: вложенная встаёт выше всех окон родителя.
export default function AdminProductModal({ product, onClose, onDeleted, onSaved, extraActions, zBase = 1600, country }) {
  const { user }    = useAuth();
  const navigate    = useNavigate();
  const isMobile    = useIsMobile();
  const canEdit     = ['owner', 'editor', 'designer'].includes(user?.role);
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
  const [menuOpen,   setMenuOpen]   = useState(false); // выпадашка «⋮» в шапке
  const [zoom,       setZoom]       = useState(false); // фото на весь экран
  const [partPreview, setPartPreview] = useState(null); // деталь комплекта, открытая своей карточкой
  const [loadingPart, setLoadingPart] = useState(null); // id детали, которая грузится

  // Подгружаем полные данные товара (techSheet и др. могут отсутствовать в списке)
  useEffect(() => {
    if (!product?._id) return;
    setImgIdx(0);   // иначе на новом товаре откроется фото под старым номером
    adminGetProduct(product._id).then(r => setLocalProduct(prev => ({ ...prev, ...r.data }))).catch(() => {});
  }, [product?._id]);
  const canSetBuffer = user?.role === 'owner' || user?.canSetBufferStock;
  const [bufferEditBase, setBufferEditBase] = useState(null); // ключ базы, у которой правят буфер
  const [bufferVal, setBufferVal] = useState(0);
  const [savingBuffer, setSavingBuffer] = useState(false);

  // Буфер у каждой базы 1С свой. У карточек, которые ещё не разделены, прежнее
  // общее значение — это буфер Make-in (так его и считали до разделения).
  const bufferOf = (baseKey) => {
    const by = localProduct.bufferByBase;
    const has = by && (by.makein || by.matkasym || by.qtop);
    if (has) return by[baseKey] || 0;
    return baseKey === 'makein' ? (localProduct.bufferStock || 0) : 0;
  };

  const saveBuffer = async (baseKey) => {
    setSavingBuffer(true);
    try {
      const res = await adminSetBufferStock(localProduct._id, Number(bufferVal) || 0, baseKey);
      setLocalProduct(res.data);
      onSaved && onSaved(res.data);
      setBufferEditBase(null);
    } catch (e) {
      alert(e.response?.data?.error || 'Не удалось сохранить буферный запас');
    } finally {
      setSavingBuffer(false);
    }
  };

  // В kitParts деталь лежит populate-срезом (имя, цена, остаток, фото) — для карточки
  // нужен весь товар: характеристики, доп. фото, цены по базам.
  const openPart = async (part) => {
    setLoadingPart(part._id);
    try {
      const res = await adminGetProduct(part._id);
      setPartPreview(res.data);
    } catch (e) {
      alert(e.response?.data?.error || 'Не удалось открыть карточку детали');
    } finally {
      setLoadingPart(null);
    }
  };

  // Деталь отредактировали — обновляем её и в составе комплекта, чтобы список
  // не показывал старое фото и остаток до перезагрузки страницы.
  const handlePartSaved = (updated) => {
    setPartPreview(updated);
    const next = {
      ...localProduct,
      kitParts: (localProduct.kitParts || []).map(part =>
        part.product?._id === updated._id ? { ...part, product: { ...part.product, ...updated } } : part
      ),
    };
    setLocalProduct(next);
    onSaved && onSaved(next);
  };

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

  // Берём из localProduct, а не из пропа: список отдаёт товар «кратко» и
  // обрезает images до одной штуки ради веса ответа (на сете под сотню позиций
  // это сотни лишних килобайт). Полный набор приезжает следом, в localProduct,
  // — по пропу галерея показывала бы одно фото даже там, где их десять.
  const images = (localProduct.images || []).filter(Boolean);
  const img    = images[imgIdx] || NO_PHOTO;
  const hasColorOnly = localProduct.color && images.length === 0;

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
    try {
      const file = await fetchImageFile(url, `${product.name || 'photo'}_${index + 1}`);
      await saveImageFiles([file]);
    } catch {
      window.open(url, '_blank');
    }
  };

  const prices = [
    { label: 'Розничная',     value: product.price },
    { label: 'Оптовая',       value: product.priceWholesale },
    { label: 'Дилерская',     value: product.priceDealer },
    // Себестоимость — только владельцу
    ...(user?.role === 'owner'
      ? [{ label: 'Себестоимость', value: product.priceCost, sign: costSignOf(product) }]
      : []),
  ].filter(p => p.value > 0);

  const statusMeta = PRODUCT_STATUS_META[product.productStatus];
  const stockLabel = product.stock > 0 ? `${product.stock} шт.` : (product.inStock ? 'Есть' : 'Нет');

  // Keyboard navigation + Escape.
  // Пока сверху открыта деталь, клавиши её — иначе Escape закрыл бы обе карточки разом.
  useEffect(() => {
    if (partPreview) return;
    const h = e => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft'  && images.length > 1) setImgIdx(i => (i - 1 + images.length) % images.length);
      if (e.key === 'ArrowRight' && images.length > 1) setImgIdx(i => (i + 1) % images.length);
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [images.length, onClose, partPreview]);

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Browser back → close modal.
  // Своё состояние в историю кладёт и вложенная карточка, поэтому «назад» закрывает
  // сначала деталь, а комплект под ней остаётся — как и при Escape.
  const partOpenRef = useRef(null);
  partOpenRef.current = partPreview;
  useEffect(() => {
    window.history.pushState({ adminModal: true }, '');
    const handlePop = () => { if (!partOpenRef.current) onClose(); };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, [onClose]);

  // ── Общие стили нового макета ─────────────────────────────────────────────
  const card = {
    background: UI.card, border: `1px solid ${UI.line}`, borderRadius: 16,
    boxShadow: UI.shadow, padding: isMobile ? 14 : 18,
  };
  const cardTitle = {
    fontSize: isMobile ? 15 : 17, fontWeight: 800, color: UI.ink, marginBottom: isMobile ? 10 : 14,
  };
  const softBtn = {
    display: 'inline-flex', alignItems: 'center', gap: 7,
    padding: isMobile ? '8px 12px' : '9px 16px', borderRadius: 11,
    background: '#fff', border: `1px solid #d8e0ec`, color: '#334155',
    fontWeight: 700, fontSize: 13.5, cursor: 'pointer', whiteSpace: 'nowrap',
  };
  const pill = (bg, color) => ({
    display: 'inline-flex', alignItems: 'center', gap: 5,
    fontSize: 12, fontWeight: 700, padding: '5px 11px', borderRadius: 20,
    background: bg, color, whiteSpace: 'nowrap',
  });
  const dot = color => (
    <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
  );

  // Остатки и цены по базам 1С сведены в одну карточку на базу
  const visibleBases = PRICE_BASES.filter(b => country === 'KZ' ? b.kz : country === 'KG' ? !b.kz : true);
  const isIndependentKit = localProduct.isKit && localProduct.kitType === 'independent';
  const baseCards = visibleBases.map(b => {
    const pr    = localProduct.pricesByBase?.[b.key] || {};
    const rows  = b.priceTypes
      .filter(t => t !== 'cost' || user?.role === 'owner')       // себестоимость — только владельцу
      .filter(t => Number(pr[t]) > 0)
      .map(t => ({ label: PRICE_FULL[t], value: `${Number(pr[t]).toLocaleString('ru-RU')} ${priceCurrency(b.key, t)}` }));
    const qty   = localProduct.stockByBase?.[b.key] || 0;
    const known = localProduct.inBase?.[b.key];
    if (!rows.length && !qty && !known) return null;             // базе товар неизвестен — не мусорим
    const buffer = bufferOf(b.key);
    return {
      ...b, rows, qty, buffer,
      showStock:  !isIndependentKit && (qty > 0 || known),
      // Буфер ведут по Кыргызстану и только там, где база знает товар
      showBuffer: !isIndependentKit && !b.kz && (qty > 0 || known),
      belowBuffer: buffer > 0 && qty < buffer,
    };
  }).filter(Boolean);

  return createPortal(
    <>
      <div onClick={onClose}
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,.55)', zIndex: zBase }} />

      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: zBase + 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: isMobile ? 0 : 24, pointerEvents: 'none',
      }}>
        <div style={{
          background: UI.canvas,
          borderRadius: isMobile ? 0 : 22,
          width: '100%', maxWidth: 1180,
          maxHeight: isMobile ? '100%' : '94vh',
          height: isMobile ? '100%' : 'auto',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          pointerEvents: 'auto',
          boxShadow: '0 24px 70px rgba(15,23,42,.28)',
          fontFamily: 'var(--admin-font)',
        }}>

          {/* ── Шапка ─────────────────────────────────────────────────────── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12,
            padding: isMobile ? '10px 12px' : '14px 20px',
            background: '#fff', borderBottom: `1px solid ${UI.line}`, flexShrink: 0,
          }}>
            <button onClick={onClose} title="Закрыть"
              style={{
                width: 38, height: 38, borderRadius: 12, background: '#f3f6fb',
                border: `1px solid ${UI.line}`, cursor: 'pointer', fontSize: 18, color: '#475569',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>←</button>

            <div style={{
              fontSize: isMobile ? 15 : 20, fontWeight: 800, color: UI.ink,
              minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {isMobile ? (product.name || 'Товар') : 'Карточка товара'}
            </div>

            {statusMeta && !isMobile && (
              <span style={{ ...pill(statusMeta.bg, statusMeta.color), flexShrink: 0 }}>
                {dot(statusMeta.color)} {statusMeta.label}
              </span>
            )}

            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
              {canEdit && !isMobile && (
                <button onClick={handleCopy} disabled={copying}
                  style={{ ...softBtn, opacity: copying ? .6 : 1, cursor: copying ? 'not-allowed' : 'pointer' }}>
                  {copying ? '⏳…' : '⧉ Копировать'}
                </button>
              )}
              {canEdit && (
                <button onClick={() => { document.body.style.overflow = ''; navigate(`/admin/products/${product._id}/edit`, { replace: true }); }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    padding: isMobile ? '8px 12px' : '9px 18px', borderRadius: 11,
                    background: UI.blue, color: '#fff', border: 'none',
                    fontWeight: 700, fontSize: 13.5, cursor: 'pointer', whiteSpace: 'nowrap',
                    boxShadow: '0 2px 8px rgba(37,99,235,.28)',
                  }}>
                  ✏️ {isMobile ? '' : 'Редактировать'}
                </button>
              )}

              {/* Меню «⋮»: копирование на мобильном, скачивание фото, удаление */}
              <div style={{ position: 'relative' }}>
                <button onClick={() => setMenuOpen(o => !o)} title="Ещё"
                  style={{
                    width: 38, height: 38, borderRadius: 12, background: '#fff',
                    border: `1px solid #d8e0ec`, cursor: 'pointer', fontSize: 18, color: '#475569',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>⋮</button>
                {menuOpen && (
                  <>
                    <div onClick={() => setMenuOpen(false)}
                      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: zBase + 8 }} />
                    <div style={{
                      position: 'absolute', top: 46, right: 0, minWidth: 210, zIndex: zBase + 9,
                      background: '#fff', border: `1px solid ${UI.line}`, borderRadius: 14,
                      boxShadow: '0 12px 34px rgba(15,23,42,.16)', padding: 6, overflow: 'hidden',
                    }}>
                      {canEdit && isMobile && (
                        <button onClick={() => { setMenuOpen(false); handleCopy(); }} style={menuItemStyle()}>
                          ⧉ Копировать
                        </button>
                      )}
                      {!hasColorOnly && img !== NO_PHOTO && (
                        <button onClick={() => { setMenuOpen(false); downloadImage(img, imgIdx); }} style={menuItemStyle()}>
                          ⬇ Скачать фото
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => { setMenuOpen(false); setConfirming(true); }} style={menuItemStyle(UI.red)}>
                          🗑 Удалить товар
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ── Тело ──────────────────────────────────────────────────────── */}
          <div style={{
            flex: 1, minHeight: 0, overflow: 'auto',
            overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch',
            background: UI.canvas, padding: isMobile ? 12 : 18,
            display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 16,
          }}>

            {/* Верхний блок: галерея + основное */}
            <div style={{
              display: 'grid', gap: isMobile ? 12 : 16, alignItems: 'start',
              gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 440px) minmax(0, 1fr)',
            }}>

              {/* Галерея */}
              <div style={{ ...card, padding: isMobile ? 10 : 12 }}>
                <div
                  onTouchStart={images.length > 1 ? onTouchStart : undefined}
                  onTouchEnd={images.length > 1 ? onTouchEnd : undefined}
                  style={{
                    position: 'relative', borderRadius: 14, overflow: 'hidden',
                    background: hasColorOnly ? product.color : '#f6f7f9',
                    height: isMobile ? 260 : 380,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                  {hasColorOnly ? (
                    <div style={{
                      fontSize: 14, fontWeight: 700, color: '#fff',
                      textShadow: '0 1px 3px rgba(0,0,0,0.3)',
                      background: 'rgba(0,0,0,0.2)', padding: '6px 14px', borderRadius: 8,
                    }}>
                      {product.color}
                    </div>
                  ) : (
                    <img src={cloudinaryOpt(img, 900)} alt={product.name}
                      onClick={() => setZoom(true)}
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block', cursor: 'zoom-in' }}
                      onError={e => { e.target.src = NO_PHOTO; }} />
                  )}

                  {!hasColorOnly && img !== NO_PHOTO && (
                    <button onClick={() => setZoom(true)} title="Открыть фото"
                      style={{
                        position: 'absolute', top: 10, right: 10,
                        width: 36, height: 36, borderRadius: 11,
                        background: 'rgba(255,255,255,.92)', border: `1px solid ${UI.line}`,
                        color: '#475569', cursor: 'pointer', fontSize: 15,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 2px 8px rgba(15,23,42,.12)',
                      }}>⤢</button>
                  )}

                  {images.length > 1 && (
                    <>
                      <button onClick={() => setImgIdx(i => (i - 1 + images.length) % images.length)}
                        style={galleryArrow('left')}>‹</button>
                      <button onClick={() => setImgIdx(i => (i + 1) % images.length)}
                        style={galleryArrow('right')}>›</button>
                      <div style={{
                        position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)',
                        fontSize: 11.5, fontWeight: 700, color: '#475569',
                        background: 'rgba(255,255,255,.9)', borderRadius: 20, padding: '3px 10px',
                      }}>{imgIdx + 1} / {images.length}</div>
                    </>
                  )}
                </div>

                {images.length > 1 && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, overflowX: 'auto', paddingBottom: 2 }}>
                    {images.map((src, i) => (
                      <img key={i} src={cloudinaryOpt(src, 160)} alt="" onClick={() => setImgIdx(i)}
                        style={{
                          width: 62, height: 62, objectFit: 'cover', borderRadius: 12, cursor: 'pointer',
                          flexShrink: 0, background: '#f6f7f9',
                          border: i === imgIdx ? `2px solid ${UI.blue}` : `1px solid ${UI.line}`,
                          padding: 2, opacity: i === imgIdx ? 1 : .75,
                        }} />
                    ))}
                  </div>
                )}
              </div>

              {/* Название, артикул, бейджи */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 16 }}>
                <div style={card}>
                  <div style={{ fontSize: isMobile ? 19 : 26, fontWeight: 800, color: UI.ink, lineHeight: 1.2 }}>
                    {product.fullName || product.name}
                  </div>
                  {product.fullName && product.name !== product.fullName && (
                    <div style={{ fontSize: 13.5, color: UI.muted, marginTop: 4 }}>{product.name}</div>
                  )}
                  {product.sku && (
                    <div style={{ fontSize: isMobile ? 13 : 15, color: UI.label, fontWeight: 700, marginTop: 6 }}>
                      SKU: {product.sku}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 14 }}>
                    {statusMeta && isMobile && (
                      <span style={pill(statusMeta.bg, statusMeta.color)}>{dot(statusMeta.color)} {statusMeta.label}</span>
                    )}
                    {product.isNew && <span style={pill('#fff3cd', '#856404')}>Новинка</span>}
                    {localProduct.inTransit && (
                      <span style={pill('#eef6ff', '#1d4ed8')}>
                        🚚 В пути {localProduct.inTransitQty > 0 && `(${localProduct.inTransitQty} шт)`}
                      </span>
                    )}
                    {localProduct.pendingReceive && !localProduct.inTransit && (
                      <span style={pill('#fef3c7', '#92400e')}>
                        📋 Ожидает приёмки {localProduct.pendingReceiveQty > 0 && `(${localProduct.pendingReceiveQty} шт)`}
                      </span>
                    )}
                    {(() => {
                      const displayStock = country === 'KZ' ? (localProduct.stockByBase?.qtop || 0) : (localProduct.stock || 0);
                      const displayInStock = country === 'KZ' ? displayStock > 0 : localProduct.inStock;
                      if (isIndependentKit) return <span style={pill('#f5f3ff', '#7c3aed')}>Комплект</span>;
                      return (
                        <span style={pill(displayInStock ? '#e8f5e9' : '#fce8e8', displayInStock ? UI.green : UI.red)}>
                          {displayStock > 0 ? `${displayStock} шт.` : (displayInStock ? 'Есть' : 'Нет в наличии')}
                        </span>
                      );
                    })()}
                    {canReceive && needsReceive && (
                      <button onClick={openReceiveModal}
                        style={{ ...pill('#2d7a3a', '#fff'), border: 'none', cursor: 'pointer' }}>
                        {receiving ? '⏳...' : '📦 Принять'}
                      </button>
                    )}
                    {canReceive && !needsReceive && (
                      <button onClick={openAddStockModal}
                        style={{ ...pill(UI.blue, '#fff'), border: 'none', cursor: 'pointer' }}>
                        ➕ Добавить
                      </button>
                    )}
                  </div>

                  {/* Причина паузы */}
                  {product.pauseNote && (
                    <div style={{ marginTop: 14, background: '#f8fafc', border: `1px solid ${UI.line}`, borderRadius: 12, padding: '10px 14px' }}>
                      <div style={{ fontSize: 10.5, fontWeight: 800, color: UI.muted, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 4 }}>
                        ⏸ Причина паузы
                      </div>
                      <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>{product.pauseNote}</div>
                    </div>
                  )}
                </div>

                {/* Цены сайта. Показываем всегда: прайс базы 1С покрывает не все типы цен
                    (розничной может не быть ни в одной базе), а каталог, PDF и посты
                    читают именно эти поля — прятать их за карточками баз нельзя. */}
                {prices.length > 0 && !isIndependentKit && country !== 'KZ' && (
                  <div style={card}>
                    <div style={{ ...cardTitle, marginBottom: 4 }}>Цены на сайте</div>
                    <div style={{ fontSize: 12, color: UI.label, marginBottom: 12 }}>
                      их показывают каталог, PDF и посты
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(auto-fit, minmax(150px,1fr))', gap: 10 }}>
                      {prices.map(p => (
                        <div key={p.label} style={{ background: '#f8fafc', border: `1px solid ${UI.lineSoft}`, borderRadius: 12, padding: '10px 14px' }}>
                          <div style={{ fontSize: 11.5, color: UI.label, fontWeight: 700 }}>{p.label}</div>
                          <div style={{ fontSize: 17, fontWeight: 800, color: UI.ink, marginTop: 2 }}>
                            {p.value.toLocaleString('ru')} {p.sign || signOf(localProduct)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Остатки и цены по базам */}
                {baseCards.length > 0 && (
                  <div style={card}>
                    <div style={cardTitle}>Остатки и цены по базам</div>
                    <div style={{
                      display: 'grid', gap: 12,
                      gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(240px, 1fr))',
                    }}>
                      {baseCards.map(b => (
                        <div key={b.key} style={{
                          border: `1px solid ${b.kz ? '#fed7aa' : '#dbe6f5'}`,
                          background: b.kz ? '#fffbf5' : '#f9fbff',
                          borderRadius: 14, padding: 14,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                            <span style={{
                              width: 36, height: 36, borderRadius: 11, flexShrink: 0,
                              background: '#fff', border: `1px solid ${UI.line}`, fontSize: 17,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>{b.icon}</span>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 15, fontWeight: 800, color: UI.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {b.label}
                              </div>
                              <div style={{ fontSize: 11, color: UI.label }}>{b.hint}</div>
                            </div>
                          </div>

                          {b.showStock && (
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                              <span style={pill(b.qty > 0 ? '#e8f5e9' : '#fce8e8', b.qty > 0 ? UI.green : UI.red)}>
                                {dot(b.qty > 0 ? UI.green : UI.red)} {b.qty > 0 ? 'В наличии' : 'Нет'}
                              </span>
                              {b.belowBuffer && <span style={pill('#fff1e6', '#b45309')}>⚠ Ниже буфера</span>}
                            </div>
                          )}

                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {b.showStock && (
                              <div style={baseRow}>
                                <span style={{ color: UI.muted, fontSize: 13 }}>Остаток</span>
                                <span style={{ fontSize: 16, fontWeight: 800, color: b.qty > 0 ? UI.blue : '#cbd5e1' }}>
                                  {b.qty} шт.
                                </span>
                              </div>
                            )}
                            {b.showBuffer && (
                              <div style={{ ...baseRow, flexWrap: 'wrap' }}>
                                <span style={{ color: UI.muted, fontSize: 13 }}>🛡 Буфер</span>
                                {bufferEditBase === b.key ? (
                                  <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <input
                                      type="number" min="0" value={bufferVal}
                                      onChange={e => setBufferVal(e.target.value)}
                                      style={{ width: 74, padding: '5px 8px', borderRadius: 8, border: '1.5px solid #d1d5db', fontSize: 13.5, fontWeight: 700 }}
                                      autoFocus
                                    />
                                    <button onClick={() => saveBuffer(b.key)} disabled={savingBuffer} style={{
                                      padding: '6px 11px', borderRadius: 8, border: 'none', background: '#2d7a3a',
                                      color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                                    }}>{savingBuffer ? '…' : '✓'}</button>
                                    <button onClick={() => setBufferEditBase(null)} style={{
                                      padding: '6px 11px', borderRadius: 8, border: 'none', background: '#f1f5f9',
                                      color: '#555', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                                    }}>Отмена</button>
                                  </span>
                                ) : (
                                  <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <span style={{ fontSize: 14, fontWeight: 700, color: b.buffer > 0 ? UI.ink : '#cbd5e1' }}>
                                      {b.buffer > 0 ? `${b.buffer} шт.` : 'не задан'}
                                    </span>
                                    {canSetBuffer && (
                                      <button onClick={() => { setBufferVal(b.buffer); setBufferEditBase(b.key); }}
                                        title="Изменить буфер базы"
                                        style={{
                                          width: 26, height: 26, borderRadius: 8, background: '#fff',
                                          border: '1px solid #d8e0ec', color: '#475569', fontSize: 12,
                                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}>✏️</button>
                                    )}
                                  </span>
                                )}
                              </div>
                            )}
                            {b.rows.map(r => (
                              <div key={r.label} style={baseRow}>
                                <span style={{ color: UI.muted, fontSize: 13 }}>{r.label}</span>
                                <span style={{ fontSize: 14, fontWeight: 700, color: UI.ink }}>{r.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Итог по Кыргызстану: остаток и буфер — суммы по базам КГ */}
                    {!isIndependentKit && country !== 'KZ' && baseCards.some(b => b.showBuffer) && (() => {
                      const kgBuffer = baseCards.filter(b => b.showBuffer).reduce((n, b) => n + b.buffer, 0);
                      const kgStock  = localProduct.stock || 0;
                      const below    = kgBuffer > 0 && kgStock < kgBuffer;
                      return (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 12,
                          background: below ? '#fef2f2' : '#f8fafc',
                          border: `1px solid ${below ? '#fecaca' : UI.line}`,
                          borderRadius: 12, padding: '11px 14px',
                        }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Итого по Кыргызстану:</span>
                          <span style={{ fontSize: 15, fontWeight: 800, color: UI.ink }}>{kgStock} шт.</span>
                          <span style={{ fontSize: 13, color: UI.muted }}>
                            буфер {kgBuffer > 0 ? `${kgBuffer} шт.` : 'не задан'}
                          </span>
                          {below && <span style={pill('#fee2e2', UI.red)}>⚠️ ниже буфера</span>}
                        </div>
                      );
                    })()}
                  </div>
                )}

              </div>
            </div>

            {/* ── Общие характеристики ──────────────────────────────────────── */}
            {(() => {
              // Габариты — отдельным тайлом первым
              let dimTile = null;
              if (product.dimensions) {
                const raw = product.dimensions.trim();
                const unitMatch = raw.match(/[а-яёa-z]+\.?$/i);
                const unit = unitMatch ? unitMatch[0] : 'см';
                const numStr = raw.replace(/[а-яёa-z]+\.?$/i, '').trim();
                const parts = numStr.split(/[×x*]/i).map(s => s.trim()).filter(Boolean);
                dimTile = {
                  icon: '📐',
                  label: dimensionLabel(raw),
                  value: parts.length === 3 ? `${parts.join(' × ')} ${unit}` : raw,
                };
              }

              const seen = new Set();
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
              const capFirst = str => str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
              const guessUnit = (key, value) => {
                const k = key.trim().toLowerCase();
                const v = String(value || '');
                if (/[а-яёa-z]/i.test(v)) return '';
                if (/вес/.test(k))      return 'кг';
                if (/нагрузк/.test(k))  return 'кг';
                if (/высот|ширин|длин|глубин/.test(k)) return 'см';
                if (/количеств|кол-?во/.test(k)) return 'шт';
                return '';
              };

              const specTiles = (product.specs || [])
                .filter(s => {
                  if (!s.value || /^габарит/i.test(s.key)) return false;
                  const norm = s.key.trim().toLowerCase();
                  if (seen.has(norm)) return false;
                  seen.add(norm);
                  return true;
                })
                .sort((a, b) => {
                  const pa = specPriority(a.key), pb = specPriority(b.key);
                  return pa !== pb ? pa - pb : a.key.localeCompare(b.key, 'ru');
                })
                .map(s => {
                  const u = s.unit || guessUnit(s.key, s.value);
                  return { icon: specIcon(s.key), label: capFirst(s.key), value: `${s.value}${u ? ' ' + u : ''}` };
                });

              const tiles = [...(dimTile ? [dimTile] : []), ...specTiles];
              if (!tiles.length) return null;

              return (
                <div style={card}>
                  <div style={cardTitle}>Общие характеристики</div>
                  <div style={{
                    display: 'grid', gap: isMobile ? 10 : 14,
                    gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(230px, 1fr))',
                  }}>
                    {tiles.map((t, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 2px' }}>
                        <span style={{
                          width: 42, height: 42, borderRadius: 13, flexShrink: 0, fontSize: 18,
                          background: UI.blueWash, border: '1px solid #dbeafe',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>{t.icon}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: UI.label, fontWeight: 600 }}>{t.label}</div>
                          <div style={{ fontSize: 14.5, fontWeight: 700, color: UI.ink, marginTop: 1 }}>{t.value}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Описание */}
            {product.description && (
              <div style={card}>
                <div style={cardTitle}>Описание</div>
                <div style={{ fontSize: 13.5, color: '#475569', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                  {product.description}
                </div>
              </div>
            )}

            {/* Технический лист — скачать PDF */}
            {localProduct.techSheet?.files?.length > 0 && (
              <div style={{ ...card, background: '#f5f9ff', borderColor: '#bfdbfe' }}>
                <div style={{ ...cardTitle, color: '#1d4ed8' }}>📄 Технический лист</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {localProduct.techSheet.files.map((f, i) => (
                    <a key={i}
                      href={`/api/admin/products/${localProduct._id}/techsheet/${i}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        padding: '9px 16px', borderRadius: 11,
                        background: '#1d4ed8', color: '#fff',
                        fontSize: 13.5, fontWeight: 700, textDecoration: 'none',
                      }}>
                      ⬇ Скачать PDF{localProduct.techSheet.files.length > 1 ? ` (${i + 1})` : ''}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Поставщик — привозной товар (только owner и navigator) */}
            {product.isSupplied && (user?.role === 'owner' || user?.role === 'navigator') && (
              <div style={{ ...card, background: '#f5f9ff', borderColor: '#bfdbfe' }}>
                <div style={{ ...cardTitle, color: '#1d4ed8' }}>📦 Привозной товар (поставщик)</div>
                {[
                  ['Компания',           product.supplier?.company],
                  ['Контактное лицо',    product.supplier?.contactName],
                  ['Артикул поставщика', product.supplier?.sku],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, padding: '6px 0' }}>
                    <span style={{ color: '#7aa5d8', minWidth: 150, flexShrink: 0 }}>{label}</span>
                    <span style={{ color: UI.ink, fontWeight: 700 }}>{value}</span>
                  </div>
                ))}
                {!product.supplier?.company && !product.supplier?.contactName && !product.supplier?.sku && (
                  <span style={{ fontSize: 13, color: '#7aa5d8' }}>Данные поставщика не заполнены</span>
                )}
              </div>
            )}

            {/* Состав комплекта */}
            {localProduct.isKit && localProduct.kitParts?.length > 0 && (() => {
              const missingParts = localProduct.kitParts.filter(part => {
                const p = part.product;
                return p && (p.stock || 0) < (part.qty || 1);
              });
              const hasMissing = missingParts.length > 0;
              return (
                <div style={{ ...card, background: hasMissing ? '#fef7f7' : '#f6fdf8', borderColor: hasMissing ? '#fecaca' : '#bbf7d0' }}>
                  <div style={{ ...cardTitle, color: hasMissing ? UI.red : '#16a34a' }}>
                    📦 Состав комплекта ({localProduct.kitParts.length} деталей)
                  </div>
                  {hasMissing && (
                    <div style={{ background: '#fee2e2', borderRadius: 10, padding: '9px 12px', marginBottom: 12, fontSize: 12, color: UI.red, fontWeight: 700 }}>
                      ⚠️ Не хватает деталей для сборки комплекта
                    </div>
                  )}
                  <div style={{ display: 'grid', gap: 10, gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(300px, 1fr))' }}>
                    {localProduct.kitParts.map((part, i) => {
                      const p = part.product;
                      if (!p) return null;
                      const needed = part.qty || 1;
                      const available = p.stock || 0;
                      const isMissing = available < needed;
                      return (
                        <div key={i} onClick={() => openPart(p)} style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          background: isMissing ? '#fee2e2' : '#fff',
                          borderRadius: 12, padding: '11px 14px',
                          border: `1px solid ${isMissing ? '#fecaca' : UI.line}`,
                          cursor: 'pointer', transition: 'transform .15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.01)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
                          {p.images?.[0] && (
                            <img src={cloudinaryOpt(p.images[0], 100)} alt="" style={{ width: 48, height: 48, objectFit: 'contain', borderRadius: 10, background: '#f8f8f8' }} />
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 700, color: UI.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {p.fullName || p.name}
                            </div>
                            <div style={{ fontSize: 12, color: isMissing ? UI.red : '#16a34a', fontWeight: 700, marginTop: 2 }}>
                              {loadingPart === p._id ? 'Открываем…' : <>{available} шт{isMissing && ` (нужно ${needed})`}</>}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 800, color: UI.ink }}>
                              {p.price?.toLocaleString('ru')} {signOf(p)}
                            </div>
                            {needed > 1 && <div style={{ fontSize: 11, color: UI.muted, marginTop: 2 }}>× {needed} шт</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {localProduct.kitType !== 'independent' && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${hasMissing ? '#fecaca' : '#bbf7d0'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: hasMissing ? UI.red : '#16a34a', fontWeight: 700 }}>Итого</span>
                      <span style={{ fontSize: 16, fontWeight: 800, color: UI.ink }}>
                        {localProduct.kitParts.reduce((sum, part) => sum + (part.product?.price || 0) * (part.qty || 1), 0).toLocaleString('ru')} {signOf(localProduct)}
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Extra actions slot */}
            {extraActions}
          </div>
        </div>
      </div>

      {/* Фото на весь экран */}
      {zoom && !hasColorOnly && (
        <div onClick={() => setZoom(false)} style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: zBase + 300,
          background: 'rgba(15,23,42,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24, cursor: 'zoom-out',
        }}>
          <img src={cloudinaryOpt(img, 1600)} alt={product.name}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          <button onClick={() => setZoom(false)} style={{
            position: 'absolute', top: 20, right: 24, width: 42, height: 42, borderRadius: 12,
            background: 'rgba(255,255,255,.15)', color: '#fff', border: 'none', fontSize: 20, cursor: 'pointer',
          }}>✕</button>
        </div>
      )}
      {/* Delete confirmation dialog */}
      {confirming && (
        <>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.5)', zIndex: zBase + 100 }} />
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: zBase + 101,
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
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: zBase + 400,
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
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: zBase + 400,
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

      {/* Деталь комплекта — такая же карточка товара: галерея, характеристики, «Редактировать» */}
      {partPreview && (
        <AdminProductModal
          product={partPreview}
          country={country}
          zBase={zBase + 500}
          onClose={() => setPartPreview(null)}
          onSaved={handlePartSaved}
          onDeleted={() => setPartPreview(null)}
        />
      )}
    </>,
    document.body
  );
}
