import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  adminGetTelegramQueue, adminSaveTelegramQueueConfig, adminAddTelegramQueue,
  adminAddTelegramQueueSet, adminDeleteTelegramQueue, adminPublishTelegramQueueNow,
  adminClearTelegramQueue, adminGetTelegramChannel, adminGetProducts, adminGetBrands,
} from '../../api';
import { cloudinaryOpt } from '../../utils/drive';

const L = { fontSize: 12, fontWeight: 700, color: '#666', display: 'block', marginBottom: 8 };
const inputStyle = { padding: '9px 12px', borderRadius: 9, border: '1.5px solid #e0e0e0', fontSize: 14, outline: 'none', boxSizing: 'border-box' };
const card = { background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 1px 6px rgba(0,0,0,.07)', marginBottom: 20 };

function thumb(url) { return url ? cloudinaryOpt(url, 200) : ''; }

// Час KG (UTC+6) → человекочитаемая строка ЧЧ:00
const hh = (h) => `${String(h).padStart(2, '0')}:00`;

// Грубая оценка времени публикации i-го поста в очереди (без учёта окна — с пометкой ≈).
function estimate(config, index) {
  const base = config.nextAt ? new Date(config.nextAt).getTime() : Date.now();
  const t = new Date(Math.max(base, Date.now()) + index * config.intervalMinutes * 60000);
  return t.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function AdminTelegramQueue() {
  const navigate = useNavigate();

  const [config, setConfig]   = useState(null);
  const [pending, setPending] = useState([]);
  const [recent, setRecent]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [channelConfigured, setChannelConfigured] = useState(true);
  const [msg, setMsg] = useState('');

  // локальная форма настроек
  const [interval, setIntervalMin] = useState(180);
  const [wStart, setWStart] = useState(9);
  const [wEnd,   setWEnd]   = useState(21);
  const [savingCfg, setSavingCfg] = useState(false);

  // добавление товара
  const [productQ, setProductQ] = useState('');
  const [results, setResults]   = useState([]);
  const [searching, setSearching] = useState(false);
  const searchDebounce = useRef(null);

  // добавление сета
  const [brands, setBrands]     = useState([]);
  const [brandKey, setBrandKey] = useState('');
  const [setKey, setSetKey]     = useState('');
  const [addingSet, setAddingSet] = useState(false);

  const load = async () => {
    try {
      const r = await adminGetTelegramQueue();
      setConfig(r.data.config);
      setPending(r.data.pending || []);
      setRecent(r.data.recent || []);
      if (r.data.config) {
        setIntervalMin(r.data.config.intervalMinutes);
        setWStart(r.data.config.windowStartHour);
        setWEnd(r.data.config.windowEndHour);
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => {
    load();
    adminGetTelegramChannel().then(r => setChannelConfigured(!!r.data?.configured)).catch(() => {});
    adminGetBrands().then(r => setBrands(r.data || [])).catch(() => {});
  }, []);

  // Поиск товаров
  useEffect(() => {
    clearTimeout(searchDebounce.current);
    if (!productQ.trim()) { setResults([]); return; }
    searchDebounce.current = setTimeout(() => {
      setSearching(true);
      adminGetProducts({ search: productQ, limit: 10 })
        .then(r => setResults(r.data.products || r.data || []))
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 300);
  }, [productQ]);

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(''), 3000); };

  const saveConfig = async (patch = {}) => {
    setSavingCfg(true);
    try {
      const body = {
        intervalMinutes: Number(interval),
        windowStartHour: Number(wStart),
        windowEndHour: Number(wEnd),
        ...patch,
      };
      const r = await adminSaveTelegramQueueConfig(body);
      setConfig(r.data.config);
      flash('Настройки сохранены');
    } catch (e) {
      flash(e.response?.data?.message || 'Ошибка сохранения');
    }
    setSavingCfg(false);
  };

  const toggleActive = () => saveConfig({ active: !config?.active });

  const addProduct = async (p) => {
    setProductQ(''); setResults([]);
    try {
      await adminAddTelegramQueue([p._id]);
      flash(`Добавлен: ${p.fullName || p.name}`);
      load();
    } catch (e) { flash(e.response?.data?.message || 'Ошибка'); }
  };

  const addSet = async () => {
    if (!setKey) return;
    setAddingSet(true);
    try {
      const r = await adminAddTelegramQueueSet({ set: setKey, brand: brandKey || undefined });
      flash(`Добавлено товаров: ${r.data.added}`);
      load();
    } catch (e) { flash(e.response?.data?.message || 'Ошибка'); }
    setAddingSet(false);
  };

  const removeItem = async (id) => {
    try { await adminDeleteTelegramQueue(id); load(); }
    catch (e) { flash(e.response?.data?.message || 'Ошибка'); }
  };

  const publishNow = async (id) => {
    try { await adminPublishTelegramQueueNow(id); flash('Опубликовано'); load(); }
    catch (e) { flash(e.response?.data?.message || 'Ошибка публикации'); }
  };

  const clearAll = async () => {
    if (!window.confirm('Удалить все ожидающие посты из очереди?')) return;
    try { await adminClearTelegramQueue(); load(); }
    catch (e) { flash(e.response?.data?.message || 'Ошибка'); }
  };

  const selectedBrand = brands.find(b => b.key === brandKey);
  const setsOfBrand = selectedBrand?.sets || [];

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>Загрузка…</div>;

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '28px 0 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <button onClick={() => navigate('/admin')} style={{
          background: 'none', border: '1.5px solid #e0e0e0', borderRadius: 8,
          padding: '6px 14px', fontSize: 13, cursor: 'pointer', color: '#555', fontWeight: 600,
        }}>← Назад</button>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>🗓 Очередь публикаций в Telegram</h1>
      </div>

      {!channelConfigured && (
        <div style={{ fontSize: 13, color: '#8a6d00', background: '#fff8e1', border: '1px solid #ffe08a', padding: '12px 16px', borderRadius: 10, marginBottom: 20 }}>
          ⚠️ Канал не настроен. Задайте <b>TELEGRAM_CHANNEL_ID</b> на сервере и добавьте бота администратором канала — иначе публикация не сработает.
        </div>
      )}

      {msg && (
        <div style={{ fontSize: 13, color: '#1e7c3a', background: '#eafaf1', padding: '10px 14px', borderRadius: 8, marginBottom: 16 }}>{msg}</div>
      )}

      {/* Настройки расписания */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Расписание</h2>
          <button onClick={toggleActive} disabled={savingCfg} style={{
            padding: '9px 22px', borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            background: config?.active ? '#e74c3c' : '#27ae60', color: '#fff',
          }}>{config?.active ? '⏸ Пауза' : '▶ Старт'}</button>
        </div>

        <div style={{
          fontSize: 13, marginBottom: 20, padding: '8px 14px', borderRadius: 8,
          background: config?.active ? '#eafaf1' : '#f4f4f4', color: config?.active ? '#1e7c3a' : '#888',
        }}>
          {config?.active
            ? `Очередь активна. Постов в ожидании: ${pending.length}.`
            : 'Очередь на паузе — автопубликация не идёт.'}
          {config?.active && config?.nextAt && pending.length > 0 && (
            <> Следующий пост ≈ {estimate(config, 0)}.</>
          )}
        </div>

        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={L}>Интервал между постами (мин)</label>
            <input type="number" min={1} value={interval} onChange={e => setIntervalMin(e.target.value)}
              style={{ ...inputStyle, width: 140 }} />
          </div>
          <div>
            <label style={L}>Публиковать с (час, KG)</label>
            <input type="number" min={0} max={23} value={wStart} onChange={e => setWStart(e.target.value)}
              style={{ ...inputStyle, width: 100 }} />
          </div>
          <div>
            <label style={L}>до (час, KG)</label>
            <input type="number" min={0} max={24} value={wEnd} onChange={e => setWEnd(e.target.value)}
              style={{ ...inputStyle, width: 100 }} />
          </div>
          <button onClick={() => saveConfig()} disabled={savingCfg} style={{
            padding: '9px 20px', borderRadius: 10, border: '1.5px solid #3463A3',
            background: '#fff', color: '#3463A3', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}>{savingCfg ? '…' : 'Сохранить'}</button>
        </div>
        <div style={{ fontSize: 12, color: '#aaa', marginTop: 10 }}>
          Окно {hh(Number(wStart))}–{hh(Number(wEnd))} по времени Кыргызстана. Вне окна очередь ждёт до утра.
        </div>
      </div>

      {/* Добавление в очередь */}
      <div style={card}>
        <h2 style={{ margin: '0 0 18px', fontSize: 16, fontWeight: 700 }}>Добавить в очередь</h2>

        {/* Товар */}
        <label style={L}>Отдельный товар</label>
        <div style={{ position: 'relative', marginBottom: 22 }}>
          <input value={productQ} onChange={e => setProductQ(e.target.value)} placeholder="Поиск по названию…"
            style={{ ...inputStyle, width: '100%' }} />
          {(results.length > 0 || searching) && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1.5px solid #e0e0e0', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,.1)', zIndex: 10, maxHeight: 260, overflowY: 'auto', marginTop: 4 }}>
              {searching && <div style={{ padding: '12px 16px', fontSize: 13, color: '#aaa' }}>Поиск…</div>}
              {results.map(p => (
                <button key={p._id} onClick={() => addProduct(p)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid #f4f4f4' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{p.fullName || p.name}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Сет */}
        <label style={L}>Или весь сет</label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={brandKey} onChange={e => { setBrandKey(e.target.value); setSetKey(''); }}
            style={{ ...inputStyle, minWidth: 170 }}>
            <option value="">Бренд…</option>
            {brands.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
          </select>
          <select value={setKey} onChange={e => setSetKey(e.target.value)} disabled={!brandKey}
            style={{ ...inputStyle, minWidth: 190 }}>
            <option value="">Сет…</option>
            {setsOfBrand.map(s => <option key={s.key} value={s.key}>{s.labelRu || s.label}</option>)}
          </select>
          <button onClick={addSet} disabled={!setKey || addingSet} style={{
            padding: '9px 20px', borderRadius: 10, border: 'none',
            background: !setKey ? '#ccc' : '#3463A3', color: '#fff', fontSize: 14, fontWeight: 700,
            cursor: !setKey ? 'default' : 'pointer',
          }}>{addingSet ? '…' : 'Добавить сет'}</button>
        </div>
      </div>

      {/* Очередь */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>В очереди ({pending.length})</h2>
          {pending.length > 0 && (
            <button onClick={clearAll} style={{ background: 'none', border: 'none', color: '#c0392b', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Очистить всё</button>
          )}
        </div>
        {pending.length === 0 && <div style={{ fontSize: 13, color: '#aaa' }}>Очередь пуста. Добавьте товары или сет выше.</div>}
        {pending.map((it, i) => (
          <div key={it._id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #f4f4f4' }}>
            {it.photoUrl
              ? <img src={thumb(it.photoUrl)} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
              : <div style={{ width: 44, height: 44, borderRadius: 8, background: '#f0f0f0', flexShrink: 0 }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.productName}</div>
              <div style={{ fontSize: 12, color: '#9aa', marginTop: 2 }}>
                {it.status === 'publishing' ? 'публикуется…' : config?.active ? `≈ ${estimate(config, i)}` : '№' + (i + 1)}
              </div>
            </div>
            <button onClick={() => publishNow(it._id)} title="Опубликовать сейчас" style={{ background: 'none', border: '1.5px solid #229ED9', color: '#229ED9', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Сейчас</button>
            <button onClick={() => removeItem(it._id)} disabled={it.status === 'publishing'} style={{ background: 'none', border: 'none', color: '#bbb', fontSize: 20, cursor: 'pointer' }}>×</button>
          </div>
        ))}
      </div>

      {/* История */}
      {recent.length > 0 && (
        <div style={card}>
          <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>Опубликовано недавно</h2>
          {recent.map(it => (
            <div key={it._id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid #f7f7f7' }}>
              <span style={{ fontSize: 15 }}>{it.status === 'published' ? '✅' : '⚠️'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.productName}</div>
                {it.status === 'failed' && <div style={{ fontSize: 11, color: '#c0392b' }}>{it.error}</div>}
              </div>
              <div style={{ fontSize: 11, color: '#bbb', flexShrink: 0 }}>
                {it.publishedAt ? new Date(it.publishedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
              </div>
              {it.status === 'failed' && (
                <button onClick={() => publishNow(it._id)} style={{ background: 'none', border: '1.5px solid #229ED9', color: '#229ED9', borderRadius: 8, padding: '4px 9px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Повторить</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
