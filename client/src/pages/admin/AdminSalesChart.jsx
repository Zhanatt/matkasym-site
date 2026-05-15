import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Label,
} from 'recharts';
import { adminGetSalesChart, adminGetSalesChartSet } from '../../api';

const SET_NAMES = {
  'achyk-asman':     'Achyk Asman',
  'den-sooluk':      'Den Sooluk',
  'zhashyl-ömür':    'Zhashyl Ömür',
  'jenil-ashkana':   'Jenil Ashkana',
  'konok-keldi':     'Konok Keldi',
  'korkom-aiym':     'Korkom Aiym',
  'kosh-keliniz':    'Kosh Keliniz',
  'onoi-sakta':      'Onoi Sakta',
  'baary-oorunda':   'Baary Oorunda',
  'sanarip-tv':      'Sanarip TV',
  'shirin-balalyk':  'Shirin Balalyk',
  'taza-kiym':       'Taza Kiym',
  'uydo-ishtoo':     'Uydo Ishtoo',
  'mazza-seiyl':     'Mazza Seiyl',
  '0-tashtandy':     '0-Tashtandy',
  'bekem-fasad':     'Bekem Fasad',
  'bilim-kelechek':  'Bilim Kelechek',
  'kooz-koopsuzduk': 'Kooz Koopsuzduk',
  'uzak-koldon':     'Uzak Koldon',
  'önügüü-set':      'Önügüü Set',
  'dayar-tütük':     'Dayar Tütük',
  'nelikvid':        'Неликвид',
  'samples':         'Образцы',
  'small-batch':     'Small Batch',
  'misc':            'Misc',
  'equipment':       'Equipment',
  'other':           'Прочее',
};

function setLabel(slug) {
  return SET_NAMES[slug] || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const LINE_COLORS = [
  '#DC1E24','#3463A3','#2ECC71','#F39C12','#9B59B6',
  '#1ABC9C','#E67E22','#34495E','#E91E63','#00BCD4',
  '#8BC34A','#FF5722','#607D8B','#795548','#673AB7',
];

const BRANDS = [
  { value: '',                label: 'Все бренды' },
  { value: 'matkasym-home',   label: 'HOME' },
  { value: 'matkasym-shaar',  label: 'SHAAR' },
  { value: 'matkasym-kyzmat', label: 'KYZMAT' },
];

const SEL = {
  padding: '6px 10px', borderRadius: 7, border: '1.5px solid #e0e0e0',
  fontSize: 12, background: '#fff', cursor: 'pointer', outline: 'none', color: '#333',
};

function fmtLabel(str, period) {
  if (!str) return str;
  if (period === 'day') {
    const [, m, d] = str.split('-');
    return `${d}.${m}`;
  }
  if (period === 'week') {
    const [y, w] = str.split('-');
    return `Нед.${w}'${y.slice(2)}`;
  }
  if (period === 'month') {
    const [y, m] = str.split('-');
    const months = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
    return `${months[Number(m) - 1]} '${y.slice(2)}`;
  }
  return str;
}

const STOCK_START_DATE = '2025-07-11'; // первый день когда добавили учёт остатков

function defaultFrom() { return STOCK_START_DATE; }
function defaultTo()   { return new Date().toISOString().slice(0, 10); }

// Custom tooltip
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const sorted = [...payload].filter(p => p.value > 0).sort((a, b) => b.value - a.value);
  return (
    <div style={{
      background: '#fff', border: '1px solid #e0e0e0', borderRadius: 10,
      padding: '10px 14px', boxShadow: '0 4px 16px rgba(0,0,0,.1)',
      minWidth: 160, maxWidth: 220,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#888', marginBottom: 6, textTransform: 'uppercase' }}>{label}</div>
      {sorted.map(p => (
        <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: '#444' }}>{setLabel(p.dataKey)}</span>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#111' }}>{p.value} шт</span>
        </div>
      ))}
      <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: '#aaa' }}>Итого</span>
        <span style={{ fontSize: 12, fontWeight: 800, color: '#1e7e34' }}>
          {sorted.reduce((s, p) => s + p.value, 0)} шт
        </span>
      </div>
    </div>
  );
}

