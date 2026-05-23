import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Label,
} from 'recharts';
import { adminGetSalesChartSet } from '../../api';

const LINE_COLORS = [
  '#DC1E24','#3463A3','#2ECC71','#F39C12','#9B59B6',
  '#1ABC9C','#E67E22','#34495E','#E91E63','#00BCD4',
  '#8BC34A','#FF5722','#607D8B','#795548','#673AB7',
];

const SET_NAMES = {
  'achyk-asman':     'Ачык Асман',      'den-sooluk':      'Ден Соолук',
  'zhashyl-ömür':    'Жашыл Өмүр',      'jenil-ashkana':   'Жеңил Ашкана',
  'konok-keldi':     'Конок Келди',     'korkom-aiym':     'Коркөм Айым',
  'kosh-keliniz':    'Кош Келиңиз',     'onoi-sakta':      'Оңой Сакта',
  'baary-oorunda':   'Баары Ордунда',   'sanarip-tv':      'Санарип ТВ',
  'shirin-balalyk':  'Ширин Балалык',   'taza-kiym':       'Таза Кийим',
  'uydo-ishtoo':     'Үйдө Иштөө',      'mazza-seiyl':     'Мазза Сейил',
  '0-tashtandy':     '0-Таштанды',      'bekem-fasad':     'Бекем Фасад',
  'bilim-kelechek':  'Билим Келечек',   'kooz-koopsuzduk': 'Көз Коопсуздук',
  'uzak-koldon':     'Узак Колдон',     'önügüü-set':      'Өнүгүү Сет',
  'dayar-tütük':     'Даяр Түтүк',      'nelikvid':        'Неликвид',
  'samples':         'Образцы',         'small-batch':     'Малая партия',
  'misc':            'Разное',          'equipment':       'Оборудование',
  'other':           'Прочее',
};

