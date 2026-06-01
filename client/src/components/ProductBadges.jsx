export const STATUS_BADGE = {
  for_sale:       null,
  planned:        { icon: '📋', label: 'В плане',        bg: '#e8f0fe', color: '#1a73e8' },
  in_development: { icon: '🔧', label: 'В разработке',   bg: '#fff3e0', color: '#e65100' },
  improvement:    { icon: '⬆', label: 'На улучшении',   bg: '#f3e5f5', color: '#7b1fa2' },
  on_pause:       { icon: '⏸', label: 'На паузе',        bg: '#f0f4f8', color: '#475569' },
  discontinued:   { icon: '🚫', label: 'Снят',           bg: '#fff0f0', color: '#c0392b' },
  nelikvid:       { icon: '🗑️', label: 'Неликвид',       bg: '#fef3c7', color: '#92400e' },
};

export function SupplierBadge({ product, size = 'normal' }) {
  if (!product.isSupplied) return null;

  const height = size === 'small' ? 12 : 18;
  const supplierName = product.supplier?.company || 'Привозной';

  if (product.supplier?.company === 'IKEA') {
    return (
      <img
        src="/logos/ikea.svg"
        alt="IKEA"
        title="Привозной товар от IKEA"
        style={{ height, borderRadius: 3, boxShadow: '0 1px 4px rgba(0,0,0,.15)' }}
      />
    );
  }

  if (size === 'small') {
    return <span title={supplierName}>📦</span>;
  }

  return (
    <div title={supplierName} style={{
      background: '#eef6ff', color: '#1d4ed8', borderRadius: 6, padding: '3px 6px',
      fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3,
      boxShadow: '0 1px 4px rgba(0,0,0,.15)'
    }}>
      <span>📦</span><span>{supplierName}</span>
    </div>
  );
}

export function InTransitBadge({ product }) {
  if (!product.inTransit) return null;

  return (
    <div title="Товар в пути" style={{
      background: '#1d4ed8', color: '#fff', borderRadius: 6, padding: '3px 6px',
      fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3,
      boxShadow: '0 1px 4px rgba(0,0,0,.15)'
    }}>
      <span>🚚</span><span>В пути</span>
    </div>
  );
}

export function StatusBadge({ product, compact = false }) {
  const badge = STATUS_BADGE[product.productStatus];
  if (!badge) return null;

  if (compact) {
    return (
      <div title={badge.label} style={{
        background: badge.bg, borderRadius: '50%',
        width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, lineHeight: 1, border: '1px solid rgba(0,0,0,.08)',
      }}>{badge.icon}</div>
    );
  }

  return (
    <div title={badge.label} style={{
      background: badge.bg, color: badge.color,
      borderRadius: 6, padding: '3px 6px',
      fontSize: 10, fontWeight: 700,
      display: 'flex', alignItems: 'center', gap: 3,
      boxShadow: '0 1px 4px rgba(0,0,0,.15)',
    }}>
      <span>{badge.icon}</span>
      <span>{badge.label}</span>
    </div>
  );
}

export function ProductImageBadges({ product }) {
  const hasBadges = product.isSupplied || product.inTransit || STATUS_BADGE[product.productStatus];
  if (!hasBadges) return null;

  return (
    <>
      {(product.isSupplied || product.inTransit) && (
        <div style={{ position: 'absolute', top: 6, left: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <InTransitBadge product={product} />
          <SupplierBadge product={product} />
        </div>
      )}
      {STATUS_BADGE[product.productStatus] && (
        <div style={{ position: 'absolute', top: 6, right: 6 }}>
          <StatusBadge product={product} />
        </div>
      )}
    </>
  );
}
