import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export const STATUS_BADGE = {
  for_sale:       null,
  planned:        { icon: '📋', label: 'В плане',        bg: '#e8f0fe', color: '#1a73e8' },
  in_development: { icon: '🔧', label: 'В разработке',   bg: '#fff3e0', color: '#e65100' },
  improvement:    { icon: '⬆', label: 'На улучшении',   bg: '#f3e5f5', color: '#7b1fa2' },
  on_pause:       { icon: '⏸', label: 'На паузе',        bg: '#f0f4f8', color: '#475569' },
  discontinued:   { icon: '🚫', label: 'Снят',           bg: '#fff0f0', color: '#c0392b' },
  liquidation:    { icon: '🏷️', label: 'Ликвидация',     bg: '#fef3c7', color: '#92400e' },
  test_sale:      { icon: '🧪', label: 'Тест',           bg: '#e0f7fa', color: '#00838f' },
};

export function SupplierBadge({ product, size = 'normal' }) {
  const { user } = useAuth();
  // Дизайнер готовит карточки и посты по привозным товарам — ему нужно видеть,
  // от какого поставщика товар, наравне с владельцем, навигатором и складом.
  const canSeeSupplier = ['owner', 'navigator', 'warehouse', 'designer'].includes(user?.role);

  if (!product.isSupplied || !canSeeSupplier) return null;

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

// Размер стеллажа или шкафа поверх фото, в правом нижнем углу — как значок IKEA
// сверху. Стеллажи ADIK одной серии на снимках не отличить (A3 и A5 — только
// высотой), шкафы AICHUROK — тоже, без размера на карточке их путают.
const SHELVING  = /стеллаж|adik/i;
const CABINET   = /шкаф|тумб|kiyimbox|постамат/i;
const NOT_WHOLE = /рама|ножк|каркас|кронштейн|электрощит/i;   // детали, а не изделие
const SIZE_IN_NAME = /(\d+(?:[.,]\d+)?)\s*[xх×*]\s*(\d+(?:[.,]\d+)?)(?:\s*[xх×*]\s*(\d+(?:[.,]\d+)?))?/i;
const AXIS = { h: 'h', w: 'w', d: 'd', в: 'h', ш: 'w', г: 'd' };

// «H1850*W900*D400» → [900, 400, 1850]: ширина × глубина × высота, как у стеллажей.
// Буква оси должна стоять перед числом вплотную: «ШПК-310» — не ширина.
function sizeParts(str) {
  const ax = {};
  for (const m of String(str).matchAll(/(?:^|[^a-zа-яё])([hwdвшг])\s*(\d{2,5})/gi)) ax[AXIS[m[1].toLowerCase()]] = +m[2];
  if (ax.h && ax.w) return [ax.w, ax.d, ax.h].filter(Boolean);
  const m = String(str).match(SIZE_IN_NAME);
  const parts = m ? [m[1], m[2], m[3]].filter(Boolean).map(v => +String(v).replace(',', '.')) : null;
  // «H1031×460×620» — буквой подписана одна высота, и она первая: переносим её в конец
  if (parts?.length === 3 && ax.h && parts[0] === ax.h) return [parts[1], parts[2], parts[0]];
  return parts;
}

export function shelvingSize(product) {
  const name = product?.fullName || product?.name || '';
  const cat  = product?.category || '';
  const fits = (SHELVING.test(name) || /^adik/i.test(cat) || CABINET.test(name) || /шкаф|тумб/i.test(cat))
            && !NOT_WHOLE.test(name) && !/электрощит/i.test(cat);
  if (!fits) return '';
  // Габариты карточки, а если их не завели — из названия («Шкаф 2300х500х385»)
  const parts = sizeParts(product.dimensions || '') || sizeParts(name);
  if (!parts) return '';
  // Шкафы заведены в миллиметрах, стеллажи — в сантиметрах; на плашке всё в см.
  // Больше пяти метров — это склеенные цифры («1859х900500»), такое не показываем.
  const max = Math.max(...parts);
  if (max > 5000) return '';
  const cm = max >= 300 ? parts.map(v => Math.round(v / 10)) : parts;
  return cm.join('×');
}

// Плашка в правом нижнем углу фото: у стеллажей — размер, у урн и баков — объём
// (у сортировочных общий, по всем секциям). Объём считает сервер — поле volume.
export function SizeBadge({ product }) {
  const size = shelvingSize(product);
  if (!size && product?.volume) {
    return (
      <div title="Объём" style={{
        background: 'rgba(255,255,255,.92)', color: '#1c1e21', borderRadius: 6, padding: '3px 7px',
        fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', boxShadow: '0 1px 4px rgba(0,0,0,.15)',
      }}>
        {product.volume}
      </div>
    );
  }
  if (!size) return null;
  return (
    <div title="Габариты, см" style={{
      background: 'rgba(255,255,255,.92)', color: '#1c1e21', borderRadius: 6, padding: '3px 7px',
      fontSize: 11, fontWeight: 700, letterSpacing: .2, whiteSpace: 'nowrap',
      boxShadow: '0 1px 4px rgba(0,0,0,.15)',
    }}>
      {size} <span style={{ fontWeight: 500, color: '#6b7280' }}>см</span>
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

// ── Производитель ────────────────────────────────────────────────────────────
// Значок в левом верхнем углу фото в каталоге сета: IKEA, MATKASYM или Китай.
// Выбирают прямо на карточке, не открывая её. Видят и меняют только владелец
// и дизайнеры — сервер остальным поле не отдаёт и менять не даёт.
export const canSetMaker = user => ['owner', 'designer'].includes(user?.role);

const BADGE_H = 18;
const chip = { height: BADGE_H, borderRadius: 3, boxShadow: '0 1px 4px rgba(0,0,0,.15)', display: 'block' };

function ChinaFlag() {
  // Пропорции 3:2, большая звезда и четыре малые — как на флаге
  const star = 'M0,-1 L0.2245,-0.309 L0.951,-0.309 L0.363,0.118 L0.588,0.809 L0,0.382 L-0.588,0.809 L-0.363,0.118 L-0.951,-0.309 L-0.2245,-0.309Z';
  return (
    <svg viewBox="0 0 30 20" style={{ ...chip, width: BADGE_H * 1.5 }} aria-label="Китай">
      <rect width="30" height="20" fill="#de2910" />
      <path d={star} fill="#ffde00" transform="translate(5,5) scale(3)" />
      {[[10, 2, 23], [12, 4, 45], [12, 7, 70], [10, 9, 20]].map(([x, y, r]) => (
        <path key={x + '-' + y} d={star} fill="#ffde00" transform={`translate(${x},${y}) rotate(${r}) scale(1)`} />
      ))}
    </svg>
  );
}

export const MAKERS = {
  ikea:     { label: 'IKEA',     render: () => <img src="/logos/ikea.svg" alt="IKEA" style={{ ...chip }} /> },
  matkasym: { label: 'MATKASYM', render: () => (
    <span style={{ ...chip, background: '#fff', padding: '0 6px', display: 'flex', alignItems: 'center' }}>
      <img src="/logos/logo-main.png" alt="MATKASYM" style={{ height: 9, display: 'block' }} />
    </span>
  ) },
  china:    { label: 'Китай',    render: () => <ChinaFlag /> },
};

const stop = e => e.stopPropagation();

export function MakerPicker({ product, onChange }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  if (!canSetMaker(user)) return null;
  const current = MAKERS[product.maker];

  const pick = async value => {
    setOpen(false);
    if (value === (product.maker || '')) return;
    setBusy(true);
    try { await onChange(value); } finally { setBusy(false); }
  };

  return (
    <div ref={ref} style={{ position: 'relative' }} onClick={stop} onPointerDown={stop} onMouseDown={stop}>
      <button
        type="button"
        className={current ? 'maker-btn' : 'maker-btn maker-add'}
        title={current ? `Производитель: ${current.label}. Нажмите, чтобы изменить` : 'Указать производителя'}
        aria-haspopup="menu" aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen(o => !o)}
        style={{ opacity: busy ? .5 : undefined }}
      >
        {current ? current.render() : '+'}
      </button>
      {open && (
        <div role="menu" className="maker-menu">
          {Object.entries(MAKERS).map(([key, m]) => (
            <button key={key} type="button" role="menuitemradio" aria-checked={product.maker === key}
              className={product.maker === key ? 'on' : ''} onClick={() => pick(key)}>
              <span className="maker-ico">{m.render()}</span>{m.label}
            </button>
          ))}
          {current && <button type="button" role="menuitem" className="maker-clear" onClick={() => pick('')}>Убрать</button>}
        </div>
      )}
    </div>
  );
}
