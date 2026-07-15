import { useState, useEffect, useCallback, useRef } from 'react';
import { adminGetAgentSales, adminGetAgentSalesDocs, adminUploadSales } from '../../api';

const SET_NAMES = {
  'achyk-asman': 'Achyk Asman', 'den-sooluk': 'Den Sooluk', 'zhashyl-ömür': 'Zhashyl Omur',
  'jenil-ashkana': 'Jenil Ashkana', 'konok-keldi': 'Konok Keldi', 'korkom-aiym': 'Korkom Aiym',
  'kosh-keliniz': 'Kosh Keliniz', 'onoi-sakta': 'Onoi Sakta', 'baary-oorunda': 'Baary Oorunda',
  'sanarip-tv': 'Sanarip TV', 'shirin-balalyk': 'Shirin Balalyk', 'taza-kiym': 'Taza Kiym',
  'uydo-ishtoo': 'Uydo Ishtoo', 'mazza-seiyl': 'Mazza Seiyl', '0-tashtandy': '0-Tashtandy',
  'bekem-fasad': 'Bekem Fasad', 'bilim-kelechek': 'Bilim Kelechek', 'kooz-koopsuzduk': 'Kooz Koopsuzduk',
  'uzak-koldon': 'Uzak Koldon', 'önügüü-set': 'Onuguu Set', 'dayar-tütük': 'Dayar Tutuk',
};
const setLabel = slug => !slug ? '(без сета)' : (SET_NAMES[slug] || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));

const LINE_COLORS = [
  '#DC1E24','#3463A3','#2ECC71','#F39C12','#9B59B6','#1ABC9C','#E67E22','#34495E',
  '#E91E63','#00BCD4','#8BC34A','#FF5722','#607D8B','#795548','#673AB7',
];

const money = n => (n || 0).toLocaleString('ru-RU');
const fmtDateTime = d => new Date(d).toLocaleString('ru-RU', {
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});
const fmtDate = d => new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

// Локальная дата YYYY-MM-DD (без UTC-сдвига)
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const BRANDS = [
  { v: '', l: 'Все бренды' },
  { v: 'matkasym-home', l: 'HOME' },
  { v: 'matkasym-shaar', l: 'SHAAR' },
];

