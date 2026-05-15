import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import { adminGetSalesChart } from '../../api';

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
  { value: '',               label: 'Все бренды' },
  { value: 'matkasym-home',  label: 'HOME' },
  { value: 'matkasym-shaar', label: 'SHAAR' },
  { value: 'matkasym-kyzmat',label: 'KYZMAT' },
];

const SEL = {
  padding: '6px 10px', borderRadius: 7, border: '1.5px solid #e0e0e0',
  fontSize: 12, background: '#fff', cursor: 'pointer', outline: 'none', color: '#333',
};

// Format x-axis label depending on period
function fmtLabel(str, period) {
  if (!str) return str;
  if (period === 'day') {
    const [, m, d] = str.split('-');
    return `${d}.${m}`;
  }
  if (period === 'week') {
    const [y, w] = str.split('-');
    return `Нед.${w} '${y.slice(2)}`;
  }
  if (period === 'month') {
    const [y, m] = str.split('-');
    const months = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
    return `${months[Number(m) - 1]} '${y.slice(2)}`;
  }
  return str;
}

// Default last 30 days
function defaultFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}
function defaultTo() {
  return new Date().toISOString().slice(0, 10);
}

export default function AdminSalesChart() {
  const navigate = useNavigate();

  const [period,   setPeriod]   = useState('day');
  const [brand,    setBrand]    = useState('');
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo,   setDateTo]   = useState(defaultTo);
  const [hidden,   setHidden]   = useState(new Set());

  const [data,    setData]    = useState(null);
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

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

  // Build recharts-compatible rows: [{period, set1: N, set2: N, ...}]
  const chartRows = data
    ? data.labels.map((lbl, i) => {
        const row = { period: fmtLabel(lbl, period) };
        data.datasets.forEach(ds => { row[ds.set] = ds.data[i]; });
        return row;
      })
    : [];

  const totalBySets = data
    ? data.datasets.map(ds => ({
        set: ds.set,
        total: ds.data.reduce((a, b) => a + b, 0),
      })).sort((a, b) => b.total - a.total)
    : [];

  const toggleSet = (s) => {
    setHidden(prev => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', paddingBottom: 18, borderBottom: '1px solid #eee', marginBottom: 20 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: '0 4px', color: '#888' }}>←</button>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#111' }}>📈 Продажи по сетам</div>
          <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>На основе изменений остатков (отрицательный delta)</div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20, alignItems: 'center' }}>
        {/* Period */}
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

      {loading && <div style={{ color: '#aaa', fontSize: 14, textAlign: 'center', paddingTop: 40 }}>Загрузка…</div>}
      {!loading && error && <div style={{ color: '#c00', fontSize: 13, textAlign: 'center', paddingTop: 40 }}>{error}</div>}

      {!loading && data && (
        <>
          {/* Set legend / toggles */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {totalBySets.map((item, i) => {
              const color = LINE_COLORS[i % LINE_COLORS.length];
              const isHidden = hidden.has(item.set);
              return (
                <button key={item.set} onClick={() => toggleSet(item.set)} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '4px 10px', borderRadius: 20, border: `2px solid ${color}`,
                  background: isHidden ? '#fff' : color + '18',
                  color: isHidden ? '#aaa' : '#222',
                  cursor: 'pointer', fontSize: 11, fontWeight: 600,
                  opacity: isHidden ? 0.5 : 1,
                }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: isHidden ? '#ccc' : color, flexShrink: 0 }} />
                  {setLabel(item.set)}
                  <span style={{ color: '#aaa', fontWeight: 400 }}>{item.total} шт</span>
                </button>
              );
            })}
          </div>

          {/* Chart */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #eee', padding: '16px 8px 8px', marginBottom: 24 }}>
            {chartRows.length === 0 ? (
              <div style={{ color: '#bbb', fontSize: 14, textAlign: 'center', padding: 40 }}>Нет данных за выбранный период</div>
            ) : (
              <ResponsiveContainer width="100%" height={380}>
                <LineChart data={chartRows} margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#aaa' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#aaa' }} width={36} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #eee' }}
                    formatter={(val, name) => [`${val} шт`, setLabel(name)]}
                  />
                  {data.datasets.map((ds, i) => !hidden.has(ds.set) && (
                    <Line
                      key={ds.set}
                      type="monotone"
                      dataKey={ds.set}
                      name={ds.set}
                      stroke={LINE_COLORS[i % LINE_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Summary table */}
          {totalBySets.length > 0 && (
            <div style={{ border: '1px solid #eee', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', padding: '8px 14px', background: '#f7f8fa', borderBottom: '1px solid #eee', fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                <span>Сет</span>
                <span style={{ textAlign: 'right' }}>Итого продано</span>
              </div>
              {totalBySets.map((item, i) => (
                <div key={item.set} style={{ display: 'grid', gridTemplateColumns: '1fr 100px', padding: '8px 14px', borderBottom: '1px solid #f5f5f5', fontSize: 13, alignItems: 'center' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#fafafa'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: LINE_COLORS[i % LINE_COLORS.length], flexShrink: 0 }} />
                    <span style={{ fontWeight: 500 }}>{setLabel(item.set)}</span>
                  </div>
                  <span style={{ textAlign: 'right', fontWeight: 700, color: '#1e7e34' }}>{item.total.toLocaleString('ru')} шт</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
