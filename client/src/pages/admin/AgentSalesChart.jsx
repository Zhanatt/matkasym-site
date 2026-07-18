import { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { adminGetAgentSalesTimeseries } from '../../api';

const METRICS = {
  sum: { label: '💰 Сумма', color: '#27ae60', unit: 'сом' },
  qty: { label: '📦 Штуки', color: '#3498db', unit: 'шт' },
};
const GROUPS = [{ k: 'day', l: 'День' }, { k: 'week', l: 'Неделя' }, { k: 'month', l: 'Месяц' }];
const MONTHS = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];

const money = n => (n || 0).toLocaleString('ru-RU');

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Короткая подпись на оси X
function fmtTick(period, groupBy) {
  if (groupBy === 'week')  { const [y, w] = period.split('-'); return `${w}н '${y.slice(2)}`; }
  if (groupBy === 'month') { const [y, m] = period.split('-'); return `${MONTHS[Number(m) - 1]} '${y.slice(2)}`; }
  const [, m, d] = period.split('-');
  return `${d}.${m}`;
}

// Полная подпись в тултипе
function fmtFull(period, groupBy) {
  if (groupBy === 'week')  { const [y, w] = period.split('-'); return `${w}-я неделя ${y}`; }
  if (groupBy === 'month') { const [y, m] = period.split('-'); return `${MONTHS[Number(m) - 1]} ${y}`; }
  const [y, m, d] = period.split('-');
  return `${d}.${m}.${y}`;
}

// Компактные подписи оси Y: 5 753 376 → «5,8 млн»
function compact(n) {
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.', ',') + ' млн';
  if (a >= 1e3) return Math.round(n / 1e3) + ' тыс';
  return String(n);
}

function ChartTooltip({ active, payload, groupBy, metric }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const m = METRICS[metric];
  const ret = metric === 'sum' ? p.retSum : p.retQty;
  return (
    <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 10, padding: '9px 13px', boxShadow: '0 4px 16px rgba(0,0,0,.1)' }}>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 5 }}>{fmtFull(p.period, groupBy)}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
        <span style={{ fontSize: 15, fontWeight: 800, color: '#111' }}>
          {money(metric === 'sum' ? p.sum : p.qty)} <span style={{ fontSize: 11, color: '#bbb' }}>{m.unit}</span>
        </span>
      </div>
      <div style={{ fontSize: 11.5, color: '#aaa', marginTop: 4 }}>
        {metric === 'sum' ? `${money(p.qty)} шт` : `${money(p.sum)} сом`}
      </div>
      {ret > 0 && (
        <div style={{ fontSize: 11.5, color: '#c0392b', marginTop: 3 }}>↩ возвраты: {money(ret)} {m.unit}</div>
      )}
    </div>
  );
}