export default function AdminAgentSales() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [dateFrom, setDateFrom] = useState(ymd(monthStart));
  const [dateTo, setDateTo]     = useState(ymd(now));
  const [brand, setBrand]       = useState('');
  const [view, setView]         = useState('sets'); // sets | agents
  const [loading, setLoading]   = useState(true);
  const [data, setData]         = useState(null);
  const [expanded, setExpanded] = useState({});   // agent → true (показать товары)
  const [docsByAgent, setDocsByAgent] = useState({}); // agent → { loading, docs }
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState(null); // { ok, text }
  const fileRef = useRef(null);

  const load = useCallback(() => {
    setLoading(true);
    adminGetAgentSales({ dateFrom, dateTo, brand })
      .then(res => setData(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo, brand]);

  useEffect(() => { load(); }, [load]);
  // Смена фильтров сбрасывает раскрытые детали
  useEffect(() => { setExpanded({}); setDocsByAgent({}); }, [dateFrom, dateTo, brand]);

  const toggleProducts = agent => setExpanded(p => ({ ...p, [agent]: !p[agent] }));

  const loadDocs = agent => {
    if (docsByAgent[agent]) { // повторный клик — скрыть
      setDocsByAgent(p => { const n = { ...p }; delete n[agent]; return n; });
      return;
    }
    setDocsByAgent(p => ({ ...p, [agent]: { loading: true, docs: [] } }));
    adminGetAgentSalesDocs({ agent, dateFrom, dateTo, brand })
      .then(res => setDocsByAgent(p => ({ ...p, [agent]: { loading: false, docs: res.data.docs } })))
      .catch(() => setDocsByAgent(p => ({ ...p, [agent]: { loading: false, docs: [] } })));
  };

  const handleUpload = e => {
    const file = e.target.files?.[0];
    e.target.value = ''; // позволить повторно выбрать тот же файл
    if (!file) return;
    if (!dateFrom || !dateTo) { setUploadMsg({ ok: false, text: 'Сначала выбери период (даты сверху)' }); return; }
    setUploading(true);
    setUploadMsg(null);
    adminUploadSales(file, dateFrom, dateTo)
      .then(res => {
        const d = res.data;
        setUploadMsg({ ok: true, text: `Загружено строк: ${d.inserted}, агентов: ${d.agents}. Сопоставлено с товарами: ${d.matched}${d.unmatched ? `, без сопоставления: ${d.unmatched}` : ''}.` });
        load();
      })
      .catch(err => setUploadMsg({ ok: false, text: err.response?.data?.error || 'Ошибка загрузки' }))
      .finally(() => setUploading(false));
  };

  const inputStyle = {
    padding: '8px 10px', borderRadius: 10, border: '1.5px solid #e5e5e5',
    fontSize: 14, background: '#fff', outline: 'none',
  };

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#111', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            🧾 Продажи по агентам
          </h1>
          <p style={{ fontSize: 14, color: '#888', marginTop: 4 }}>
            Точные данные из 1С (отчёт «Сводная продаж по агентам») — не по остаткам
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <input ref={fileRef} type="file" accept=".xls,.xlsx" onChange={handleUpload} style={{ display: 'none' }} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{
              padding: '10px 18px', borderRadius: 10, border: 'none', cursor: uploading ? 'default' : 'pointer',
              background: '#111', color: '#fff', fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap',
              opacity: uploading ? 0.6 : 1,
            }}
          >{uploading ? 'Загрузка…' : '⬆️ Загрузить таблицу из 1С'}</button>
          <span style={{ fontSize: 11, color: '#bbb', maxWidth: 220, textAlign: 'right' }}>
            Отчёт «Сводная продаж по агентам (по номенклатуре)» за период, что выбран выше
          </span>
        </div>
      </div>

      {uploadMsg && (
        <div style={{
          marginBottom: 16, padding: '10px 14px', borderRadius: 10, fontSize: 13.5,
          background: uploadMsg.ok ? '#e8f5e9' : '#fff5f5',
          color: uploadMsg.ok ? '#2d7a3a' : '#c0392b',
          border: `1px solid ${uploadMsg.ok ? '#bfe6c8' : '#f5c6c6'}`,
        }}>{uploadMsg.ok ? '✅ ' : '⚠️ '}{uploadMsg.text}</div>
      )}

      {/* Фильтры */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inputStyle} />
        <span style={{ color: '#aaa' }}>—</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inputStyle} />
        <select value={brand} onChange={e => setBrand(e.target.value)} style={{ ...inputStyle, fontWeight: 600 }}>
          {BRANDS.map(b => <option key={b.v} value={b.v}>{b.l}</option>)}
        </select>
      </div>

      {/* Итоги */}
      {data && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          <div style={{ flex: '1 1 160px', background: '#fff', border: '1px solid #eee', borderRadius: 14, padding: '14px 18px' }}>
            <div style={{ fontSize: 13, color: '#888' }}>Сумма продаж</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#27ae60' }}>{money(data.grandSum)} <span style={{ fontSize: 14, color: '#aaa' }}>сом</span></div>
          </div>
          <div style={{ flex: '1 1 160px', background: '#fff', border: '1px solid #eee', borderRadius: 14, padding: '14px 18px' }}>
            <div style={{ fontSize: 13, color: '#888' }}>Продано штук</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#3498db' }}>{money(data.grandQty)}</div>
          </div>
          <div style={{ flex: '1 1 160px', background: '#fff', border: '1px solid #eee', borderRadius: 14, padding: '14px 18px' }}>
            <div style={{ fontSize: 13, color: '#888' }}>Агентов</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#111' }}>{data.agents.length}</div>
          </div>
        </div>
      )}

      {/* Переключатель По сетам / По агентам */}
      {data && (data.sets?.length > 0 || data.agents.length > 0) && (
        <div style={{ display: 'inline-flex', background: '#f0f0ee', borderRadius: 10, padding: 3, gap: 3, marginBottom: 16 }}>
          {[{ k: 'sets', l: '📦 По сетам' }, { k: 'agents', l: '👤 По агентам' }].map(t => (
            <button key={t.k} onClick={() => setView(t.k)} style={{
              padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 700,
              background: view === t.k ? '#fff' : 'transparent',
              color: view === t.k ? '#111' : '#888',
              boxShadow: view === t.k ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
            }}>{t.l}</button>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>Загрузка...</div>
      ) : !data || (data.agents.length === 0 && (data.sets?.length || 0) === 0) ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', background: '#fff', borderRadius: 16, border: '1px solid #eee' }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#111', marginBottom: 6 }}>Нет данных за этот период</div>
          <div style={{ fontSize: 13, color: '#999', maxWidth: 460, margin: '0 auto' }}>
            {data?.dataRange
              ? <>Загруженные продажи: с {fmtDate(data.dataRange.min)} по {fmtDate(data.dataRange.max)}. Измени период выше.</>
              : <>Продажи из 1С ещё не синхронизированы. Данные появятся, когда заработает выгрузка из 1С на сайт (эндпоинт <code>/api/admin/sync-sales</code>).</>}
          </div>
        </div>
      ) : view === 'agents' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {data.agents.map(a => {
            const isOpen = expanded[a.agent];
            const docState = docsByAgent[a.agent];
            return (
              <div key={a.agent} style={{ background: '#fff', border: '1px solid #eee', borderRadius: 14, overflow: 'hidden' }}>
                {/* Шапка агента */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
                  <button onClick={() => toggleProducts(a.agent)} style={{
                    flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <span style={{ fontSize: 13, color: '#bbb', width: 14 }}>{isOpen ? '▼' : '▶'}</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.agent}
                    </span>
                  </button>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#27ae60' }}>{money(a.totalSum)} <span style={{ fontSize: 12, color: '#bbb' }}>сом</span></div>
                    <div style={{ fontSize: 12, color: '#999' }}>{money(a.totalQty)} шт · {a.products.length} поз.</div>
                  </div>
                </div>

                {/* Товары агента */}
                {isOpen && (
                  <div style={{ borderTop: '1px solid #f2f2f2', padding: '6px 16px 12px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ color: '#aaa', textAlign: 'left' }}>
                          <th style={{ fontWeight: 600, padding: '6px 4px' }}>Товар</th>
                          <th style={{ fontWeight: 600, padding: '6px 4px', textAlign: 'right', width: 70 }}>Кол-во</th>
                          <th style={{ fontWeight: 600, padding: '6px 4px', textAlign: 'right', width: 110 }}>Сумма</th>
                        </tr>
                      </thead>
                      <tbody>
                        {a.products.map((p, i) => (
                          <tr key={i} style={{ borderTop: '1px solid #f7f7f7' }}>
                            <td style={{ padding: '6px 4px', color: '#333' }}>{p.productName}</td>
                            <td style={{ padding: '6px 4px', textAlign: 'right', color: p.qty < 0 ? '#c0392b' : '#333', fontWeight: 600 }}>{money(p.qty)}</td>
                            <td style={{ padding: '6px 4px', textAlign: 'right', color: p.sum < 0 ? '#c0392b' : '#111', fontWeight: 600 }}>{money(p.sum)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <button onClick={() => loadDocs(a.agent)} style={{
                      marginTop: 10, padding: '8px 14px', borderRadius: 9, cursor: 'pointer',
                      border: '1.5px solid #e5e5e5', background: docState ? '#f0f0ee' : '#fff',
                      fontSize: 13, fontWeight: 700, color: '#555',
                    }}>
                      {docState ? '▲ Скрыть накладные' : '📄 Накладные (дата и время)'}
                    </button>

                    {/* Накладные — детализация с датой/временем */}
                    {docState && (
                      <div style={{ marginTop: 10 }}>
                        {docState.loading ? (
                          <div style={{ color: '#999', fontSize: 13, padding: 8 }}>Загрузка накладных...</div>
                        ) : docState.docs.length === 0 ? (
                          <div style={{ color: '#999', fontSize: 13, padding: 8 }}>Накладных нет</div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {docState.docs.map((d, i) => (
                              <div key={i} style={{ background: '#fafaf8', borderRadius: 10, padding: '10px 12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                                  <div style={{ fontSize: 12.5, color: '#111', fontWeight: 700 }}>
                                    №{d.docNumber || '—'} · <span style={{ color: '#e67e22' }}>{fmtDateTime(d.docDate)}</span>
                                  </div>
                                  <div style={{ fontSize: 13, fontWeight: 800, color: '#27ae60' }}>{money(d.totalSum)} сом</div>
                                </div>
                                {d.counterparty && <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Покупатель: {d.counterparty}</div>}
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                                  <tbody>
                                    {d.lines.map((l, j) => (
                                      <tr key={j} style={{ borderTop: '1px solid #eee' }}>
                                        <td style={{ padding: '4px 4px', color: '#444' }}>{l.productName}</td>
                                        <td style={{ padding: '4px 4px', textAlign: 'right', width: 60, color: '#666' }}>{money(l.qty)} шт</td>
                                        <td style={{ padding: '4px 4px', textAlign: 'right', width: 90, fontWeight: 600, color: '#111' }}>{money(l.sum)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* ── По сетам ── точное кол-во проданных позиций по сетам */
        <div style={{ border: '1px solid #eee', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 90px 110px 120px', padding: '9px 16px', background: '#f7f8fa', borderBottom: '1px solid #eee', fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            <span>#</span><span>Сет</span>
            <span style={{ textAlign: 'right' }}>% от итога</span>
            <span style={{ textAlign: 'right' }}>Продано, шт</span>
            <span style={{ textAlign: 'right' }}>Сумма</span>
          </div>
          {data.sets.map((s, i) => {
            const pct = data.grandQty > 0 ? Math.round(s.qty / data.grandQty * 100) : 0;
            const color = LINE_COLORS[i % LINE_COLORS.length];
            return (
              <div key={(s.set || 'none') + i} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 90px 110px 120px', padding: '10px 16px', borderBottom: '1px solid #f5f5f5', fontSize: 13, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#ccc', fontWeight: 600 }}>{i + 1}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{setLabel(s.set)}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 11, color: '#aaa' }}>{pct}%</span>
                  <div style={{ height: 3, background: '#f0f0f0', borderRadius: 2, marginTop: 3 }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
                  </div>
                </div>
                <span style={{ textAlign: 'right', fontWeight: 700, color: s.qty < 0 ? '#c0392b' : '#1e7e34' }}>{money(s.qty)} шт</span>
                <span style={{ textAlign: 'right', fontWeight: 600, color: '#111' }}>{money(s.sum)}</span>
              </div>
            );
          })}
          <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 90px 110px 120px', padding: '11px 16px', background: '#f7f8fa', fontSize: 13 }}>
            <span /><span style={{ fontWeight: 700, color: '#111' }}>Итого</span><span />
            <span style={{ textAlign: 'right', fontWeight: 800, color: '#1e7e34' }}>{money(data.grandQty)} шт</span>
            <span style={{ textAlign: 'right', fontWeight: 800, color: '#111' }}>{money(data.grandSum)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