export default function AdminSalesChart() {
  const navigate = useNavigate();

  const [period,   setPeriod]   = useState('day');
  const [brand,    setBrand]    = useState('');
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo,   setDateTo]   = useState(defaultTo);
  const [hidden,   setHidden]   = useState(new Set());
  const [drillSet, setDrillSet] = useState(null); // slug of set being drilled into

  const [data,      setData]      = useState(null);
  const [drillData, setDrillData] = useState(null);
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = { period };
    if (brand)    params.brand    = brand;
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo)   params.dateTo   = dateTo;
    adminGetSalesChart(params)
      .then(r => { setData(r.data); setError(''); })
      .catch(e => { setData(null); setError(e.response?.data?.error || 'Ошибка загрузки'); })
      .finally(() => setLoading(false));
  }, [period, brand, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const openDrill = useCallback((slug) => {
    setDrillSet(slug);
    setDrillData(null);
    const params = { period };
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo)   params.dateTo   = dateTo;
    adminGetSalesChartSet(slug, params)
      .then(r => setDrillData(r.data))
      .catch(() => setDrillData({ labels: [], datasets: [] }));
  }, [period, dateFrom, dateTo]);

  const chartRows = data
    ? data.labels.map((lbl, i) => {
        const row = { _label: fmtLabel(lbl, period), _raw: lbl };
        data.datasets.forEach(ds => { row[ds.set] = ds.data[i]; });
        return row;
      })
    : [];

  const totalBySets = data
    ? data.datasets
        .map(ds => ({ set: ds.set, total: ds.data.reduce((a, b) => a + b, 0) }))
        .filter(x => x.total > 0)
        .sort((a, b) => b.total - a.total)
    : [];

  const grandTotal = totalBySets.reduce((s, x) => s + x.total, 0);

  const toggleSet = (s) => {
    setHidden(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });
  };

  // Decide how many X ticks to show based on data length
  const tickInterval = chartRows.length > 30 ? Math.floor(chartRows.length / 15) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', paddingBottom: 18, borderBottom: '1px solid #eee', marginBottom: 20 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: '0 4px', color: '#888' }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#111' }}>📈 Продажи по сетам</div>
          <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>Кол-во проданных единиц (на основе уменьшений остатков)</div>
        </div>
        {grandTotal > 0 && (
          <div style={{ background: '#e8f5e9', borderRadius: 10, padding: '6px 14px', textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: '#aaa', fontWeight: 600, textTransform: 'uppercase' }}>За период</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#1e7e34' }}>{grandTotal.toLocaleString('ru')} шт</div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <div style={{ display: 'flex', background: '#f5f5f5', borderRadius: 8, padding: 3, gap: 0 }}>
          {[{ k:'day', l:'День' }, { k:'week', l:'Неделя' }, { k:'month', l:'Месяц' }].map(opt => (
            <button key={opt.k} onClick={() => setPeriod(opt.k)} style={{
              padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600,
              background: period === opt.k ? '#111' : 'transparent',
              color:      period === opt.k ? '#fff' : '#666',
            }}>{opt.l}</button>
          ))}
        </div>
        <select value={brand} onChange={e => setBrand(e.target.value)} style={SEL}>
          {BRANDS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={SEL} />
        <span style={{ color: '#aaa', fontSize: 12 }}>—</span>
        <input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   style={SEL} />
      </div>

      {loading && <div style={{ color: '#aaa', fontSize: 14, textAlign: 'center', paddingTop: 60 }}>Загрузка…</div>}
      {!loading && error && <div style={{ color: '#c00', fontSize: 13, padding: '12px 16px', background: '#fff5f5', borderRadius: 8 }}>{error}</div>}

      {!loading && data && (
        <>
          {/* Set toggles */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
            {totalBySets.map((item, i) => {
              const color = LINE_COLORS[i % LINE_COLORS.length];
              const isHidden = hidden.has(item.set);
              return (
                <div key={item.set} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                  <button onClick={() => toggleSet(item.set)} style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '4px 8px 4px 10px', borderRadius: '20px 0 0 20px',
                    border: `1.5px solid ${isHidden ? '#e0e0e0' : color}`,
                    borderRight: 'none',
                    background: isHidden ? '#f9f9f9' : color + '15',
                    color: isHidden ? '#bbb' : '#222',
                    cursor: 'pointer', fontSize: 11, fontWeight: 600,
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: isHidden ? '#ccc' : color, flexShrink: 0 }} />
                    {setLabel(item.set)}
                    <span style={{ color: isHidden ? '#ccc' : color, fontWeight: 700 }}>{item.total.toLocaleString('ru')} шт</span>
                  </button>
                  <button onClick={() => openDrill(item.set)} title="Товары внутри сета" style={{
                    padding: '4px 7px', borderRadius: '0 20px 20px 0',
                    border: `1.5px solid ${isHidden ? '#e0e0e0' : color}`,
                    background: drillSet === item.set ? color : (isHidden ? '#f9f9f9' : color + '15'),
                    color: drillSet === item.set ? '#fff' : (isHidden ? '#ccc' : color),
                    cursor: 'pointer', fontSize: 11, fontWeight: 700, lineHeight: 1,
                  }}>↗</button>
                </div>
              );
            })}
          </div>

          {/* Chart */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #eee', padding: '20px 12px 12px 4px', marginBottom: 24 }}>
            {chartRows.length === 0 ? (
              <div style={{ color: '#bbb', fontSize: 14, textAlign: 'center', padding: 60 }}>Нет данных за выбранный период</div>
            ) : (
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={chartRows} margin={{ top: 4, right: 16, left: 16, bottom: 36 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis
                    dataKey="_label"
                    tick={{ fontSize: 10, fill: '#aaa' }}
                    interval={tickInterval}
                    angle={chartRows.length > 20 ? -35 : 0}
                    textAnchor={chartRows.length > 20 ? 'end' : 'middle'}
                    height={chartRows.length > 20 ? 50 : 36}
                  >
                    <Label value="Дата" position="insideBottom" offset={-10}
                      style={{ fontSize: 11, fill: '#bbb', fontWeight: 600 }} />
                  </XAxis>
                  <YAxis tick={{ fontSize: 10, fill: '#aaa' }} width={56}>
                    <Label value="Количество, шт" angle={-90} position="insideLeft" offset={16}
                      style={{ fontSize: 11, fill: '#bbb', fontWeight: 600 }} />
                  </YAxis>
                  <Tooltip content={<CustomTooltip />} />
                  {totalBySets.map((item, i) => !hidden.has(item.set) && (
                    <Line
                      key={item.set}
                      type="linear"
                      dataKey={item.set}
                      stroke={LINE_COLORS[i % LINE_COLORS.length]}
                      strokeWidth={2}
                      dot={chartRows.length <= 14 ? { r: 3, strokeWidth: 0 } : false}
                      activeDot={{ r: 5, strokeWidth: 0 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Summary table */}
          {totalBySets.length > 0 && (
            <div style={{ border: '1px solid #eee', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
              <div style={{
                display: 'grid', gridTemplateColumns: '24px 1fr 80px 100px',
                padding: '8px 14px', background: '#f7f8fa', borderBottom: '1px solid #eee',
                fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5,
              }}>
                <span>#</span>
                <span>Сет</span>
                <span style={{ textAlign: 'right' }}>% от итога</span>
                <span style={{ textAlign: 'right' }}>Продано, шт</span>
              </div>
              {totalBySets.map((item, i) => {
                const pct = grandTotal > 0 ? Math.round(item.total / grandTotal * 100) : 0;
                return (
                  <div key={item.set}
                    style={{ display: 'grid', gridTemplateColumns: '24px 1fr 80px 100px', padding: '9px 14px', borderBottom: '1px solid #f5f5f5', fontSize: 13, alignItems: 'center' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#fafafa'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <span style={{ fontSize: 11, color: '#ccc', fontWeight: 600 }}>{i + 1}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: LINE_COLORS[i % LINE_COLORS.length], flexShrink: 0 }} />
                      <span style={{ fontWeight: 500 }}>{setLabel(item.set)}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 11, color: '#aaa' }}>{pct}%</span>
                      <div style={{ height: 3, background: '#f0f0f0', borderRadius: 2, marginTop: 3 }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: LINE_COLORS[i % LINE_COLORS.length], borderRadius: 2 }} />
                      </div>
                    </div>
                    <span style={{ textAlign: 'right', fontWeight: 700, color: '#1e7e34' }}>{item.total.toLocaleString('ru')} шт</span>
                  </div>
                );
              })}
              <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr 80px 100px', padding: '10px 14px', background: '#f7f8fa', fontSize: 13 }}>
                <span />
                <span style={{ fontWeight: 700, color: '#111' }}>Итого</span>
                <span />
                <span style={{ textAlign: 'right', fontWeight: 800, fontSize: 15, color: '#1e7e34' }}>{grandTotal.toLocaleString('ru')} шт</span>
              </div>
            </div>
          )}

          {/* Drill-down: products inside a set */}
          {drillSet && (
            <div style={{ marginTop: 8, border: '1.5px solid #e0e0e0', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#f7f8fa', borderBottom: '1px solid #eee' }}>
                <button onClick={() => { setDrillSet(null); setDrillData(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#888', lineHeight: 1 }}>←</button>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111' }}>📦 {setLabel(drillSet)}</div>
                <div style={{ fontSize: 12, color: '#aaa' }}>Товары внутри сета</div>
              </div>

              {!drillData && <div style={{ color: '#aaa', fontSize: 13, textAlign: 'center', padding: 40 }}>Загрузка…</div>}

              {drillData && (() => {
                const drillTotals = drillData.datasets
                  .map(ds => ({ name: ds.set, total: ds.data.reduce((a, b) => a + b, 0) }))
                  .filter(x => x.total > 0)
                  .sort((a, b) => b.total - a.total);
                const drillTotal = drillTotals.reduce((s, x) => s + x.total, 0);
                const drillRows  = drillData.labels.map((lbl, i) => {
                  const row = { _label: fmtLabel(lbl, period) };
                  drillData.datasets.forEach(ds => { row[ds.set] = ds.data[i]; });
                  return row;
                });
                const drillTick = drillRows.length > 30 ? Math.floor(drillRows.length / 15) : 0;

                return (
                  <>
                    {drillRows.length === 0
                      ? <div style={{ color: '#bbb', fontSize: 13, textAlign: 'center', padding: 40 }}>Нет данных</div>
                      : (
                        <div style={{ padding: '16px 8px 8px 4px' }}>
                          <ResponsiveContainer width="100%" height={320}>
                            <LineChart data={drillRows} margin={{ top: 4, right: 16, left: 16, bottom: 36 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                              <XAxis dataKey="_label" tick={{ fontSize: 10, fill: '#aaa' }} interval={drillTick}
                                angle={drillRows.length > 20 ? -35 : 0}
                                textAnchor={drillRows.length > 20 ? 'end' : 'middle'}
                                height={drillRows.length > 20 ? 50 : 36}>
                                <Label value="Дата" position="insideBottom" offset={-10} style={{ fontSize: 11, fill: '#bbb', fontWeight: 600 }} />
                              </XAxis>
                              <YAxis tick={{ fontSize: 10, fill: '#aaa' }} width={56}>
                                <Label value="Количество, шт" angle={-90} position="insideLeft" offset={16} style={{ fontSize: 11, fill: '#bbb', fontWeight: 600 }} />
                              </YAxis>
                              <Tooltip content={<CustomTooltip />} />
                              {drillTotals.map((item, i) => (
                                <Line key={item.name} type="linear" dataKey={item.name}
                                  stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2}
                                  dot={drillRows.length <= 14 ? { r: 3, strokeWidth: 0 } : false}
                                  activeDot={{ r: 5, strokeWidth: 0 }} connectNulls />
                              ))}
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      )
                    }

                    {/* Product table */}
                    {drillTotals.length > 0 && (
                      <div style={{ borderTop: '1px solid #eee' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr 80px 100px', padding: '8px 14px', background: '#f7f8fa', borderBottom: '1px solid #eee', fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                          <span>#</span><span>Товар</span><span style={{ textAlign: 'right' }}>%</span><span style={{ textAlign: 'right' }}>Продано, шт</span>
                        </div>
                        {drillTotals.map((item, i) => {
                          const pct = drillTotal > 0 ? Math.round(item.total / drillTotal * 100) : 0;
                          return (
                            <div key={item.name} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 80px 100px', padding: '8px 14px', borderBottom: '1px solid #f5f5f5', fontSize: 12, alignItems: 'center' }}
                              onMouseEnter={e => e.currentTarget.style.background = '#fafafa'}
                              onMouseLeave={e => e.currentTarget.style.background = ''}>
                              <span style={{ fontSize: 10, color: '#ccc', fontWeight: 600 }}>{i + 1}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: LINE_COLORS[i % LINE_COLORS.length], flexShrink: 0 }} />
                                <span style={{ fontWeight: 500, color: '#333' }}>{item.name}</span>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <span style={{ fontSize: 10, color: '#aaa' }}>{pct}%</span>
                                <div style={{ height: 3, background: '#f0f0f0', borderRadius: 2, marginTop: 3 }}>
                                  <div style={{ width: `${pct}%`, height: '100%', background: LINE_COLORS[i % LINE_COLORS.length], borderRadius: 2 }} />
                                </div>
                              </div>
                              <span style={{ textAlign: 'right', fontWeight: 700, color: '#1e7e34' }}>{item.total.toLocaleString('ru')} шт</span>
                            </div>
                          );
                        })}
                        <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr 80px 100px', padding: '10px 14px', background: '#f7f8fa', fontSize: 13 }}>
                          <span /><span style={{ fontWeight: 700, color: '#111' }}>Итого</span><span />
                          <span style={{ textAlign: 'right', fontWeight: 800, fontSize: 14, color: '#1e7e34' }}>{drillTotal.toLocaleString('ru')} шт</span>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </>
      )}
    </div>
  );
}
