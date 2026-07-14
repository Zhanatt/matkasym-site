import { useState, useEffect, useCallback } from 'react';
import { adminGetProductRequests, adminUpdateProductRequest, adminDeleteProductRequest } from '../../api';

const TYPE_META = {
  test: { label: 'Тест',  icon: '🧪', color: '#00838f', bg: '#e0f7fa' },
  real: { label: 'Заказ', icon: '🛒', color: '#b45309', bg: '#fef3c7' },
};

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function AdminProductOrders() {
  const [tab, setTab]         = useState('active');   // active | done
  const [typeFilter, setType] = useState('');         // '' | test | real
  const [items, setItems]     = useState([]);
  const [activeCount, setActive] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(null);
  const [lightbox, setLightbox] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    adminGetProductRequests({ status: tab, ...(typeFilter ? { type: typeFilter } : {}) })
      .then(r => { setItems(r.data.requests || []); setActive(r.data.activeCount || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tab, typeFilter]);

  useEffect(() => { load(); }, [load]);

  const markDone = async (id) => {
    setBusy(id);
    try { await adminUpdateProductRequest(id, { status: 'done' }); load(); } finally { setBusy(null); }
  };
  const reopen = async (id) => {
    setBusy(id);
    try { await adminUpdateProductRequest(id, { status: 'active' }); load(); } finally { setBusy(null); }
  };
  const remove = async (id) => {
    if (!window.confirm('Удалить заявку?')) return;
    setBusy(id);
    try { await adminDeleteProductRequest(id); load(); } finally { setBusy(null); }
  };

  const chip = (active) => ({
    padding: '7px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer',
    border: '1.5px solid ' + (active ? '#DC1E24' : '#e2e8f0'),
    background: active ? '#DC1E24' : '#fff', color: active ? '#fff' : '#475569',
  });

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', paddingBottom: 40 }}>
      <style>{`@media(max-width:640px){.po-card{flex-direction:column!important;align-items:stretch!important}.po-photo{width:100%!important;height:190px!important}}`}</style>

      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#111', display: 'flex', alignItems: 'center', gap: 10 }}>
          📥 Заказы товаров
          {activeCount > 0 && (
            <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', background: '#DC1E24',
              borderRadius: 20, padding: '2px 10px' }}>{activeCount} активных</span>
          )}
        </div>
        <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 3 }}>Заявки фронтменов на закуп товаров</div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <div onClick={() => setTab('active')} style={chip(tab === 'active')}>Активные</div>
        <div onClick={() => setTab('done')}   style={chip(tab === 'done')}>Выполненные</div>
      </div>

      {/* Type filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {[['', 'Все'], ['test', '🧪 Тест'], ['real', '🛒 Заказ']].map(([v, l]) => (
          <div key={v} onClick={() => setType(v)} style={{
            padding: '5px 12px', borderRadius: 16, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
            border: '1px solid ' + (typeFilter === v ? '#94a3b8' : '#eceff3'),
            background: typeFilter === v ? '#f1f5f9' : '#fff', color: '#475569',
          }}>{l}</div>
        ))}
      </div>

      {loading ? (
        <div style={{ color: '#aaa', textAlign: 'center', padding: 40 }}>Загрузка…</div>
      ) : items.length === 0 ? (
        <div style={{ color: '#bbb', textAlign: 'center', padding: 50, fontSize: 15 }}>
          {tab === 'active' ? 'Нет активных заявок' : 'Нет выполненных заявок'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {items.map(r => {
            const t = TYPE_META[r.type] || TYPE_META.real;
            const done = r.status === 'done';
            return (
              <div key={r._id} className="po-card" style={{ display: 'flex', gap: 14, background: '#fff',
                borderRadius: 16, padding: 14, boxShadow: '0 2px 10px rgba(0,0,0,.06)',
                opacity: done ? 0.72 : 1 }}>
                {/* Photo */}
                <div className="po-photo" onClick={() => r.photo && setLightbox(r.photo)}
                  style={{ width: 110, height: 110, flexShrink: 0, borderRadius: 12, overflow: 'hidden',
                    background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: r.photo ? 'zoom-in' : 'default' }}>
                  {r.photo ? <img src={r.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                           : <span style={{ fontSize: 34 }}>{t.icon}</span>}
                </div>

                {/* Body */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: t.color, background: t.bg,
                      padding: '2px 8px', borderRadius: 20 }}>{t.icon} {t.label}</span>
                    <span style={{ fontSize: 11, color: '#b0b8c1' }}>№{r.number}</span>
                    {done && <span style={{ fontSize: 11, fontWeight: 700, color: '#2d7a3a' }}>✓ Выполнена</span>}
                  </div>

                  <div style={{ fontSize: 16, fontWeight: 700, color: '#111', margin: '6px 0 4px' }}>{r.name}</div>

                  <div style={{ fontSize: 13, color: '#5b6572', lineHeight: 1.5 }}>
                    {r.dimensions && <span style={{ marginRight: 12 }}>📐 {r.dimensions}</span>}
                    {r.color && <span>🎨 {r.color}</span>}
                  </div>
                  {r.note && <div style={{ fontSize: 13, color: '#5b6572', marginTop: 4 }}>💬 {r.note}</div>}

                  <div style={{ fontSize: 11.5, color: '#9aa5b1', marginTop: 8 }}>
                    {r.createdBy?.name || r.createdByName || 'фронтмен'} · {fmtDate(r.createdAt)}
                    {done && r.doneByName ? ` · закрыл(а): ${r.doneByName}` : ''}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    {!done ? (
                      <button onClick={() => markDone(r._id)} disabled={busy === r._id}
                        style={{ flex: 1, padding: '11px', fontSize: 14, fontWeight: 700, color: '#fff',
                          background: busy === r._id ? '#9aa5b1' : '#2d7a3a', border: 'none', borderRadius: 10,
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        ✓ Выполнено
                      </button>
                    ) : (
                      <button onClick={() => reopen(r._id)} disabled={busy === r._id}
                        style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: '#475569',
                          background: '#f1f5f9', border: 'none', borderRadius: 10, cursor: 'pointer' }}>
                        ↩ Вернуть в активные
                      </button>
                    )}
                    <button onClick={() => remove(r._id)} disabled={busy === r._id} title="Удалить"
                      style={{ padding: '10px 14px', fontSize: 15, color: '#c0392b', background: '#fdecea',
                        border: 'none', borderRadius: 10, cursor: 'pointer' }}>🗑</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox('')} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)',
          zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <img src={lightbox} alt="" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}
