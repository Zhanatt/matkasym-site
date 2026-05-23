import { cloudinaryOpt } from '../../utils/drive';

const NO_PHOTO = '/logos/no-photo.png';

const PRICE_FIELDS = { retail: 'price', wholesale: 'priceWholesale', dealer: 'priceDealer' };
const PRICE_LABELS = { retail: 'Розничная', wholesale: 'Оптовая', dealer: 'Дилерская' };

const STATUS_BADGE = {
  for_sale:       null,
  planned:        { icon: '📋', label: 'В плане',        bg: '#e8f0fe', color: '#1a73e8' },
  in_development: { icon: '🔧', label: 'В разработке',   bg: '#fff3e0', color: '#e65100' },
  improvement:    { icon: '⬆', label: 'На улучшении',   bg: '#f3e5f5', color: '#7b1fa2' },
  discontinued:   { icon: '🚫', label: 'Снят',           bg: '#fff0f0', color: '#c0392b' },
  nelikvid:       { icon: '🗑️', label: 'Неликвид',       bg: '#fef3c7', color: '#92400e' },
};

function getPrice(p, mode) {
  const field = PRICE_FIELDS[mode];
  return field ? p[field] : null;
}

export default function AdminProductCard({ product, priceMode = 'retail', accent = '#DC1E24', onOpen, viewMode = 'grid' }) {
  const img        = cloudinaryOpt(product.images?.[0] || NO_PHOTO, viewMode === 'list' ? 80 : 400);
  const price      = getPrice(product, priceMode);
  const hasStock   = product.stock > 0 || product.inStock;
  const stockLabel = product.stock > 0 ? `${product.stock} шт.` : (product.inStock ? 'Есть' : 'Нет');
  const priceLabel = PRICE_LABELS[priceMode] || '';
  const onClick    = () => onOpen(product);
  const badge      = STATUS_BADGE[product.productStatus] ?? null;

  if (viewMode === 'list') {
    return (
      <div onClick={onClick}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px',
          borderBottom: '1px solid #f0f0f0', background: '#fff', cursor: 'pointer' }}
        onMouseEnter={e => e.currentTarget.style.background = '#f7f8fa'}
        onMouseLeave={e => e.currentTarget.style.background = '#fff'}
      >
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <img src={img} alt={product.name}
            style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6 }}
            loading="lazy" onError={e => { e.target.src = NO_PHOTO; }} />
          {badge && (
            <div title={badge.label} style={{
              position: 'absolute', top: -4, right: -4,
              background: badge.bg, borderRadius: '50%',
              width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, lineHeight: 1, border: '1px solid rgba(0,0,0,.08)',
            }}>{badge.icon}</div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {product.fullName || product.name}
          </div>
          {product.sku && <div style={{ fontSize: 10, color: '#ccc' }}>{product.sku}</div>}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 9, color: '#aaa', fontWeight: 500 }}>{priceLabel}</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: accent }}>
            {price > 0 ? `${price.toLocaleString('ru')} сом` : '—'}
          </div>
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 5, flexShrink: 0,
          background: hasStock ? '#e8f5e9' : '#fce8e8', color: hasStock ? '#2d7a3a' : '#c00' }}>
          {stockLabel}
        </div>
      </div>
    );
  }

  return (
    <div onClick={onClick}
      style={{ border: '1px solid #e8e8e8', borderRadius: 12, overflow: 'hidden',
        background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,.05)',
        cursor: 'pointer', transition: 'box-shadow .15s, transform .15s' }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,.12)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,.05)';  e.currentTarget.style.transform = 'none'; }}
    >
      <div style={{ aspectRatio: '1', overflow: 'hidden', background: '#f8f8f8', position: 'relative' }}>
        <img src={img} alt={product.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          loading="lazy" onError={e => { e.target.src = NO_PHOTO; }} />
        {/* Status badge — top-right corner of image */}
        {badge && (
          <div title={badge.label} style={{
            position: 'absolute', top: 6, right: 6,
            background: badge.bg, color: badge.color,
            borderRadius: 6, padding: '3px 6px',
            fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 3,
            boxShadow: '0 1px 4px rgba(0,0,0,.15)',
            backdropFilter: 'blur(4px)',
          }}>
            <span>{badge.icon}</span>
            <span>{badge.label}</span>
          </div>
        )}
        {product.sku && (
          <div style={{ position: 'absolute', bottom: 6, left: 6,
            background: 'rgba(255,255,255,0.92)', borderRadius: 4,
            fontSize: 9, fontWeight: 700, padding: '2px 5px', color: '#555' }}>
            {product.sku}
          </div>
        )}
      </div>
      <div style={{ padding: '10px 11px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#111', lineHeight: 1.3,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {product.fullName || product.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 }}>
          <div>
            <div style={{ fontSize: 9, color: '#aaa', fontWeight: 500, lineHeight: 1 }}>{priceLabel}</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: accent, lineHeight: 1.2 }}>
              {price > 0 ? `${price.toLocaleString('ru')} сом` : '—'}
            </div>
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 5,
            background: hasStock ? '#e8f5e9' : '#fce8e8', color: hasStock ? '#2d7a3a' : '#c00' }}>
            {stockLabel}
          </div>
        </div>
      </div>
    </div>
  );
}
