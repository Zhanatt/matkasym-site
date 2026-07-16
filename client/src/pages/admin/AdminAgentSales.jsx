import { useState, useEffect, useCallback } from 'react';
import { adminGetAgentSales, adminUploadSales } from '../../api';

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
  const [expandedSet, setExpandedSet] = useState({}); // сет → true (показать товары сета)
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState(null); // { ok, text }
  const [uploadOpen, setUploadOpen] = useState(false);
  const [agentsSel, setAgentsSel] = useState(null); // File — «по агентам»
  const [uploadMode, setUploadMode] = useState('day'); // 'day' | 'period'
  const [uploadDay, setUploadDay]   = useState(ymd(now));

  const load = useCallback(() => {
    setLoading(true);
    adminGetAgentSales({ dateFrom, dateTo, brand })
      .then(res => setData(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo, brand]);

  useEffect(() => { load(); }, [load]);
  // Смена фильтров сбрасывает раскрытые детали
  useEffect(() => { setExpanded({}); setExpandedSet({}); }, [dateFrom, dateTo, brand]);

  const toggleProducts = agent => setExpanded(p => ({ ...p, [agent]: !p[agent] }));

  const handleSubmitUpload = () => {
    if (!agentsSel) { setUploadMsg({ ok: false, text: 'Выбери файл «Отчёт по агентам»' }); return; }
    const effFrom = uploadMode === 'day' ? uploadDay : dateFrom;
    const effTo   = uploadMode === 'day' ? uploadDay : dateTo;
    if (!effFrom || !effTo) { setUploadMsg({ ok: false, text: uploadMode === 'day' ? 'Выбери день' : 'Выбери период (даты сверху)' }); return; }
    setUploading(true);
    setUploadMsg(null);
    adminUploadSales(agentsSel, effFrom, effTo)
      .then(res => {
        const d = res.data;
        setUploadMsg({
          ok: true,
          text: `Загружено строк: ${d.inserted}, агентов: ${d.agents}. Сопоставлено с товарами: ${d.matched}${d.unmatched ? `, без сопоставления: ${d.unmatched}` : ''}.`,
          link: d.sourceUrl || '',
        });
        setUploadOpen(false); setAgentsSel(null);
        // Показать то, что только что загрузили
        if (uploadMode === 'day') { setDateFrom(uploadDay); setDateTo(uploadDay); }
        load();
      })
      .catch(err => setUploadMsg({ ok: false, text: err.response?.data?.error || 'Ошибка загрузки' }))
      .finally(() => setUploading(false));
  };

  const inputStyle = {
    padding: '8px 10px', borderRadius: 10, border: '1.5px solid #e5e5e5',
    fontSize: 14, background: '#fff', outline: 'none',
  };

  // Разделяем продажи и возвраты: строка-возврат = кол-во/сумма < 0.
  const isReturn = p => p.qty < 0 || p.sum < 0;
  const sales   = { sum: 0, qty: 0, pos: 0 };
  const returns = { sum: 0, qty: 0, pos: 0 };
  (data?.sets || []).forEach(s => s.products.forEach(p => {
    if (isReturn(p)) { returns.sum += p.sum; returns.qty += p.qty; returns.pos++; }
    else             { sales.sum   += p.sum; sales.qty   += p.qty; sales.pos++; }
  }));

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
          <button
            onClick={() => { setUploadOpen(true); setUploadMsg(null); }}
            disabled={uploading}
            style={{
              padding: '10px 18px', borderRadius: 10, border: 'none', cursor: uploading ? 'default' : 'pointer',
              background: '#111', color: '#fff', fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap',
              opacity: uploading ? 0.6 : 1,
            }}
          >⬆️ Загрузить таблицы из 1С</button>
          <span style={{ fontSize: 11, color: '#bbb', maxWidth: 220, textAlign: 'right' }}>
            За период, что выбран выше
          </span>
        </div>
      </div>

      {/* Модалка загрузки двух файлов */}
      {uploadOpen && (
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 }}
          onClick={() => !uploading && setUploadOpen(false)}
        >
          <div style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 460, padding: 22 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#111', marginBottom: 12 }}>Загрузка из 1С</div>

            {/* Режим: за один день / за период */}
            <div style={{ display: 'flex', background: '#f0f0ee', borderRadius: 10, padding: 3, gap: 3, marginBottom: 12 }}>
              {[{ k: 'day', l: '📅 За один день' }, { k: 'period', l: '📆 За период' }].map(m => (
                <button key={m.k} onClick={() => setUploadMode(m.k)} style={{
                  flex: 1, padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                  background: uploadMode === m.k ? '#fff' : 'transparent',
                  color: uploadMode === m.k ? '#111' : '#888',
                  boxShadow: uploadMode === m.k ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
                }}>{m.l}</button>
              ))}
            </div>

            {uploadMode === 'day' ? (
              <div style={{ marginBottom: 16, padding: '12px 14px', background: '#f7f8fa', borderRadius: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#111', marginBottom: 6 }}>Дата</div>
                <input type="date" value={uploadDay} onChange={e => setUploadDay(e.target.value)} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
                <div style={{ fontSize: 11.5, color: '#999', marginTop: 6 }}>
                  В 1С сформируй «Сводную» ровно за этот день (в отчёте период <b>{uploadDay}–{uploadDay}</b>) и загрузи. Данные лягут на эту дату.
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: '#888', marginBottom: 16, padding: '12px 14px', background: '#f7f8fa', borderRadius: 10 }}>
                Период: <b>{dateFrom}</b> — <b>{dateTo}</b> (меняется вверху страницы). Все продажи лягут на дату <b>{dateTo}</b> одним блоком — фильтр по дням внутри не сработает.
              </div>
            )}

            {/* Файл — по агентам */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#111', marginBottom: 4 }}>Файл отчёта</div>
              <div style={{ fontSize: 11.5, color: '#999', marginBottom: 6 }}>«Сводная продаж по агентам (по номенклатуре)» — товары, количество, сумма</div>
              <input type="file" accept=".xls,.xlsx" onChange={e => setAgentsSel(e.target.files?.[0] || null)} />
              {agentsSel && <div style={{ fontSize: 12, color: '#2d7a3a', marginTop: 4 }}>✓ {agentsSel.name}</div>}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setUploadOpen(false)} disabled={uploading}
                style={{ padding: '10px 18px', borderRadius: 10, border: '1.5px solid #e5e5e5', background: '#fff', color: '#555', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Отмена</button>
              <button onClick={handleSubmitUpload} disabled={uploading || !agentsSel}
                style={{ padding: '10px 22px', borderRadius: 10, border: 'none', background: '#111', color: '#fff', fontSize: 14, fontWeight: 700, cursor: uploading || !agentsSel ? 'default' : 'pointer', opacity: uploading || !agentsSel ? 0.5 : 1 }}>
                {uploading ? 'Загрузка…' : 'Загрузить'}</button>
            </div>
          </div>
        </div>
      )}

      {uploadMsg && (
        <div style={{
          marginBottom: 16, padding: '10px 14px', borderRadius: 10, fontSize: 13.5,
          background: uploadMsg.ok ? '#e8f5e9' : '#fff5f5',
          color: uploadMsg.ok ? '#2d7a3a' : '#c0392b',
          border: `1px solid ${uploadMsg.ok ? '#bfe6c8' : '#f5c6c6'}`,
        }}>
          {uploadMsg.ok ? '✅ ' : '⚠️ '}{uploadMsg.text}
          {uploadMsg.link && (
            <div style={{ marginTop: 6, fontSize: 11.5, color: '#888', wordBreak: 'break-all' }}>
              Файл: {uploadMsg.link}
            </div>
          )}
        </div>
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

      {/* Итоги: Продажи · Возвраты · Агенты */}
      {data && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          {/* Продажи */}
          <div style={{ flex: '1 1 250px', background: '#fff', border: '1px solid #eee', borderRadius: 14, padding: '16px 18px' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#27ae60', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>💰 Продажи</div>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11.5, color: '#aaa' }}>Сумма</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#27ae60' }}>{money(sales.sum)} <span style={{ fontSize: 12, color: '#bbb' }}>сом</span></div>
              </div>
              <div>
                <div style={{ fontSize: 11.5, color: '#aaa' }}>Штук</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#3498db' }}>{money(sales.qty)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11.5, color: '#aaa' }}>Позиций</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#e67e22' }}>{money(sales.pos)}</div>
              </div>
            </div>
          </div>

          {/* Возвраты */}
          <div style={{ flex: '1 1 250px', background: '#fff', border: '1px solid #eee', borderRadius: 14, padding: '16px 18px' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#c0392b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>↩ Возвраты</div>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11.5, color: '#c9a' }}>Сумма</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#c0392b' }}>{money(Math.abs(returns.sum))} <span style={{ fontSize: 12, color: '#d9a' }}>сом</span></div>
              </div>
              <div>
                <div style={{ fontSize: 11.5, color: '#c9a' }}>Штук</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#c0392b' }}>{money(Math.abs(returns.qty))}</div>
              </div>
              <div>
                <div style={{ fontSize: 11.5, color: '#c9a' }}>Позиций</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#c0392b' }}>{money(returns.pos)}</div>
              </div>
            </div>
          </div>

          {/* Агенты */}
          <div style={{ flex: '1 1 120px', background: '#fff', border: '1px solid #eee', borderRadius: 14, padding: '16px 18px' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>👤 Агенты</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#111' }}>{data.agents.length}</div>
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
              ? <>Загруженные продажи: с {fmtDate(data.dataRange.min)} по {fmtDate(data.dataRange.max)}, а выбран другой период выше.</>
              : <>Продажи из 1С ещё не синхронизированы. Данные появятся, когда заработает выгрузка из 1С на сайт (эндпоинт <code>/api/admin/sync-sales</code>).</>}
          </div>
          {data?.dataRange && (
            <button
              onClick={() => { setDateFrom(ymd(new Date(data.dataRange.min))); setDateTo(ymd(new Date(data.dataRange.max))); }}
              style={{ marginTop: 16, padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', background: '#111', color: '#fff', fontSize: 14, fontWeight: 700 }}
            >📅 Показать за загруженный период</button>
          )}
        </div>
      ) : view === 'agents' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {data.agents.map(a => {
            const isOpen = expanded[a.agent];
            const agentReturns = a.products.filter(isReturn).length;
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
                    {agentReturns > 0 && (
                      <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 800, color: '#c0392b', background: '#fdecec', borderRadius: 20, padding: '1px 7px', whiteSpace: 'nowrap' }}>↩ {agentReturns} возвр.</span>
                    )}
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
                            <td style={{ padding: '6px 4px', color: '#333' }}>
                              {p.productName}
                              {isReturn(p) && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 800, color: '#c0392b', background: '#fdecec', borderRadius: 20, padding: '1px 7px' }}>возврат</span>}
                            </td>
                            <td style={{ padding: '6px 4px', textAlign: 'right', color: p.qty < 0 ? '#c0392b' : '#333', fontWeight: 600 }}>{money(p.qty)}</td>
                            <td style={{ padding: '6px 4px', textAlign: 'right', color: p.sum < 0 ? '#c0392b' : '#111', fontWeight: 600 }}>{money(p.sum)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* ── По сетам ── товары по сетам, строка раскрывается в список товаров */
        (() => {
          const SETGRID = '28px 1fr 84px 78px 96px 108px';
          return (
        <div style={{ border: '1px solid #eee', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
          <div style={{ display: 'grid', gridTemplateColumns: SETGRID, padding: '9px 16px', background: '#f7f8fa', borderBottom: '1px solid #eee', fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            <span>#</span><span>Сет</span>
            <span style={{ textAlign: 'right' }}>% от итога</span>
            <span style={{ textAlign: 'right' }}>Позиций</span>
            <span style={{ textAlign: 'right' }}>Продано, шт</span>
            <span style={{ textAlign: 'right' }}>Сумма</span>
          </div>
          {data.sets.map((s, i) => {
            const pct = data.grandQty > 0 ? Math.round(s.qty / data.grandQty * 100) : 0;
            const color = LINE_COLORS[i % LINE_COLORS.length];
            const key = (s.set || 'none') + '|' + s.brand + '|' + i;
            const isOpen = expandedSet[key];
            const setReturns = s.products.filter(isReturn).length;
            return (
              <div key={key}>
                <div
                  onClick={() => setExpandedSet(p => ({ ...p, [key]: !p[key] }))}
                  style={{ display: 'grid', gridTemplateColumns: SETGRID, padding: '10px 16px', borderBottom: '1px solid #f5f5f5', fontSize: 13, alignItems: 'center', cursor: 'pointer', background: isOpen ? '#f7fbff' : 'transparent' }}
                  onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = '#fafafa'; }}
                  onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ fontSize: 11, color: '#ccc', fontWeight: 600 }}>{i + 1}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ fontSize: 11, color: '#bbb', width: 10, flexShrink: 0 }}>{isOpen ? '▼' : '▶'}</span>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{setLabel(s.set)}</span>
                    {setReturns > 0 && (
                      <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 800, color: '#c0392b', background: '#fdecec', borderRadius: 20, padding: '1px 7px', whiteSpace: 'nowrap' }}>↩ {setReturns} возвр.</span>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: 11, color: '#aaa' }}>{pct}%</span>
                    <div style={{ height: 3, background: '#f0f0f0', borderRadius: 2, marginTop: 3 }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
                    </div>
                  </div>
                  <span style={{ textAlign: 'right', fontWeight: 600, color: '#555' }}>{s.positions}</span>
                  <span style={{ textAlign: 'right', fontWeight: 700, color: s.qty < 0 ? '#c0392b' : '#1e7e34' }}>{money(s.qty)} шт</span>
                  <span style={{ textAlign: 'right', fontWeight: 600, color: '#111' }}>{money(s.sum)}</span>
                </div>

                {isOpen && (
                  <div style={{ background: '#fafafa', padding: '4px 16px 12px 44px', borderBottom: '1px solid #f0f0f0' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                      <thead>
                        <tr style={{ color: '#aaa', textAlign: 'left' }}>
                          <th style={{ fontWeight: 600, padding: '6px 4px' }}>Товар</th>
                          <th style={{ fontWeight: 600, padding: '6px 4px', textAlign: 'right', width: 70 }}>Кол-во</th>
                          <th style={{ fontWeight: 600, padding: '6px 4px', textAlign: 'right', width: 100 }}>Сумма</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.products.map((p, j) => (
                          <tr key={j} style={{ borderTop: '1px solid #eee' }}>
                            <td style={{ padding: '5px 4px', color: '#333' }}>
                              {p.productName}
                              {isReturn(p) && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 800, color: '#c0392b', background: '#fdecec', borderRadius: 20, padding: '1px 7px' }}>возврат</span>}
                            </td>
                            <td style={{ padding: '5px 4px', textAlign: 'right', fontWeight: 600, color: p.qty < 0 ? '#c0392b' : '#333' }}>{money(p.qty)}</td>
                            <td style={{ padding: '5px 4px', textAlign: 'right', fontWeight: 600, color: p.sum < 0 ? '#c0392b' : '#111' }}>{money(p.sum)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ display: 'grid', gridTemplateColumns: SETGRID, padding: '11px 16px', background: '#f7f8fa', fontSize: 13 }}>
            <span /><span style={{ fontWeight: 700, color: '#111' }}>Итого</span><span />
            <span style={{ textAlign: 'right', fontWeight: 800, color: '#555' }}>{data.sets.reduce((n, s) => n + s.positions, 0)}</span>
            <span style={{ textAlign: 'right', fontWeight: 800, color: '#1e7e34' }}>{money(data.grandQty)} шт</span>
            <span style={{ textAlign: 'right', fontWeight: 800, color: '#111' }}>{money(data.grandSum)}</span>
          </div>
        </div>
          );
        })()
      )}
    </div>
  );
}
