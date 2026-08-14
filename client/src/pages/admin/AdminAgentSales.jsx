import { useState, useEffect, useCallback } from 'react';
import { adminGetAgentSales, adminUploadSales, adminGetFxRate } from '../../api';
import AgentSalesChart from './AgentSalesChart';

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

function useIsMobile() {
  const [mob, setMob] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const h = () => setMob(window.innerWidth < 640);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return mob;
}

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
  { v: 'matkasym-kyzmat', l: 'KYMAT' },
];

const COUNTRIES = [
  { key: 'KG', label: 'Кыргызстан', flag: '🇰🇬' },
  { key: 'KZ', label: 'Казахстан',  flag: '🇰🇿' },
];
const COUNTRY_LABEL = { KG: 'Кыргызстан', KZ: 'Казахстан' };
// Валюта отчёта: KG — Make-in/Matkasym (сом), KZ — Q-top / ТОО QTOP (тенге)
const CURRENCY = { KG: 'сом', KZ: '₸' };
// Бренды HOME/SHAAR/KYMAT — кыргызские. В отчёте Q-top их нет, фильтр не показываем.
const HAS_BRANDS = { KG: true, KZ: false };

// В выгрузке Q-top субконто «Торг агент» не заполнено: 1С отдаёт всю выручку
// одной строкой-заглушкой. Показываем её по-человечески.
const isNoAgent = a => !a || a === '(без агента)' || String(a).startsWith('Субконто не заполнено');
const agentLabel = a => (isNoAgent(a) ? 'Без торгового агента' : a);
const BRAND_LABEL = { 'matkasym-home': 'HOME', 'matkasym-shaar': 'SHAAR', 'matkasym-kyzmat': 'KYMAT' };
const BRAND_BADGE = {
  'matkasym-home':   { bg: '#fdecec', color: '#c0392b' },
  'matkasym-shaar':  { bg: '#e8f0fb', color: '#2c5aa0' },
  'matkasym-kyzmat': { bg: '#eafaf1', color: '#1e7e34' },
};

