import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminGetPriceLog } from '../../api';

const PRICE_TYPE_META = {
  retail:    { label: 'Розничная',   bg: '#e8f0fe', color: '#1a73e8' },
  wholesale: { label: 'Оптовая',     bg: '#fff3e0', color: '#e65100' },
  dealer:    { label: 'Дилерская',   bg: '#f3e8ff', color: '#7c3aed' },
  cost:      { label: 'Себестоимость', bg: '#fce8e8', color: '#c00' },
};

const SOURCE_LABEL = {
  manual: { label: 'Вручную', bg: '#f5f5f5', color: '#666' },
  excel:  { label: 'Excel',   bg: '#e6f4ea', color: '#1e7e34' },
};

function fmt(d) {
  const dt = new Date(d);
  return dt.toLocaleString('ru', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtPrice(n) {
  return n > 0 ? `${Number(n).toLocaleString('ru')} с` : '—';
}

const SEL = {
  padding: '6px 10px', borderRadius: 7, border: '1.5px solid #e0e0e0',
  fontSize: 12, background: '#fff', cursor: 'pointer', outline: 'none', color: '#333',
};

const LIMIT = 50;

export default function AdminPriceLog() {
  const navigate = useNavigate();

  const [logs,    setLogs]    = useState([]);
  const [total,   setTotal]   = useState(0);
  const [pages,   setPages]   = useState(1);
  const [loading, setLoading] = useState(true);

  const [search,    setSearch]    = useState('');
  const [priceType, setPriceType] = useState('');
  const [source,    setSource]    = useState('');
  const [dateFrom,  setDateFrom]  = useState('');
  const [dateTo,    setDateTo]    = useState('');
  const [page,      setPage]      = useState(1);

  const load = useCallback(() => {
    setLoading(true);
    const params = { page, limit: LIMIT };
    if (search)    params.search    = search;
    if (priceType) params.priceType = priceType;
    if (source)    params.source    = source;
    if (dateFrom)  params.dateFrom  = dateFrom;
    if (dateTo)    params.dateTo    = dateTo;
    adminGetPriceLog(params)
      .then(r => { setLogs(r.data.logs); setTotal(r.data.total); setPages(r.data.pages || 1); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, search, priceType, source, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const reset = () => { setSearch(''); setPriceType(''); setSource(''); setDateFrom(''); setDateTo(''); setPage(1); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', paddingBottom: 18, borderBottom: '1px solid #eee', marginBottom: 20 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: '0 4px', color: '#888' }}>←</button>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#111' }}>💰 История цен</div>
          <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>
            {loading ? '…' : `${total} записей`}
          </div>
        </div>
      </div>

      {/* Price type tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[{ value: '', label: 'Все цены' }, ...Object.entries(PRICE_TYPE_META).map(([k, v]) => ({ value: k, label: v.label }))].map(opt => (
          <button key={opt.value} onClick={() => { setPriceType(opt.value); setPage(1); }}
            style={{
              padding: '7px 16px', borderRadius: 8, border: `2px solid ${priceType === opt.value ? (PRICE_TYPE_META[opt.value]?.color || '#111') : '#e0e0e0'}`,
              background: priceType === opt.value ? (PRICE_TYPE_META[opt.value]?.bg || '#f0f0f0') : '#fff',
              color: priceType === opt.value ? (PRICE_TYPE_META[opt.value]?.color || '#111') : '#555',
              cursor: 'pointer', fontWeight: priceType === opt.value ? 700 : 500, fontSize: 13,
            }}>
            {opt.value === 'retail' ? '💰 ' : opt.value === 'wholesale' ? '💰 ' : opt.value === 'dealer' ? '💰 ' : ''}{opt.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Поиск по названию…"
          style={{ ...SEL, width: 220, padding: '7px 12px' }}
        />
        <select value={source} onChange={e => { setSource(e.target.value); setPage(1); }} style={SEL}>
          <option value="">Все источники</option>
          <option value="manual">Вручную</option>
          <option value="excel">Excel</option>
        </select>
        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} style={SEL} />
        <span style={{ color: '#aaa', fontSize: 12 }}>—</span>
        <input type="date" value={dateTo}   onChange={e => { setDateTo(e.target.value);   setPage(1); }} style={SEL} />
        {(search || source || dateFrom || dateTo) && (
          <button onClick={reset} style={{ padding: '6px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', background: '#fee', color: '#c00', fontSize: 12, fontWeight: 700 }}>
            ✕ Сбросить
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ color: '#aaa', fontSize: 14, textAlign: 'center', paddingTop: 60 }}>Загрузка…</div>
      ) : logs.length === 0 ? (
        <div style={{ color: '#bbb', fontSize: 14, textAlign: 'center', paddingTop: 60 }}>Записей нет</div>
      ) : (
        <>
          <div style={{ border: '1px solid #eee', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
            {/* Table header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '140px 1fr 100px 140px 90px 120px',
              padding: '8px 14px',
              background: '#f7f8fa',
              borderBottom: '1px solid #eee',
              fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5,
            }}>
              <span>Дата</span>
              <span>Товар</span>
              <span style={{ textAlign: 'center' }}>Тип</span>
              <span style={{ textAlign: 'center' }}>Было → Стало</span>
              <span style={{ textAlign: 'center' }}>Источник</span>
              <span>Кто</span>
            </div>

            {logs.map(log => {
              const pt  = PRICE_TYPE_META[log.priceType] || { label: log.priceType, bg: '#f5f5f5', color: '#666' };
              const src = SOURCE_LABEL[log.source]       || { label: log.source,    bg: '#f5f5f5', color: '#666' };
              const isRise = log.toPrice >= log.fromPrice;
              return (
                <div key={log._id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '140px 1fr 100px 140px 90px 120px',
                    padding: '9px 14px',
                    borderBottom: '1px solid #f5f5f5',
                    alignItems: 'center',
                    fontSize: 13,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#fafafa'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <span style={{ fontSize: 11, color: '#888' }}>{fmt(log.createdAt)}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.productName || '—'}
                    </div>
                    {log.sku && <div style={{ fontSize: 10, color: '#bbb' }}>{log.sku}</div>}
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700, background: pt.bg, color: pt.color }}>
                      {pt.label}
                    </span>
                  </div>
                  <div style={{ textAlign: 'center', fontSize: 12 }}>
                    <span style={{ color: '#888' }}>{fmtPrice(log.fromPrice)}</span>
                    <span style={{ color: '#ccc', margin: '0 4px' }}>→</span>
                    <span style={{ fontWeight: 700, color: isRise ? '#1e7e34' : '#c0392b' }}>{fmtPrice(log.toPrice)}</span>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    {log.sourceUrl ? (
                      <a href={log.sourceUrl} target="_blank" rel="noreferrer" style={{
                        padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700,
                        background: src.bg, color: src.color, textDecoration: 'none', display: 'inline-block',
                      }}>{src.label} ↗</a>
                    ) : (
                      <span style={{ padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700, background: src.bg, color: src.color }}>
                        {src.label}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {log.changedBy?.name || '—'}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
              {Array.from({ length: pages }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => setPage(p)} style={{
                  padding: '5px 11px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  fontWeight: p === page ? 800 : 400,
                  background: p === page ? '#111' : '#f0f0f0',
                  color: p === page ? '#fff' : '#555',
                  fontSize: 13,
                }}>{p}</button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
