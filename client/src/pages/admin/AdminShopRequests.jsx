import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminGetShopRequests, adminUpdateShopRequest } from '../../api/index';
import { cloudinaryOpt, driveThumb } from '../../utils/drive';

/**
 * Заявки «Уточнить наличие» из Telegram-магазина.
 *
 * Работает с ними менеджер в Битриксе (воронка розничных продаж) — здесь видно,
 * что заявка дошла и какая у неё сделка. Статус ставим руками: сайт не знает,
 * чем закончился разговор, а от статуса зависит уведомление клиенту о поступлении.
 */
const STATUSES = {
  new:          { label: 'Ждёт менеджера', color: '#8a5b00', bg: '#fff4d6' },
  in_stock:     { label: 'Есть в наличии', color: '#1d6b2c', bg: '#e3f7e6' },
  out_of_stock: { label: 'Нет в наличии',  color: '#a3141f', bg: '#ffe6e6' },
  done:         { label: 'Обработана',     color: '#1d4ea3', bg: '#e6eefc' },
  canceled:     { label: 'Отменена',       color: '#666',    bg: '#eee' },
};

const TABS = [
  { key: '',             label: 'Все' },
  { key: 'new',          label: 'Новые' },
  { key: 'out_of_stock', label: 'Нет в наличии' },
  { key: 'done',         label: 'Обработанные' },
];

const BITRIX_DEAL_URL = 'https://matkasymov.bitrix24.kz/crm/deal/details/';

const photo = p => {
  const cloud = (p?.images || []).find(Boolean);
  if (cloud) return cloudinaryOpt(cloud, 120);
  const drive = (p?.driveImages || []).find(Boolean);
  return drive ? driveThumb(drive, 120) : '/logos/no-photo.png';
};

const dateFmt = d => new Date(d).toLocaleString('ru-RU', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});

export default function AdminShopRequests() {
  const navigate = useNavigate();
  const [items, setItems]   = useState([]);
  const [counts, setCounts] = useState({});
  const [tab, setTab]       = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);

  const load = () => {
    setLoading(true);
    adminGetShopRequests(tab ? { status: tab } : {})
      .then(r => { setItems(r.data.items || []); setCounts(r.data.counts || {}); })
      .finally(() => setLoading(false));
  };
  useEffect(load, [tab]);

  const setStatus = async (id, status) => {
    setSaving(id);
    try {
      const r = await adminUpdateShopRequest(id, { status });
      setItems(prev => prev.map(x => (x._id === id ? { ...x, ...r.data } : x)));
    } finally {
      setSaving(null);
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="admin-page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="admin-page-title">Заявки из Telegram</h1>
          <p style={{ color: 'var(--slate)', fontSize: 13, margin: '2px 0 0' }}>
            «Уточнить наличие» из магазина в канале. Работает менеджер в Битриксе:
            статус здесь меняется сам по стадии сделки, а клиент получает ответ в Telegram
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 15px', borderRadius: 20, fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
              border: `1.5px solid ${tab === t.key ? 'var(--red)' : 'var(--admin-line)'}`,
              background: tab === t.key ? 'var(--red)' : '#fff',
              color: tab === t.key ? '#fff' : 'var(--dark)',
            }}
          >
            {t.label}
            {counts[t.key] ? ` · ${counts[t.key]}` : ''}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="admin-empty">Загрузка…</div>
      ) : items.length === 0 ? (
        <div className="admin-empty">Заявок пока нет</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(r => {
            const st = STATUSES[r.status] || STATUSES.new;
            return (
              <div
                key={r._id}
                style={{
                  display: 'flex', gap: 14, padding: 14, borderRadius: 14,
                  background: 'var(--admin-surface)', border: '1px solid var(--admin-line)',
                }}
              >
                <img
                  src={r.snapshot?.image ? cloudinaryOpt(r.snapshot.image, 120) : photo(r.product)}
                  alt=""
                  style={{ width: 66, height: 66, objectFit: 'contain', borderRadius: 10, background: '#fff', cursor: 'pointer' }}
                  onClick={() => r.product?._id && navigate(`/admin/products/${r.product._id}`)}
                />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 14.5 }}>{r.snapshot?.name}</span>
                    <span style={{ fontSize: 12.5, color: 'var(--slate)' }}>
                      {r.qty} шт. · {Number(r.snapshot?.price || 0).toLocaleString('ru')} сом
                      {r.snapshot?.sku ? ` · арт. ${r.snapshot.sku}` : ''}
                    </span>
                  </div>

                  <div style={{ fontSize: 13, marginTop: 5 }}>
                    <b>{r.customer?.name || '—'}</b>
                    {r.customer?.phone && <> · <a href={`tel:${r.customer.phone}`}>{r.customer.phone}</a></>}
                    {r.customer?.tgUsername && (
                      <> · <a href={`https://t.me/${r.customer.tgUsername}`} target="_blank" rel="noreferrer">
                        @{r.customer.tgUsername}
                      </a></>
                    )}
                  </div>

                  {r.comment && (
                    <div style={{ fontSize: 13, color: 'var(--dark)', marginTop: 4 }}>«{r.comment}»</div>
                  )}

                  <div style={{ fontSize: 12, color: 'var(--slate)', marginTop: 6 }}>
                    {dateFmt(r.createdAt)}
                    {' · остаток при заявке: '}{r.snapshot?.stock ?? 0} шт.
                    {typeof r.product?.stock === 'number' && ` · сейчас: ${r.product.stock} шт.`}
                    {r.bitrix?.dealId ? (
                      <> · <a href={`${BITRIX_DEAL_URL}${r.bitrix.dealId}/`} target="_blank" rel="noreferrer">
                        сделка #{r.bitrix.dealId}
                      </a></>
                    ) : (
                      <span style={{ color: 'var(--red)' }}> · сделка не создана{r.bitrix?.error ? `: ${r.bitrix.error}` : ''}</span>
                    )}
                    {r.notifiedAt && ' · клиенту сообщили о поступлении'}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, alignItems: 'flex-end' }}>
                  <span style={{
                    fontSize: 11.5, fontWeight: 700, padding: '4px 9px', borderRadius: 8,
                    background: st.bg, color: st.color, whiteSpace: 'nowrap',
                  }}>
                    {st.label}
                  </span>
                  <select
                    value={r.status}
                    disabled={saving === r._id}
                    onChange={e => setStatus(r._id, e.target.value)}
                    style={{
                      fontSize: 12.5, padding: '6px 8px', borderRadius: 8,
                      border: '1px solid var(--admin-line)', background: '#fff', cursor: 'pointer',
                    }}
                  >
                    {Object.entries(STATUSES).map(([key, s]) => (
                      <option key={key} value={key}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
