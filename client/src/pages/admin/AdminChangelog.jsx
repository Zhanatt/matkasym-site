import { useEffect, useState } from 'react';
import { adminGetChangelog } from '../../api/index';

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatValue(val) {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'boolean') return val ? 'Да' : 'Нет';
  if (Array.isArray(val)) {
    if (val.length === 0) return '(пусто)';
    return val.map(s => s?.key ? `${s.key}: ${s.value}` : JSON.stringify(s)).join(', ');
  }
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

export default function AdminChangelog() {
  const [logs,    setLogs]    = useState([]);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');

  useEffect(() => {
    setLoading(true);
    adminGetChangelog({ limit: 200 })
      .then(r => { setLogs(r.data.logs); setTotal(r.data.total); })
      .finally(() => setLoading(false));
  }, []);

  const filtered = search
    ? logs.filter(l =>
        l.productName?.toLowerCase().includes(search.toLowerCase()) ||
        l.changedBy?.name?.toLowerCase().includes(search.toLowerCase())
      )
    : logs;

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">История изменений</h1>
          <p style={{ color: 'var(--slate)', fontSize: 13, margin: '2px 0 0' }}>
            Всего записей: {total}
          </p>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <input
          className="admin-search"
          placeholder="Поиск по товару или пользователю..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 360 }}
        />
      </div>

      {loading ? (
        <div className="admin-empty">Загрузка...</div>
      ) : filtered.length === 0 ? (
        <div className="admin-empty">История изменений пуста</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(log => (
            <div key={log._id} style={{
              background: '#fff',
              border: '1px solid var(--gray-200)',
              borderRadius: 10,
              overflow: 'hidden',
            }}>
              {/* Header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 20px',
                background: '#f7f8fa',
                borderBottom: '1px solid var(--gray-200)',
                flexWrap: 'wrap',
              }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#000' }}>
                    📦 {log.productName}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--slate)', marginTop: 2 }}>
                    ID: {log.productId}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>
                    👤 {log.changedBy?.name || '—'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--slate)' }}>
                    {log.changedBy?.email}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--slate)' }}>
                    🕐 {formatDate(log.createdAt)}
                  </div>
                </div>
              </div>

              {/* Changes */}
              <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {log.changes.map((c, i) => (
                  <div key={i} style={{
                    display: 'grid',
                    gridTemplateColumns: '160px 1fr 24px 1fr',
                    gap: 8,
                    alignItems: 'start',
                    fontSize: 13,
                  }}>
                    <div style={{ fontWeight: 600, color: '#555', paddingTop: 1 }}>
                      {c.field}
                    </div>
                    <div style={{
                      background: '#fff0f0', borderRadius: 6,
                      padding: '3px 10px', color: '#c0392b',
                      wordBreak: 'break-word',
                    }}>
                      {formatValue(c.from)}
                    </div>
                    <div style={{ textAlign: 'center', color: 'var(--slate)', paddingTop: 4 }}>→</div>
                    <div style={{
                      background: '#f0fff4', borderRadius: 6,
                      padding: '3px 10px', color: '#2d7a3a',
                      wordBreak: 'break-word',
                    }}>
                      {formatValue(c.to)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