export default function AgentSalesChart({ dateFrom, dateTo, brand, country = 'KG', uploaded, onPeriodChange, dataRange }) {
  const [open, setOpen]       = useState(() => localStorage.getItem('agentSalesChartOpen') === '1');
  const [groupBy, setGroupBy] = useState('day');
  const [metric, setMetric]   = useState('sum');
  const [loading, setLoading] = useState(false);
  const [points, setPoints]   = useState([]);

  useEffect(() => { localStorage.setItem('agentSalesChartOpen', open ? '1' : '0'); }, [open]);

  const load = useCallback(() => {
    if (!open) return;
    setLoading(true);
    adminGetAgentSalesTimeseries({ dateFrom, dateTo, brand, groupBy, country })
      .then(res => setPoints(res.data.points || []))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [open, dateFrom, dateTo, brand, groupBy, country]);

  useEffect(() => { load(); }, [load]);

  const preset = (days) => {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - (days - 1));
    onPeriodChange(ymd(from), ymd(to));
  };
  const presetMonth = () => {
    const now = new Date();
    onPeriodChange(ymd(new Date(now.getFullYear(), now.getMonth(), 1)), ymd(now));
  };
  const presetAll = () => {
    if (dataRange) onPeriodChange(ymd(new Date(dataRange.min)), ymd(new Date(dataRange.max)));
  };

  const m = METRICS[metric];
  const seg = (activeKey, k) => ({
    padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
    background: activeKey === k ? '#fff' : 'transparent',
    color: activeKey === k ? '#111' : '#888',
    boxShadow: activeKey === k ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
  });
  const presetBtn = {
    padding: '6px 12px', borderRadius: 8, border: '1.5px solid #e5e5e5', background: '#fff',
    color: '#666', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
  };

  return (
    <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 14, marginBottom: 18, overflow: 'hidden' }}>
      {/* Шапка-кнопка */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px',
          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 12, color: '#bbb', width: 12, transition: 'transform .25s ease', transform: open ? 'rotate(90deg)' : 'none' }}>▶</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>📈 Динамика продаж</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: '#aaa' }}>{open ? 'Свернуть' : 'Развернуть'}</span>
      </button>

      {/* Раздвижная панель */}
      <div style={{
        maxHeight: open ? 600 : 0, opacity: open ? 1 : 0, overflow: 'hidden',
        transition: 'max-height .35s ease, opacity .25s ease',
      }}>
        <div style={{ padding: '0 18px 18px', borderTop: '1px solid #f2f2f2' }}>
          {/* Контролы */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', margin: '14px 0 16px' }}>
            <div style={{ display: 'inline-flex', background: '#f0f0ee', borderRadius: 10, padding: 3, gap: 3 }}>
              {Object.entries(METRICS).map(([k, v]) => (
                <button key={k} onClick={() => setMetric(k)} style={seg(metric, k)}>{v.label}</button>
              ))}
            </div>
            <div style={{ display: 'inline-flex', background: '#f0f0ee', borderRadius: 10, padding: 3, gap: 3 }}>
              {GROUPS.map(g => (
                <button key={g.k} onClick={() => setGroupBy(g.k)} style={seg(groupBy, g.k)}>{g.l}</button>
              ))}
            </div>
            <span style={{ flex: 1 }} />
            <button onClick={() => preset(7)}  style={presetBtn}>7 дней</button>
            <button onClick={() => preset(30)} style={presetBtn}>30 дней</button>
            <button onClick={presetMonth}      style={presetBtn}>Этот месяц</button>
            {dataRange && <button onClick={presetAll} style={presetBtn}>Всё</button>}
          </div>

          {/* График */}
          {loading ? (
            <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: 13 }}>
              Загрузка…
            </div>
          ) : points.length === 0 ? (
            <div style={{ height: 260, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>{uploaded ? '✅' : '📭'}</div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: uploaded ? '#15803d' : '#b45309' }}>
                {uploaded ? 'За этот период продаж не было — 0' : 'Отчёт за этот период не загружен'}
              </div>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={points} margin={{ top: 6, right: 8, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="agentSalesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={m.color} stopOpacity={0.14} />
                      <stop offset="100%" stopColor={m.color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#f0f0f0" vertical={false} />
                  <XAxis
                    dataKey="period"
                    tickFormatter={p => fmtTick(p, groupBy)}
                    tick={{ fill: '#aaa', fontSize: 11 }}
                    axisLine={{ stroke: '#eee' }}
                    tickLine={false}
                    minTickGap={18}
                  />
                  <YAxis
                    tickFormatter={compact}
                    tick={{ fill: '#aaa', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={54}
                  />
                  <Tooltip
                    content={<ChartTooltip groupBy={groupBy} metric={metric} />}
                    cursor={{ stroke: '#ddd', strokeWidth: 1 }}
                  />
                  <Area
                    type="monotone"
                    dataKey={metric}
                    stroke={m.color}
                    strokeWidth={2}
                    fill="url(#agentSalesFill)"
                    dot={points.length <= 31 ? { r: 3, fill: m.color, stroke: '#fff', strokeWidth: 2 } : false}
                    activeDot={{ r: 5, fill: m.color, stroke: '#fff', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
              <div style={{ fontSize: 11.5, color: '#bbb', marginTop: 8 }}>
                Точка = дата, на которую загружены продажи. Отчёт, загруженный «за период», лежит одним блоком на конечной дате — по дням он не разложится.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
