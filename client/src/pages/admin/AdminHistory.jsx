import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  adminGetStockLog,
  adminGetPriceLog,
  adminGetPhotoLog,
  adminGetChangelog,
  adminGetProductLog
} from '../../api';

const TABS = [
  { key: 'stock',    label: 'Остатки',    icon: '📦' },
  { key: 'price',    label: 'Цены',       icon: '💰' },
  { key: 'photo',    label: 'Фото',       icon: '🖼' },
  { key: 'changes',  label: 'Изменения',  icon: '📋' },
  { key: 'products', label: 'Товары',     icon: '🗃' },
];

const SOURCE_LABEL = {
  manual:   { label: 'Вручную',   bg: '#e8f0fe', color: '#1a73e8' },
  excel:    { label: 'Excel',     bg: '#e6f4ea', color: '#1e7e34' },
  sync_1c:  { label: '1С Синк',   bg: '#fff3e0', color: '#e65100' },
  api:      { label: 'API',       bg: '#fff3e0', color: '#e65100' },
};

const PRICE_TYPE_META = {
  retail:    { label: 'Розничная',     bg: '#e8f0fe', color: '#1a73e8' },
  wholesale: { label: 'Оптовая',       bg: '#fff3e0', color: '#e65100' },
  dealer:    { label: 'Дилерская',     bg: '#f3e8ff', color: '#7c3aed' },
  cost:      { label: 'Себестоимость', bg: '#fce8e8', color: '#c00' },
};

const ACTION_META = {
  added:   { label: 'Добавлен', bg: '#e6f4ea', color: '#1e7e34' },
  deleted: { label: 'Удалён',   bg: '#fff0f0', color: '#c0392b' },
};

const VALUE_LABELS = {
  in_stock: 'В наличии', out_of_stock: 'Нет в наличии', expected: 'Ожидается',
  for_sale: 'В продаже', planned: 'В плане', in_development: 'В разработке',
  improvement: 'На улучшении', discontinued: 'Снят с производства',
  true: 'Да', false: 'Нет',
};

const BRAND_LABELS = {
  'matkasym-home': 'HOME', 'matkasym-shaar': 'SHAAR', 'matkasym-kyzmat': 'KYZMAT',
};