function setLabel(slug) {
  return SET_NAMES[slug] || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function fmtLabel(str, period) {
  if (!str) return str;
  if (period === 'day')   { const [,m,d] = str.split('-'); return `${d}.${m}`; }
  if (period === 'week')  { const [y,w]  = str.split('-'); return `Нед.${w}'${y.slice(2)}`; }
  if (period === 'month') {
    const [y,m] = str.split('-');
    return ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'][Number(m)-1] + ` '${y.slice(2)}`;
  }
  return str;
}

const STOCK_START = '2025-07-11';
const SEL = { padding:'6px 10px', borderRadius:7, border:'1.5px solid #e0e0e0', fontSize:12, background:'#fff', cursor:'pointer', outline:'none', color:'#333' };

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const sorted = [...payload].filter(p => p.value > 0).sort((a,b) => b.value - a.value);
  return (
    <div style={{ background:'#fff', border:'1px solid #e0e0e0', borderRadius:10, padding:'10px 14px', boxShadow:'0 4px 16px rgba(0,0,0,.1)', minWidth:180, maxWidth:240 }}>
      <div style={{ fontSize:11, fontWeight:700, color:'#888', marginBottom:6, textTransform:'uppercase' }}>{label}</div>
      {sorted.map(p => (
        <div key={p.dataKey} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, marginBottom:3 }}>
          <div style={{ display:'flex', alignItems:'center', gap:5, minWidth:0 }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:p.color, flexShrink:0 }} />
            <span style={{ fontSize:11, color:'#444', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.dataKey}</span>
          </div>
          <span style={{ fontSize:12, fontWeight:700, color:'#111', flexShrink:0 }}>{p.value} шт</span>
        </div>
      ))}
      <div style={{ borderTop:'1px solid #f0f0f0', marginTop:6, paddingTop:6, display:'flex', justifyContent:'space-between' }}>
        <span style={{ fontSize:11, color:'#aaa' }}>Итого</span>
        <span style={{ fontSize:12, fontWeight:800, color:'#1e7e34' }}>{sorted.reduce((s,p)=>s+p.value,0)} шт</span>
      </div>
    </div>
  );
}

export default function AdminSetSalesChart() {
  const { setSlug } = useParams();
  const navigate    = useNavigate();

  const [period,   setPeriod]   = useState('day');
  const [dateFrom, setDateFrom] = useState(STOCK_START);
  const [dateTo,   setDateTo]   = useState(() => new Date().toISOString().slice(0,10));
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = { period };
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo)   params.dateTo   = dateTo;
    adminGetSalesChartSet(setSlug, params)
      .then(r => setData(r.data))
      .catch(() => setData({ labels: [], datasets: [] }))
      .finally(() => setLoading(false));
  }, [setSlug, period, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const totals = data
    ? data.datasets
        .map(ds => ({ name: ds.set, total: ds.data.reduce((a,b)=>a+b,0), revenue: ds.revenue || 0 }))
        .filter(x => x.total > 0)
        .sort((a,b) => b.total - a.total)
    : [];

  const grandTotal   = totals.reduce((s,x) => s + x.total, 0);
  const grandRevenue = data?.grandRevenue || 0;

  let cumSum = 0;
  const totalsWithAbc = totals.map(item => {
    cumSum += item.total;
    const cumPct = grandTotal > 0 ? cumSum / grandTotal : 0;
    return { ...item, abc: cumPct <= 0.7 ? 'A' : cumPct <= 0.9 ? 'B' : 'C' };
  });

  const ABC_STYLE = {
    A: { background:'#e8f5e9', color:'#1e7e34' },
    B: { background:'#fff8e1', color:'#e65100' },
    C: { background:'#ffebee', color:'#c62828' },
  };

  const chartRows = data
    ? data.labels.map((lbl,i) => {
        const row = { _label: fmtLabel(lbl, period) };
        data.datasets.forEach(ds => { row[ds.set] = ds.data[i]; });
        return row;
      })
    : [];

  const tickInterval = chartRows.length > 30 ? Math.floor(chartRows.length / 15) : 0;

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100%' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap', paddingBottom:18, borderBottom:'1px solid #eee', marginBottom:20 }}>
        <button onClick={() => navigate(-1)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:20, padding:'0 4px', color:'#888' }}>←</button>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:11, color:'#aaa', fontWeight:600, textTransform:'uppercase', letterSpacing:0.5, marginBottom:2 }}>Продажи по сетам</div>
          <div style={{ fontSize:18, fontWeight:800, color:'#111' }}>📦 {setLabel(setSlug)}</div>
          <div style={{ fontSize:12, color:'#aaa', marginTop:2 }}>Продажи по товарам внутри сета</div>
        </div>
        {grandTotal > 0 && (
          <div style={{ background:'#e8f5e9', borderRadius:10, padding:'6px 14px', textAlign:'right' }}>
            <div style={{ fontSize:10, color:'#aaa', fontWeight:600, textTransform:'uppercase' }}>За период</div>
            <div style={{ fontSize:18, fontWeight:800, color:'#1e7e34' }}>{grandTotal.toLocaleString('ru')} шт</div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16, alignItems:'center' }}>
        <div style={{ display:'flex', background:'#f5f5f5', borderRadius:8, padding:3, gap:0 }}>
          {[{k:'day',l:'День'},{k:'week',l:'Неделя'},{k:'month',l:'Месяц'}].map(opt => (
            <button key={opt.k} onClick={() => setPeriod(opt.k)} style={{
              padding:'5px 14px', borderRadius:6, border:'none', cursor:'pointer',
              fontSize:12, fontWeight:600,
              background: period===opt.k ? '#111' : 'transparent',
              color:      period===opt.k ? '#fff' : '#666',
            }}>{opt.l}</button>
          ))}
        </div>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={SEL} />
        <span style={{ color:'#aaa', fontSize:12 }}>—</span>
        <input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   style={SEL} />
      </div>

      {loading && <div style={{ color:'#aaa', fontSize:14, textAlign:'center', paddingTop:60 }}>Загрузка…</div>}

      {!loading && data && (
        <>
          {/* Chart */}
          <div style={{ background:'#fff', borderRadius:12, border:'1px solid #eee', padding:'20px 12px 12px 4px', marginBottom:24 }}>
            {chartRows.length === 0
              ? <div style={{ color:'#bbb', fontSize:14, textAlign:'center', padding:60 }}>Нет данных за выбранный период</div>
              : (
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={chartRows} margin={{ top:4, right:16, left:16, bottom:36 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis dataKey="_label" tick={{ fontSize:10, fill:'#aaa' }} interval={tickInterval}
                      angle={chartRows.length>20 ? -35 : 0}
                      textAnchor={chartRows.length>20 ? 'end' : 'middle'}
                      height={chartRows.length>20 ? 50 : 36}>
                      <Label value="Дата" position="insideBottom" offset={-10} style={{ fontSize:11, fill:'#bbb', fontWeight:600 }} />
                    </XAxis>
                    <YAxis tick={{ fontSize:10, fill:'#aaa' }} width={56}>
                      <Label value="Количество, шт" angle={-90} position="insideLeft" offset={16} style={{ fontSize:11, fill:'#bbb', fontWeight:600 }} />
                    </YAxis>
                    <Tooltip content={<CustomTooltip />} />
                    {totals.map((item,i) => (
                      <Line key={item.name} type="linear" dataKey={item.name}
                        stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2}
                        dot={chartRows.length<=14 ? {r:3,strokeWidth:0} : false}
                        activeDot={{r:5,strokeWidth:0}} connectNulls />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )
            }
          </div>

          {/* Table */}
          {totalsWithAbc.length > 0 && (
            <div style={{ border:'1px solid #eee', borderRadius:10, overflow:'hidden', background:'#fff' }}>
              <div style={{ display:'grid', gridTemplateColumns:'24px 28px 1fr 80px 100px', padding:'8px 14px', background:'#f7f8fa', borderBottom:'1px solid #eee', fontSize:11, fontWeight:700, color:'#888', textTransform:'uppercase', letterSpacing:0.5 }}>
                <span>#</span><span>Кат.</span><span>Товар</span><span style={{ textAlign:'right' }}>% от итога</span><span style={{ textAlign:'right' }}>Продано, шт</span>
              </div>
              {totalsWithAbc.map((item,i) => {
                const pct = grandTotal>0 ? Math.round(item.total/grandTotal*100) : 0;
                const abcStyle = ABC_STYLE[item.abc];
                return (
                  <div key={item.name} style={{ display:'grid', gridTemplateColumns:'24px 28px 1fr 80px 100px', padding:'9px 14px', borderBottom:'1px solid #f5f5f5', fontSize:13, alignItems:'center' }}
                    onMouseEnter={e=>e.currentTarget.style.background='#fafafa'}
                    onMouseLeave={e=>e.currentTarget.style.background=''}>
                    <span style={{ fontSize:11, color:'#ccc', fontWeight:600 }}>{i+1}</span>
                    <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:20, height:20, borderRadius:5, fontSize:10, fontWeight:800, ...abcStyle }}>{item.abc}</span>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ width:10, height:10, borderRadius:'50%', background:LINE_COLORS[i%LINE_COLORS.length], flexShrink:0 }} />
                      <span style={{ fontWeight:500 }}>{item.name}</span>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <span style={{ fontSize:11, color:'#aaa' }}>{pct}%</span>
                      <div style={{ height:3, background:'#f0f0f0', borderRadius:2, marginTop:3 }}>
                        <div style={{ width:`${pct}%`, height:'100%', background:LINE_COLORS[i%LINE_COLORS.length], borderRadius:2 }} />
                      </div>
                    </div>
                    <span style={{ textAlign:'right', fontWeight:700, color:'#1e7e34' }}>{item.total.toLocaleString('ru')} шт</span>
                  </div>
                );
              })}
              <div style={{ display:'grid', gridTemplateColumns:'24px 28px 1fr 80px 100px', padding:'10px 14px', background:'#f7f8fa', fontSize:13 }}>
                <span /><span /><span style={{ fontWeight:700, color:'#111' }}>Итого</span><span />
                <span style={{ textAlign:'right', fontWeight:800, fontSize:15, color:'#1e7e34' }}>{grandTotal.toLocaleString('ru')} шт</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
