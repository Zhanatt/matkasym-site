import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminGetProductLog } from '../../api';

const ACTION_META = {
  added:   { label: 'Добавлен', bg: '#e6f4ea', color: '#1e7e34' },
  deleted: { label: 'Удалён',   bg: '#fff0f0', color: '#c0392b' },
};
const SOURCE_META = {
  manual:  { label: 'Вручную',    bg: '#e8f0fe', color: '#1a73e8' },
  sync_1c: { label: '1С Импорт', bg: '#fff3e0', color: '#e65100' },
};
const BRAND_LABELS = {
  'matkasym-home':   'HOME',
  'matkasym-shaar':  'SHAAR',
  'matkasym-kyzmat': 'KYZMAT',
};

function fmt(d) {
  const dt = new Date(d);
  return dt.toLocaleString('ru', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const SEL = {
  padding: '6px 10px', borderRadius: 7, border: '1.5px solid #e0e0e0',
  fontSize: 12, background: '#fff', cursor: 'pointer', outline: 'none', color: '#333',
};

const LIMIT = 50;

export default function AdminProductLog() {
  const navigate = useNavigate();
  const [logs,    setLogs]    = useState([]);
  const [total,   setTotal]   = useState(0);
  const [pages,   setPages]   = useState(1);
  const [loading, setLoading] = useState(true);

  const [search,   setSearch]   = useState('');
  const [action,   setAction]   = useState('');
  const [source,   setSource]   = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [page,     setPage]     = useState(1);

  const load = useCallback(() => {
    setLoading(true);
    const params = { page, limit: LIMIT };
    if (search)   params.search   = search;
    if (action)   params.action   = action;
    if (source)   params.source   = source;
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo)   params.dateTo   = dateTo;
    adminGetProductLog(params)
      .then(r => { setLogs(r.data.logs); setTotal(r.data.total); setPages(r.data.pages || 1); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, search, action, source, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const reset = () => { setSearch(''); setAction(''); setSource(''); setDateFrom(''); setDateTo(''); setPage(1); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', paddingBottom: 18, borderBottom: '1px solid var(--admin-line)', marginBottom: 20 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: '0 4px', color: '#888' }}>←</button>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#111' }}>📋 История товаров</div>
          <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>
            {loading ? '…' : `${total} записей`}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Поиск по названию…"
          style={{ ...SEL, minWidth: 200 }}
        />
        <select value={action} onChange={e => { setAction(e.target.value); setPage(1); }} style={SEL}>
          <option value="">Все действия</option>
          <option value="added">Добавлен</option>
          <option value="deleted">Удалён</option>
        </select>
        <select value={source} onChange={e => { setSource(e.target.value); setPage(1); }} style={SEL}>
          <option value="">Все источники</option>
          <option value="manual">Вручную</option>
          <option value="sync_1c">1С Импорт</option>
        </select>
        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} style={SEL} />
        <input type="date" value={dateTo}   onChange={e => { setDateTo(e.target.value);   setPage(1); }} style={SEL} />
        <button onClick={reset} style={{ ...SEL, color: '#888', background: '#f5f5f5' }}>Сбросить</button>
      </div>

      {loading ? (
        <div style={{ color: '#aaa', fontSize: 14, textAlign: 'center', paddingTop: 40 }}>Загрузка…</div>
      ) : logs.length === 0 ? (
        <div style={{ color: '#bbb', fontSize: 14, textAlign: 'center', paddingTop: 40 }}>Нет записей</div>
      ) : (
        <div style={{ border: '1px solid var(--admin-line)', borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f7f6f3', borderBottom: '1px solid var(--admin-line)' }}>
                {['Дата', 'Действие', 'Источник', 'Товар', 'Бренд', 'Кто'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => {
                const am = ACTION_META[log.action] || {};
                const sm = SOURCE_META[log.source] || {};
                return (
                  <tr key={log._id} style={{ borderBottom: '1px solid var(--admin-line)', background: i % 2 === 0 ? '#fff' : '#faf9f6' }}>
                    <td style={{ padding: '9px 14px', color: '#888', whiteSpace: 'nowrap', fontSize: 12 }}>{fmt(log.createdAt)}</td>
                    <td style={{ padding: '9px 14px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: am.bg, color: am.color }}>
                        {am.label || log.action}
                      </span>
                    </td>
                    <td style={{ padding: '9px 14px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: sm.bg, color: sm.color }}>
                        {sm.label || log.source}
                      </span>
                    </td>
                    <td style={{ padding: '9px 14px', fontWeight: 500, color: '#1c1c1c', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.productName}
                      {log.sku && <span style={{ color: '#aaa', fontSize: 11, marginLeft: 6 }}>{log.sku}</span>}
                    </td>
                    <td style={{ padding: '9px 14px', color: '#888', fontSize: 12 }}>
                      {BRAND_LABELS[log.brand] || log.brand || '—'}
                    </td>
                    <td style={{ padding: '9px 14px', color: '#888', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {log.changedBy?.name || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
          {Array.from({ length: pages }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => setPage(p)} style={{
              padding: '6px 12px', borderRadius: 6, border: '1.5px solid #e0e0e0',
              background: p === page ? '#1c1c1c' : '#fff',
              color: p === page ? '#fff' : '#333',
              cursor: 'pointer', fontWeight: p === page ? 700 : 500, fontSize: 13,
            }}>{p}</button>
          ))}
        </div>
      )}
    </div>
  );
}