function fmt(d) {
  const dt = new Date(d);
  return dt.toLocaleString('ru', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtPrice(n) {
  return n > 0 ? `${Number(n).toLocaleString('ru')} с` : '—';
}

function formatValue(val) {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'boolean') return val ? 'Да' : 'Нет';
  if (Array.isArray(val)) {
    if (val.length === 0) return '(пусто)';
    if (val[0]?.key !== undefined) return val.map(s => `${s.key}: ${s.value}`).join(', ');
    return null;
  }
  if (typeof val === 'object') return JSON.stringify(val);
  const str = String(val);
  return VALUE_LABELS[str] ?? str;
}

function isImageArray(val) {
  return Array.isArray(val) && (val.length === 0 || typeof val[0] === 'string');
}

const SEL = {
  padding: '6px 10px', borderRadius: 7, border: '1.5px solid #e0e0e0',
  fontSize: 12, background: '#fff', cursor: 'pointer', outline: 'none', color: '#333',
};

const LIMIT = 50;

function fileDisplayName(url, prefix = 'файл') {
  const raw = decodeURIComponent(url.split('/').pop().split('?')[0]) || 'file';
  const tsMatch = raw.match(/(\d{10,13})/);
  if (tsMatch) {
    const ts = Number(tsMatch[1]);
    const ms = ts > 1e12 ? ts : ts * 1000;
    const d = new Date(ms);
    const pad = n => String(n).padStart(2, '0');
    const date = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
    const time = `${pad(d.getHours())}-${pad(d.getMinutes())}`;
    return `${prefix}_на_${date}_${time}.xlsx`;
  }
  return /\.(xlsx|xls|csv)$/i.test(raw) ? raw : raw + '.xlsx';
}

async function downloadFile(url, prefix) {
  const forceUrl = url.includes('cloudinary.com')
    ? url.replace('/raw/upload/', '/raw/upload/fl_attachment/')
    : url;
  try {
    const blob = await fetch(forceUrl).then(r => r.blob());
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileDisplayName(url, prefix);
    a.click();
    URL.revokeObjectURL(a.href);
  } catch {
    window.open(url, '_blank');
  }
}

function ImageList({ urls, bg }) {
  if (!urls || urls.length === 0) {
    return <div style={{ background: bg, borderRadius: 6, padding: '6px 10px', fontSize: 13, color: '#aaa' }}>(нет фото)</div>;
  }
  return (
    <div style={{ background: bg, borderRadius: 6, padding: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {urls.map((url, i) => (
        <a key={i} href={url} target="_blank" rel="noreferrer">
          <img src={url} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 4, border: '1px solid rgba(0,0,0,.08)' }}
            onError={e => { e.currentTarget.style.display = 'none'; }} />
        </a>
      ))}
    </div>
  );
}

// ============ STOCK TAB ============
function StockTab() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    setLoading(true);
    const params = { page, limit: LIMIT };
    if (search) params.search = search;
    if (source) params.source = source;
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo) params.dateTo = dateTo;
    adminGetStockLog(params)
      .then(r => { setLogs(r.data.logs); setTotal(r.data.total); setPages(r.data.pages || 1); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, search, source, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const reset = () => { setSearch(''); setSource(''); setDateFrom(''); setDateTo(''); setPage(1); };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Поиск по названию…" style={{ ...SEL, width: 220, padding: '7px 12px' }} />
        <select value={source} onChange={e => { setSource(e.target.value); setPage(1); }} style={SEL}>
          <option value="">Все источники</option>
          <option value="manual">Вручную</option>
          <option value="excel">Excel</option>
          <option value="sync_1c">1С Синк</option>
        </select>
        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} style={SEL} />
        <span style={{ color: '#aaa', fontSize: 12 }}>—</span>
        <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} style={SEL} />
        {(search || source || dateFrom || dateTo) && (
          <button onClick={reset} style={{ padding: '6px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', background: '#fee', color: '#c00', fontSize: 12, fontWeight: 700 }}>✕ Сбросить</button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#888' }}>{loading ? '…' : `${total} записей`}</span>
      </div>

      {loading ? (
        <div style={{ color: '#aaa', fontSize: 14, textAlign: 'center', paddingTop: 60 }}>Загрузка…</div>
      ) : logs.length === 0 ? (
        <div style={{ color: '#bbb', fontSize: 14, textAlign: 'center', paddingTop: 60 }}>Записей нет</div>
      ) : (
        <>
          <div style={{ border: '1px solid var(--admin-line)', borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 80px 110px 90px 120px', padding: '8px 14px', background: '#f7f6f3', borderBottom: '1px solid var(--admin-line)', fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              <span>Дата</span><span>Товар</span><span style={{ textAlign: 'center' }}>Движение</span><span style={{ textAlign: 'center' }}>Было → Стало</span><span style={{ textAlign: 'center' }}>Источник</span><span>Кто</span>
            </div>
            {logs.map(log => {
              const src = SOURCE_LABEL[log.source] || { label: log.source, bg: '#f5f5f5', color: '#666' };
              const isPlus = log.delta >= 0;
              return (
                <div key={log._id} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 80px 110px 90px 120px', padding: '9px 14px', borderBottom: '1px solid var(--admin-line)', alignItems: 'center', fontSize: 13 }}
                  onMouseEnter={e => e.currentTarget.style.background = '#faf9f6'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <span style={{ fontSize: 11, color: '#888' }}>{fmt(log.createdAt)}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.productName || '—'}</div>
                    {log.sku && <div style={{ fontSize: 10, color: '#bbb' }}>{log.sku}</div>}
                  </div>
                  <div style={{ textAlign: 'center' }}><span style={{ fontWeight: 800, fontSize: 14, color: isPlus ? '#1e7e34' : '#c0392b' }}>{isPlus ? '+' : ''}{log.delta} шт.</span></div>
                  <div style={{ textAlign: 'center', fontSize: 12, color: '#555' }}><span>{log.fromStock ?? '?'}</span><span style={{ color: '#ccc', margin: '0 4px' }}>→</span><span style={{ fontWeight: 700 }}>{log.toStock ?? '?'}</span></div>
                  <div style={{ textAlign: 'center' }}>
                    {log.sourceUrl ? (
                      <button onClick={() => downloadFile(log.sourceUrl, 'остаток')} title="Скачать файл" style={{ padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700, background: src.bg, color: src.color, border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}>{src.label} ↓</button>
                    ) : (
                      <span style={{ padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700, background: src.bg, color: src.color }}>{src.label}</span>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.changedBy?.name || '—'}</span>
                </div>
              );
            })}
          </div>
          {pages > 1 && (
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
              {Array.from({ length: pages }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => setPage(p)} style={{ padding: '5px 11px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: p === page ? 800 : 400, background: p === page ? '#111' : '#f0f0f0', color: p === page ? '#fff' : '#555', fontSize: 13 }}>{p}</button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============ PRICE TAB ============
function PriceTab() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [priceType, setPriceType] = useState('');
  const [source, setSource] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    setLoading(true);
    const params = { page, limit: LIMIT };
    if (search) params.search = search;
    if (priceType) params.priceType = priceType;
    if (source) params.source = source;
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo) params.dateTo = dateTo;
    adminGetPriceLog(params)
      .then(r => { setLogs(r.data.logs); setTotal(r.data.total); setPages(r.data.pages || 1); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, search, priceType, source, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const reset = () => { setSearch(''); setPriceType(''); setSource(''); setDateFrom(''); setDateTo(''); setPage(1); };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {[{ value: '', label: 'Все цены' }, ...Object.entries(PRICE_TYPE_META).map(([k, v]) => ({ value: k, label: v.label }))].map(opt => (
          <button key={opt.value} onClick={() => { setPriceType(opt.value); setPage(1); }}
            style={{ padding: '6px 14px', borderRadius: 8, border: `2px solid ${priceType === opt.value ? (PRICE_TYPE_META[opt.value]?.color || '#111') : '#e0e0e0'}`, background: priceType === opt.value ? (PRICE_TYPE_META[opt.value]?.bg || '#f0f0f0') : '#fff', color: priceType === opt.value ? (PRICE_TYPE_META[opt.value]?.color || '#111') : '#555', cursor: 'pointer', fontWeight: priceType === opt.value ? 700 : 500, fontSize: 12 }}>
            {opt.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Поиск по названию…" style={{ ...SEL, width: 220, padding: '7px 12px' }} />
        <select value={source} onChange={e => { setSource(e.target.value); setPage(1); }} style={SEL}>
          <option value="">Все источники</option>
          <option value="manual">Вручную</option>
          <option value="excel">Excel</option>
        </select>
        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} style={SEL} />
        <span style={{ color: '#aaa', fontSize: 12 }}>—</span>
        <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} style={SEL} />
        {(search || source || dateFrom || dateTo) && (
          <button onClick={reset} style={{ padding: '6px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', background: '#fee', color: '#c00', fontSize: 12, fontWeight: 700 }}>✕ Сбросить</button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#888' }}>{loading ? '…' : `${total} записей`}</span>
      </div>

      {loading ? (
        <div style={{ color: '#aaa', fontSize: 14, textAlign: 'center', paddingTop: 60 }}>Загрузка…</div>
      ) : logs.length === 0 ? (
        <div style={{ color: '#bbb', fontSize: 14, textAlign: 'center', paddingTop: 60 }}>Записей нет</div>
      ) : (
        <>
          <div style={{ border: '1px solid var(--admin-line)', borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 100px 140px 90px 120px', padding: '8px 14px', background: '#f7f6f3', borderBottom: '1px solid var(--admin-line)', fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              <span>Дата</span><span>Товар</span><span style={{ textAlign: 'center' }}>Тип</span><span style={{ textAlign: 'center' }}>Было → Стало</span><span style={{ textAlign: 'center' }}>Источник</span><span>Кто</span>
            </div>
            {logs.map(log => {
              const pt = PRICE_TYPE_META[log.priceType] || { label: log.priceType, bg: '#f5f5f5', color: '#666' };
              const src = SOURCE_LABEL[log.source] || { label: log.source, bg: '#f5f5f5', color: '#666' };
              const isRise = log.toPrice >= log.fromPrice;
              return (
                <div key={log._id} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 100px 140px 90px 120px', padding: '9px 14px', borderBottom: '1px solid var(--admin-line)', alignItems: 'center', fontSize: 13 }}
                  onMouseEnter={e => e.currentTarget.style.background = '#faf9f6'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <span style={{ fontSize: 11, color: '#888' }}>{fmt(log.createdAt)}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.productName || '—'}</div>
                    {log.sku && <div style={{ fontSize: 10, color: '#bbb' }}>{log.sku}</div>}
                  </div>
                  <div style={{ textAlign: 'center' }}><span style={{ padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700, background: pt.bg, color: pt.color }}>{pt.label}</span></div>
                  <div style={{ textAlign: 'center', fontSize: 12 }}><span style={{ color: '#888' }}>{fmtPrice(log.fromPrice)}</span><span style={{ color: '#ccc', margin: '0 4px' }}>→</span><span style={{ fontWeight: 700, color: isRise ? '#1e7e34' : '#c0392b' }}>{fmtPrice(log.toPrice)}</span></div>
                  <div style={{ textAlign: 'center' }}>
                    {log.sourceUrl ? (
                      <button onClick={() => downloadFile(log.sourceUrl, 'прайс')} title="Скачать файл" style={{ padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700, background: src.bg, color: src.color, border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}>{src.label} ↓</button>
                    ) : (
                      <span style={{ padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700, background: src.bg, color: src.color }}>{src.label}</span>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.changedBy?.name || '—'}</span>
                </div>
              );
            })}
          </div>
          {pages > 1 && (
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
              {Array.from({ length: pages }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => setPage(p)} style={{ padding: '5px 11px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: p === page ? 800 : 400, background: p === page ? '#111' : '#f0f0f0', color: p === page ? '#fff' : '#555', fontSize: 13 }}>{p}</button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============ PHOTO TAB ============
function PhotoTab() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    setLoading(true);
    const params = { page, limit: LIMIT };
    if (search) params.search = search;
    if (source) params.source = source;
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo) params.dateTo = dateTo;
    adminGetPhotoLog(params)
      .then(r => { setLogs(r.data.logs); setTotal(r.data.total); setPages(r.data.pages || 1); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, search, source, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const reset = () => { setSearch(''); setSource(''); setDateFrom(''); setDateTo(''); setPage(1); };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Поиск по названию…" style={{ ...SEL, width: 220, padding: '7px 12px' }} />
        <select value={source} onChange={e => { setSource(e.target.value); setPage(1); }} style={SEL}>
          <option value="">Все источники</option>
          <option value="manual">Вручную</option>
          <option value="excel">Excel</option>
          <option value="api">API</option>
        </select>
        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} style={SEL} />
        <span style={{ color: '#aaa', fontSize: 12 }}>—</span>
        <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} style={SEL} />
        {(search || source || dateFrom || dateTo) && (
          <button onClick={reset} style={{ padding: '6px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', background: '#fee', color: '#c00', fontSize: 12, fontWeight: 700 }}>✕ Сбросить</button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#888' }}>{loading ? '…' : `${total} записей`}</span>
      </div>

      {loading ? (
        <div style={{ color: '#aaa', fontSize: 14, textAlign: 'center', paddingTop: 60 }}>Загрузка…</div>
      ) : logs.length === 0 ? (
        <div style={{ color: '#bbb', fontSize: 14, textAlign: 'center', paddingTop: 60 }}>Записей нет</div>
      ) : (
        <>
          <div style={{ border: '1px solid var(--admin-line)', borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 60px 1fr 90px 1fr 120px', padding: '8px 14px', background: '#f7f6f3', borderBottom: '1px solid var(--admin-line)', fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              <span>Дата</span><span>Фото</span><span>Товар</span><span style={{ textAlign: 'center' }}>Источник</span><span>Файл-источник</span><span>Кто</span>
            </div>
            {logs.map(log => {
              const src = SOURCE_LABEL[log.source] || { label: log.source, bg: '#f5f5f5', color: '#666' };
              return (
                <div key={log._id} style={{ display: 'grid', gridTemplateColumns: '140px 60px 1fr 90px 1fr 120px', padding: '9px 14px', borderBottom: '1px solid var(--admin-line)', alignItems: 'center', fontSize: 13 }}
                  onMouseEnter={e => e.currentTarget.style.background = '#faf9f6'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <span style={{ fontSize: 11, color: '#888' }}>{fmt(log.createdAt)}</span>
                  <div>
                    {log.imageUrl ? (
                      <a href={log.imageUrl} target="_blank" rel="noopener noreferrer">
                        <img src={log.imageUrl} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, border: '1px solid #eee' }} />
                      </a>
                    ) : (
                      <div style={{ width: 40, height: 40, background: '#f5f5f5', borderRadius: 6 }} />
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.productName || '—'}</div>
                    {log.sku && <div style={{ fontSize: 10, color: '#bbb' }}>{log.sku}</div>}
                  </div>
                  <div style={{ textAlign: 'center' }}><span style={{ padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700, background: src.bg, color: src.color }}>{src.label}</span></div>
                  <div style={{ fontSize: 11, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.sourceFile || '—'}</div>
                  <span style={{ fontSize: 11, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.changedBy?.name || '—'}</span>
                </div>
              );
            })}
          </div>
          {pages > 1 && (
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
              {Array.from({ length: pages }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => setPage(p)} style={{ padding: '5px 11px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: p === page ? 800 : 400, background: p === page ? '#111' : '#f0f0f0', color: p === page ? '#fff' : '#555', fontSize: 13 }}>{p}</button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============ CHANGES TAB ============
function ChangesTab() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    adminGetChangelog({ limit: 200 })
      .then(r => { setLogs(r.data.logs); setTotal(r.data.total); })
      .finally(() => setLoading(false));
  }, []);

  const filtered = search
    ? logs.filter(l => l.productName?.toLowerCase().includes(search.toLowerCase()) || l.changedBy?.name?.toLowerCase().includes(search.toLowerCase()))
    : logs;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по товару или пользователю..." style={{ ...SEL, width: 320, padding: '7px 12px' }} />
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#888' }}>{loading ? '…' : `${total} записей`}</span>
      </div>

      {loading ? (
        <div style={{ color: '#aaa', fontSize: 14, textAlign: 'center', paddingTop: 60 }}>Загрузка…</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: '#bbb', fontSize: 14, textAlign: 'center', paddingTop: 60 }}>История изменений пуста</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(log => (
            <div key={log._id} style={{ background: '#fff', border: '1px solid var(--admin-line)', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', background: '#f7f6f3', borderBottom: '1px solid var(--admin-line)', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#000' }}>📦 {log.productName}</div>
                  <div style={{ fontSize: 12, color: 'var(--slate)', marginTop: 2 }}>ID: {log.productId}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>👤 {log.changedBy?.name || '—'}</div>
                  <div style={{ fontSize: 12, color: 'var(--slate)' }}>{log.changedBy?.email}</div>
                  <div style={{ fontSize: 12, color: 'var(--slate)' }}>🕐 {fmt(log.createdAt)}</div>
                </div>
              </div>
              <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {log.changes.map((c, i) => {
                  const isPhotos = isImageArray(c.from) || isImageArray(c.to);
                  return (
                    <div key={i}>
                      <div style={{ fontWeight: 600, color: '#555', fontSize: 13, marginBottom: 6 }}>{c.field}</div>
                      {isPhotos ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 24px 1fr', gap: 8, alignItems: 'start' }}>
                          <ImageList urls={c.from} bg="#fff0f0" />
                          <div style={{ textAlign: 'center', color: 'var(--slate)', paddingTop: 8 }}>→</div>
                          <ImageList urls={c.to} bg="#f0fff4" />
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 24px 1fr', gap: 8, alignItems: 'start', fontSize: 13 }}>
                          <div style={{ background: '#fff0f0', borderRadius: 6, padding: '4px 10px', color: '#c0392b', wordBreak: 'break-word' }}>{formatValue(c.from)}</div>
                          <div style={{ textAlign: 'center', color: 'var(--slate)', paddingTop: 4 }}>→</div>
                          <div style={{ background: '#f0fff4', borderRadius: 6, padding: '4px 10px', color: '#2d7a3a', wordBreak: 'break-word' }}>{formatValue(c.to)}</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ PRODUCTS TAB ============
function ProductsTab() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [source, setSource] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    setLoading(true);
    const params = { page, limit: LIMIT };
    if (search) params.search = search;
    if (action) params.action = action;
    if (source) params.source = source;
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo) params.dateTo = dateTo;
    adminGetProductLog(params)
      .then(r => { setLogs(r.data.logs); setTotal(r.data.total); setPages(r.data.pages || 1); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, search, action, source, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const reset = () => { setSearch(''); setAction(''); setSource(''); setDateFrom(''); setDateTo(''); setPage(1); };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Поиск по названию…" style={{ ...SEL, minWidth: 200 }} />
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
        <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} style={SEL} />
        <button onClick={reset} style={{ ...SEL, color: '#888', background: '#f5f5f5' }}>Сбросить</button>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#888' }}>{loading ? '…' : `${total} записей`}</span>
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
                const sm = SOURCE_LABEL[log.source] || {};
                return (
                  <tr key={log._id} style={{ borderBottom: '1px solid var(--admin-line)', background: i % 2 === 0 ? '#fff' : '#faf9f6' }}>
                    <td style={{ padding: '9px 14px', color: '#888', whiteSpace: 'nowrap', fontSize: 12 }}>{fmt(log.createdAt)}</td>
                    <td style={{ padding: '9px 14px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: am.bg, color: am.color }}>{am.label || log.action}</span>
                    </td>
                    <td style={{ padding: '9px 14px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: sm.bg, color: sm.color }}>{sm.label || log.source}</span>
                    </td>
                    <td style={{ padding: '9px 14px', fontWeight: 500, color: '#1c1c1c', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.productName}
                      {log.sku && <span style={{ color: '#aaa', fontSize: 11, marginLeft: 6 }}>{log.sku}</span>}
                    </td>
                    <td style={{ padding: '9px 14px', color: '#888', fontSize: 12 }}>{BRAND_LABELS[log.brand] || log.brand || '—'}</td>
                    <td style={{ padding: '9px 14px', color: '#888', fontSize: 12, whiteSpace: 'nowrap' }}>{log.changedBy?.name || '—'}</td>
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
            <button key={p} onClick={() => setPage(p)} style={{ padding: '6px 12px', borderRadius: 6, border: '1.5px solid #e0e0e0', background: p === page ? '#1c1c1c' : '#fff', color: p === page ? '#fff' : '#333', cursor: 'pointer', fontWeight: p === page ? 700 : 500, fontSize: 13 }}>{p}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ MAIN COMPONENT ============
export default function AdminHistory() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'stock';

  const setTab = (tab) => {
    setSearchParams({ tab });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', paddingBottom: 18, borderBottom: '1px solid var(--admin-line)', marginBottom: 20 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: '0 4px', color: '#888' }}>←</button>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#111' }}>📜 История</div>
          <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>Все изменения в системе</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap', borderBottom: '1px solid var(--admin-line)', paddingBottom: 12 }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setTab(tab.key)}
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              border: 'none',
              cursor: 'pointer',
              fontWeight: activeTab === tab.key ? 700 : 500,
              fontSize: 14,
              background: activeTab === tab.key ? '#111' : '#f5f5f5',
              color: activeTab === tab.key ? '#fff' : '#555',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.2s',
            }}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'stock' && <StockTab />}
      {activeTab === 'price' && <PriceTab />}
      {activeTab === 'photo' && <PhotoTab />}
      {activeTab === 'changes' && <ChangesTab />}
      {activeTab === 'products' && <ProductsTab />}
    </div>
  );
}