export default function AdminAgentSales() {
  const mob = useIsMobile();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [dateFrom, setDateFrom] = useState(ymd(monthStart));
  const [dateTo, setDateTo]     = useState(ymd(now));
  const [brand, setBrand]       = useState('');
  // Страна отчёта: KG (Make-in/Matkasym) или KZ (Q-top). Отчёты не смешиваются.
  const [country, setCountry]   = useState(() => localStorage.getItem('agentSalesCountry') || 'KG');
  const [view, setView]         = useState('sets'); // sets | products | agents
  const [prodSort, setProdSort] = useState('qty');  // qty | sum | name — сортировка «По товарам»
  // Валюта показа для Казахстана: данные всегда в тенге, сомы — пересчёт по курсу НБКР
  const [showIn, setShowIn]     = useState(() => localStorage.getItem('agentSalesShowIn') || 'KZT');
  const [fx, setFx]             = useState(null); // { rate, date, stale }
  const [fxErr, setFxErr]       = useState(false);
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

  useEffect(() => { localStorage.setItem('agentSalesCountry', country); }, [country]);

  // Пересчёт в сомы доступен только на казахстанском отчёте
  const inKgs = country === 'KZ' && showIn === 'KGS' && !!fx?.rate;
  const cur    = country === 'KZ' ? (inKgs ? 'сом' : '₸') : CURRENCY.KG;
  const fxMul  = inKgs ? fx.rate : 1;
  // Суммы: данные лежат в валюте страны, пересчёт — только для показа
  const sumFmt = n => money(Math.round((n || 0) * fxMul));

  useEffect(() => { localStorage.setItem('agentSalesShowIn', showIn); }, [showIn]);

  // Курс тянем один раз при первом входе на казахстанский отчёт
  useEffect(() => {
    if (country !== 'KZ' || fx) return;
    adminGetFxRate()
      .then(r => { setFx(r.data); setFxErr(false); })
      .catch(() => setFxErr(true));
  }, [country, fx]);

  // Смена страны: бренды кыргызские, для Q-top их фильтр не применим — сбрасываем,
  // иначе после переключения показалась бы пустота. Сообщение о загрузке тоже чужое.
  useEffect(() => {
    if (!HAS_BRANDS[country]) setBrand('');
    setUploadMsg(null);
    if (country === 'KZ' && view === 'agents') setView('sets');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country]);

  const load = useCallback(() => {
    setLoading(true);
    adminGetAgentSales({ dateFrom, dateTo, brand, country })
      .then(res => setData(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo, brand, country]);

  useEffect(() => { load(); }, [load]);
  // Смена фильтров сбрасывает раскрытые детали
  useEffect(() => { setExpanded({}); setExpandedSet({}); }, [dateFrom, dateTo, brand, country]);

  const toggleProducts = agent => setExpanded(p => ({ ...p, [agent]: !p[agent] }));

  const handleSubmitUpload = () => {
    if (!agentsSel) { setUploadMsg({ ok: false, text: 'Выбери файл «Отчёт по агентам»' }); return; }
    const effFrom = uploadMode === 'day' ? uploadDay : dateFrom;
    const effTo   = uploadMode === 'day' ? uploadDay : dateTo;
    if (!effFrom || !effTo) { setUploadMsg({ ok: false, text: uploadMode === 'day' ? 'Выбери день' : 'Выбери период (даты сверху)' }); return; }
    setUploading(true);
    setUploadMsg(null);
    adminUploadSales(agentsSel, effFrom, effTo, null, country)
      .then(res => {
        const d = res.data;
        setUploadMsg({
          ok: true,
          text: `${COUNTRY_LABEL[country]}: загружено строк ${d.inserted}, агентов ${d.agents}. Сопоставлено с товарами: ${d.matched}${d.unmatched ? `, без сопоставления: ${d.unmatched}` : ''}.`,
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
  // Возвраты копим по модулю и вычитаем явно: в выгрузке 1С знак количества
  // у возвратных строк непостоянен, поэтому складывать их с продажами нельзя.
  (data?.sets || []).forEach(s => s.products.forEach(p => {
    if (isReturn(p)) { returns.sum += Math.abs(p.sum); returns.qty += Math.abs(p.qty); returns.pos++; }
    else             { sales.sum   += p.sum;           sales.qty   += p.qty;           sales.pos++; }
  }));
  const net = { sum: sales.sum - returns.sum, qty: sales.qty - returns.qty, pos: sales.pos - returns.pos };

  // Плоский список позиций: товар → штуки/сумма, с сетом. Один товар может прийти
  // из разных сетов — схлопываем по названию, чтобы «позиций» совпадало с 1С.
  const productRows = (() => {
    const m = new Map();
    (data?.sets || []).forEach(s => s.products.forEach(p => {
      const g = m.get(p.productName) || { productName: p.productName, set: s.set, brand: s.brand, qty: 0, sum: 0 };
      g.qty += p.qty;
      g.sum += p.sum;
      m.set(p.productName, g);
    }));
    const rows = [...m.values()];
    const cmp = {
      qty:  (a, b) => b.qty - a.qty,
      sum:  (a, b) => b.sum - a.sum,
      name: (a, b) => a.productName.localeCompare(b.productName, 'ru'),
    }[prodSort];
    return rows.sort(cmp);
  })();
  const prodTotalQty = productRows.reduce((n, p) => n + p.qty, 0);
  const prodTotalSum = productRows.reduce((n, p) => n + p.sum, 0);

  return (
    <div style={{ maxWidth: 1000 }}>
      {/* Переключатель страны: KG и KZ ведутся раздельно, отчёты не смешиваются */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <div style={{ display: 'inline-flex', background: '#f0f0ee', borderRadius: 10, padding: 3, gap: 3 }}>
          {COUNTRIES.map(c => (
            <button key={c.key} onClick={() => setCountry(c.key)} style={{
              padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
              background: country === c.key ? '#fff' : 'transparent',
              color:      country === c.key ? '#111' : '#888',
              boxShadow:  country === c.key ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
            }}>{c.flag} {c.label}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#111', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            {country === 'KZ' ? '🇰🇿 Продажи Q-top' : '🧾 Продажи по агентам'}
          </h1>
          <p style={{ fontSize: 14, color: '#888', marginTop: 4 }}>
            {country === 'KZ'
              ? `ТОО QTOP (Казахстан) · 1С «Сводная продаж по агентам» · суммы в ${inKgs ? 'сомах' : 'тенге'}`
              : 'Точные данные из 1С (отчёт «Сводная продаж по агентам») — не по остаткам'}
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
            {COUNTRY_LABEL[country]} · за период выше
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
            <div style={{ fontSize: 18, fontWeight: 800, color: '#111', marginBottom: 6 }}>Загрузка из 1С</div>
            <div style={{ fontSize: 13, marginBottom: 12, padding: '8px 12px', borderRadius: 9,
              background: country === 'KZ' ? '#fff7ed' : '#eff6ff', border: `1px solid ${country === 'KZ' ? '#fed7aa' : '#bfdbfe'}`,
              color: country === 'KZ' ? '#b45309' : '#1d4ed8', fontWeight: 700 }}>
              {country === 'KZ' ? '🇰🇿 Отчёт Q-top (Казахстан)' : '🇰🇬 Отчёт Кыргызстана'} · заменит только эту страну за период
            </div>

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
        {HAS_BRANDS[country] && (
          <select value={brand} onChange={e => setBrand(e.target.value)} style={{ ...inputStyle, fontWeight: 600 }}>
            {BRANDS.map(b => <option key={b.v} value={b.v}>{b.l}</option>)}
          </select>
        )}

        {/* Валюта показа — только для Q-top: в 1С суммы в тенге, сомы считаем по курсу НБКР */}
        {country === 'KZ' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', background: '#f0f0ee', borderRadius: 10, padding: 3, gap: 3 }}>
              {[{ k: 'KZT', l: '₸ Тенге' }, { k: 'KGS', l: 'сом Сомы' }].map(o => {
                const disabled = o.k === 'KGS' && !fx?.rate;
                return (
                  <button
                    key={o.k}
                    onClick={() => !disabled && setShowIn(o.k)}
                    disabled={disabled}
                    title={disabled ? 'Курс НБКР недоступен' : ''}
                    style={{
                      padding: '7px 14px', borderRadius: 8, border: 'none',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
                      background: showIn === o.k ? '#fff' : 'transparent',
                      color: disabled ? '#ccc' : showIn === o.k ? '#111' : '#888',
                      boxShadow: showIn === o.k ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
                    }}
                  >{o.l}</button>
                );
              })}
            </div>
            <span style={{ fontSize: 11.5, color: fxErr ? '#c0392b' : '#aaa' }}>
              {fxErr
                ? 'курс НБКР недоступен'
                : fx
                  ? `1 ₸ = ${fx.rate} сом · НБКР${fx.date ? ` на ${fx.date}` : ''}${fx.stale ? ' (устарел)' : ''}`
                  : 'курс загружается…'}
            </span>
          </div>
        )}
      </div>

      {/* График динамики — раскрывается по кнопке */}
      <AgentSalesChart
        dateFrom={dateFrom}
        dateTo={dateTo}
        brand={brand}
        country={country}
        uploaded={data?.uploaded}
        dataRange={data?.dataRange}
        cur={cur}
        fxMul={fxMul}
        onPeriodChange={(from, to) => { setDateFrom(from); setDateTo(to); }}
      />

      {/* Итоги: Продажи · Возвраты · Агенты */}
      {data && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          {/* Продажи */}
          <div style={{ flex: '1 1 250px', background: '#fff', border: '1px solid #eee', borderRadius: 14, padding: '16px 18px' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#27ae60', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>💰 Продажи <span style={{ fontWeight: 600, color: '#bbb', textTransform: 'none', letterSpacing: 0 }}>· до возврата</span></div>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11.5, color: '#aaa' }}>Сумма</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#27ae60' }}>{sumFmt(sales.sum)} <span style={{ fontSize: 12, color: '#bbb' }}>{cur}</span></div>
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
                <div style={{ fontSize: 22, fontWeight: 800, color: '#c0392b' }}>{sumFmt(returns.sum)} <span style={{ fontSize: 12, color: '#d9a' }}>{cur}</span></div>
              </div>
              <div>
                <div style={{ fontSize: 11.5, color: '#c9a' }}>Штук</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#c0392b' }}>{money(returns.qty)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11.5, color: '#c9a' }}>Позиций</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#c0392b' }}>{money(returns.pos)}</div>
              </div>
            </div>
          </div>

          {/* Чистыми: продажи − возвраты. Совпадает с «Итого» из 1С. */}
          <div style={{ flex: '1 1 250px', background: '#fff', border: '1px solid #eee', borderRadius: 14, padding: '16px 18px' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#2c5aa0', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>🧮 Чистыми <span style={{ fontWeight: 600, color: '#bbb', textTransform: 'none', letterSpacing: 0 }}>· после возврата</span></div>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11.5, color: '#aaa' }}>Сумма</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#2c5aa0' }}>{sumFmt(net.sum)} <span style={{ fontSize: 12, color: '#bbb' }}>{cur}</span></div>
              </div>
              <div>
                <div style={{ fontSize: 11.5, color: '#aaa' }}>Штук</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#2c5aa0' }}>{money(net.qty)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11.5, color: '#aaa' }}>Позиций</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#2c5aa0' }}>{money(net.pos)}</div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#bbb', marginTop: 8 }}>продажи − возвраты · как «Итого» в 1С</div>
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
          {[
            { k: 'sets',     l: '📦 По сетам' },
            { k: 'products', l: '🏷 По товарам' },
            // У Q-top субконто «Торг агент» пустое — разрез по агентам ничего не даёт
            ...(country === 'KZ' && data.agents.every(a => isNoAgent(a.agent)) ? [] : [{ k: 'agents', l: '👤 По агентам' }]),
          ].map(t => (
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
        data?.uploaded ? (
          // Отчёт за период загружен, но продаж в нём не было
          <div style={{ textAlign: 'center', padding: '48px 20px', background: '#fff', borderRadius: 16, border: '1px solid #eee' }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#111', marginBottom: 6 }}>За этот период продаж не было — 0</div>
            <div style={{ fontSize: 13, color: '#999', maxWidth: 460, margin: '0 auto' }}>
              Отчёт из 1С за выбранный период загружен, но продаж в нём нет.
            </div>
          </div>
        ) : (
          // Отчёт ещё не загружали
          <div style={{ textAlign: 'center', padding: '48px 20px', background: '#fff', borderRadius: 16, border: '1px solid #f0d8a8' }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>📭</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#b45309', marginBottom: 6 }}>Отчёт за этот период не загружен</div>
            <div style={{ fontSize: 13, color: '#999', maxWidth: 480, margin: '0 auto' }}>
              За выбранный период отчёт из 1С ещё не загружали.
              {data?.dataRange && <> Есть данные с {fmtDate(data.dataRange.min)} по {fmtDate(data.dataRange.max)}.</>}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 16 }}>
              <button
                onClick={() => { setUploadOpen(true); setUploadMsg(null); }}
                style={{ padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', background: '#111', color: '#fff', fontSize: 14, fontWeight: 700 }}
              >⬆️ Загрузить отчёт</button>
              {data?.dataRange && (
                <button
                  onClick={() => { setDateFrom(ymd(new Date(data.dataRange.min))); setDateTo(ymd(new Date(data.dataRange.max))); }}
                  style={{ padding: '10px 20px', borderRadius: 10, border: '1.5px solid #e5e5e5', cursor: 'pointer', background: '#fff', color: '#555', fontSize: 14, fontWeight: 700 }}
                >📅 Показать загруженный период</button>
              )}
            </div>
          </div>
        )
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
                      {agentLabel(a.agent)}
                    </span>
                    {isNoAgent(a.agent) && (
                      <span title="В 1С у счёта учёта доходов не заполнено субконто «Торг агент»"
                        style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: '#b45309', background: '#fff7ed', borderRadius: 20, padding: '1px 8px', whiteSpace: 'nowrap' }}>
                        субконто не заполнено
                      </span>
                    )}
                    {HAS_BRANDS[country] && a.brand && BRAND_BADGE[a.brand] && (
                      <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, borderRadius: 20, padding: '2px 8px', letterSpacing: 0.4, ...BRAND_BADGE[a.brand] }}>{BRAND_LABEL[a.brand]}</span>
                    )}
                    {agentReturns > 0 && (
                      <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 800, color: '#c0392b', background: '#fdecec', borderRadius: 20, padding: '1px 7px', whiteSpace: 'nowrap' }}>↩ {agentReturns} возвр.</span>
                    )}
                  </button>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#27ae60' }}>{sumFmt(a.totalSum)} <span style={{ fontSize: 12, color: '#bbb' }}>{cur}</span></div>
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
                          <th style={{ fontWeight: 600, padding: '6px 4px', textAlign: 'right', width: 110 }}>Сумма, {cur}</th>
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
                            <td style={{ padding: '6px 4px', textAlign: 'right', color: p.sum < 0 ? '#c0392b' : '#111', fontWeight: 600 }}>{sumFmt(p.sum)}</td>
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
      ) : view === 'products' ? (
        /* ── По товарам ── плоский список позиций: сколько штук и на какую сумму */
        (() => {
          // На телефоне шесть колонок не помещаются: фикс-ширины съедали название
          // до одной буквы. Убираем «Сет» и «%» в подписи под названием.
          const PRODGRID = mob ? '20px minmax(0, 1fr) 40px 86px' : '26px minmax(0, 1fr) 104px 84px 108px 52px';
          const pad = mob ? '9px 10px' : '9px 16px';
          const sortHead = (key, label, align = 'right') => (
            <span
              onClick={() => setProdSort(key)}
              style={{
                textAlign: align, cursor: 'pointer', userSelect: 'none',
                color: prodSort === key ? '#111' : '#888',
              }}
            >{label}{prodSort === key ? ' ↓' : ''}</span>
          );
          return (
            <div style={{ border: '1px solid #eee', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
              <div style={{ display: 'grid', gridTemplateColumns: PRODGRID, padding: pad, background: '#f7f8fa', borderBottom: '1px solid #eee', fontSize: mob ? 10 : 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#888' }}>
                <span>#</span>
                {sortHead('name', 'Товар', 'left')}
                {!mob && <span>Сет</span>}
                {sortHead('qty', mob ? 'Шт' : 'Продано, шт')}
                {sortHead('sum', mob ? cur : `Сумма, ${cur}`)}
                {!mob && <span style={{ textAlign: 'right' }}>% ∑</span>}
              </div>

              {productRows.map((p, i) => {
                const pctSum = prodTotalSum > 0 ? Math.round(p.sum / prodTotalSum * 100) : 0;
                const ret = isReturn(p);
                return (
                  <div key={p.productName} style={{ display: 'grid', gridTemplateColumns: PRODGRID, padding: pad, borderBottom: '1px solid #f5f5f5', fontSize: mob ? 12.5 : 13, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: '#ccc', fontWeight: 600 }}>{i + 1}</span>
                    <div style={{ minWidth: 0, paddingRight: 8 }}>
                      <span
                        style={mob
                          ? { color: '#333', display: 'block', overflowWrap: 'anywhere', lineHeight: 1.3 }
                          : { color: '#333', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={p.productName}
                      >
                        {p.productName}
                        {ret && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 800, color: '#c0392b', background: '#fdecec', borderRadius: 20, padding: '1px 7px' }}>возврат</span>}
                      </span>
                      {mob && <span style={{ display: 'block', fontSize: 10.5, color: '#aaa', marginTop: 2 }}>{setLabel(p.set)}</span>}
                    </div>
                    {!mob && <span style={{ fontSize: 11.5, color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{setLabel(p.set)}</span>}
                    <span style={{ textAlign: 'right', fontWeight: 700, color: p.qty < 0 ? '#c0392b' : '#1e7e34' }}>{money(p.qty)}</span>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontWeight: 600, color: p.sum < 0 ? '#c0392b' : '#111' }}>{sumFmt(p.sum)}</span>
                      {mob && <div style={{ fontSize: 10.5, color: '#bbb' }}>{pctSum}%</div>}
                    </div>
                    {!mob && <span style={{ textAlign: 'right', fontSize: 11.5, color: '#aaa' }}>{pctSum}%</span>}
                  </div>
                );
              })}

              <div style={{ display: 'grid', gridTemplateColumns: PRODGRID, padding: mob ? '11px 10px' : '11px 16px', background: '#f7f8fa', fontSize: mob ? 12 : 13 }}>
                <span />
                <span style={{ fontWeight: 700, color: '#111' }}>Итого · {productRows.length} поз.</span>
                {!mob && <span />}
                <span style={{ textAlign: 'right', fontWeight: 800, color: '#1e7e34' }}>{money(prodTotalQty)}{mob ? '' : ' шт'}</span>
                <span style={{ textAlign: 'right', fontWeight: 800, color: '#111' }}>{sumFmt(prodTotalSum)}</span>
                {!mob && <span />}
              </div>
            </div>
          );
        })()
      ) : (
        /* ── По сетам ── товары по сетам, строка раскрывается в список товаров */
        (() => {
          // Мобильный разрез: «% от итога» и «Позиций» уходят под название сета
          const SETGRID = mob ? '20px minmax(0, 1fr) 44px 86px' : '28px minmax(0, 1fr) 84px 78px 96px 108px';
          const pad = mob ? '9px 10px' : '9px 16px';
          return (
        <div style={{ border: '1px solid #eee', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
          <div style={{ display: 'grid', gridTemplateColumns: SETGRID, padding: pad, background: '#f7f8fa', borderBottom: '1px solid #eee', fontSize: mob ? 10 : 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            <span>#</span><span>Сет</span>
            {!mob && <span style={{ textAlign: 'right' }}>% от итога</span>}
            {!mob && <span style={{ textAlign: 'right' }}>Позиций</span>}
            <span style={{ textAlign: 'right' }}>{mob ? 'Шт' : 'Продано, шт'}</span>
            <span style={{ textAlign: 'right' }}>{mob ? cur : `Сумма, ${cur}`}</span>
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
                  style={{ display: 'grid', gridTemplateColumns: SETGRID, padding: mob ? '10px' : '10px 16px', borderBottom: '1px solid #f5f5f5', fontSize: mob ? 12.5 : 13, alignItems: 'center', cursor: 'pointer', background: isOpen ? '#f7fbff' : 'transparent' }}
                  onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = '#fafafa'; }}
                  onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ fontSize: 11, color: '#ccc', fontWeight: 600 }}>{i + 1}</span>
                  <div style={{ minWidth: 0, paddingRight: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: mob ? 6 : 8, minWidth: 0 }}>
                      <span style={{ fontSize: 11, color: '#bbb', width: 10, flexShrink: 0 }}>{isOpen ? '▼' : '▶'}</span>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                      <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{setLabel(s.set)}</span>
                      {setReturns > 0 && (
                        <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 800, color: '#c0392b', background: '#fdecec', borderRadius: 20, padding: '1px 7px', whiteSpace: 'nowrap' }}>↩ {setReturns}{mob ? '' : ' возвр.'}</span>
                      )}
                    </div>
                    {mob && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, paddingLeft: 26 }}>
                        <div style={{ flex: 1, height: 3, background: '#f0f0f0', borderRadius: 2, minWidth: 0 }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
                        </div>
                        <span style={{ fontSize: 10.5, color: '#aaa', whiteSpace: 'nowrap' }}>{pct}% · {s.positions} поз.</span>
                      </div>
                    )}
                  </div>
                  {!mob && (
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 11, color: '#aaa' }}>{pct}%</span>
                      <div style={{ height: 3, background: '#f0f0f0', borderRadius: 2, marginTop: 3 }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
                      </div>
                    </div>
                  )}
                  {!mob && <span style={{ textAlign: 'right', fontWeight: 600, color: '#555' }}>{s.positions}</span>}
                  <span style={{ textAlign: 'right', fontWeight: 700, color: s.qty < 0 ? '#c0392b' : '#1e7e34' }}>{money(s.qty)}{mob ? '' : ' шт'}</span>
                  <span style={{ textAlign: 'right', fontWeight: 600, color: '#111' }}>{sumFmt(s.sum)}</span>
                </div>

                {isOpen && (
                  <div style={{ background: '#fafafa', padding: mob ? '4px 10px 12px 20px' : '4px 16px 12px 44px', borderBottom: '1px solid #f0f0f0' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                      <thead>
                        <tr style={{ color: '#aaa', textAlign: 'left' }}>
                          <th style={{ fontWeight: 600, padding: '6px 4px' }}>Товар</th>
                          <th style={{ fontWeight: 600, padding: '6px 4px', textAlign: 'right', width: 70 }}>Кол-во</th>
                          <th style={{ fontWeight: 600, padding: '6px 4px', textAlign: 'right', width: 100 }}>Сумма, {cur}</th>
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
                            <td style={{ padding: '5px 4px', textAlign: 'right', fontWeight: 600, color: p.sum < 0 ? '#c0392b' : '#111' }}>{sumFmt(p.sum)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ display: 'grid', gridTemplateColumns: SETGRID, padding: mob ? '11px 10px' : '11px 16px', background: '#f7f8fa', fontSize: mob ? 12 : 13 }}>
            <span />
            <span style={{ fontWeight: 700, color: '#111' }}>Итого{mob ? ` · ${data.sets.reduce((n, s) => n + s.positions, 0)} поз.` : ''}</span>
            {!mob && <span />}
            {!mob && <span style={{ textAlign: 'right', fontWeight: 800, color: '#555' }}>{data.sets.reduce((n, s) => n + s.positions, 0)}</span>}
            <span style={{ textAlign: 'right', fontWeight: 800, color: '#1e7e34' }}>{money(data.grandQty)}{mob ? '' : ' шт'}</span>
            <span style={{ textAlign: 'right', fontWeight: 800, color: '#111' }}>{sumFmt(data.grandSum)}</span>
          </div>
        </div>
          );
        })()
      )}
    </div>
  );
}
