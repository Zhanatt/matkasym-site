import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  adminGetProducts, adminUploadImage,
  socialGetAccounts, socialGetFlows, socialGetFlowTargets,
  socialGetDraft, socialPreview, socialPublish, socialGetPublishStats,
  socialSaveProductName,
} from '../../api';
import { cloudinaryOpt } from '../../utils/drive';
import { POST_TYPES, platformMeta } from '../../config/socialPlatforms';
import { signOf } from '../../utils/price';

// Куда товар уже уходил: иконка площадки и сколько раз. Нужно, чтобы не отправить
// один и тот же товар дважды — в поиске это видно до выбора.
function PublishedBadges({ stat, size = 11 }) {
  const counts = stat?.counts || {};
  const items = Object.entries(counts).filter(([, n]) => n > 0);
  if (!items.length) return null;
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      {items.map(([platform, n]) => {
        const m = platformMeta(platform);
        return (
          <span key={platform}
            title={`${m.label}: опубликован ${n} раз${n === 1 ? '' : n < 5 ? 'а' : ''}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              fontSize: size, fontWeight: 700, color: m.color,
              background: `${m.color}14`, borderRadius: 20, padding: '1px 7px', whiteSpace: 'nowrap',
            }}>
            <span style={{ fontSize: size + 1 }}>{m.icon}</span>{n}
          </span>
        );
      })}
    </span>
  );
}

const CARD = { background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 1px 6px rgba(0,0,0,.07)', marginBottom: 16 };
const L    = { fontSize: 12, fontWeight: 700, color: '#666', display: 'block', marginBottom: 8 };
const INP  = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e0e0e0', fontSize: 14, outline: 'none', boxSizing: 'border-box' };

// И Telegram (sendMediaGroup), и Instagram (карусель) принимают не больше 10 картинок —
// столько же отмечаем автоматически, чтобы в UI не было выбрано больше, чем реально уйдёт.
const MAX_IMAGES = 10;

const fmtPrice = (n) => Number(n || 0).toLocaleString('ru-RU');

// Язык поста. Кыргызский — основной: на нём говорит канал и Instagram.
// Казахский нужен для казахстанского направления, переключается кнопкой.
const LANGS = [['ky', '🇰🇬 Кыргызча'], ['kk', '🇰🇿 Қазақша']];

// Текущий момент в формате datetime-local — ставим полем min, чтобы в календаре
// нельзя было выбрать уже прошедшее время.
const localNow = () => {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
};

// Грубое HTML→текст для предпросмотра: разметку площадки рендерят сами.
const stripHtml = (s) => String(s || '').replace(/<\/?[bi]>/g, '').replace(/&amp;/g, '&');

export default function AdminPublish() {
  const navigate = useNavigate();

  const [productQ, setProductQ] = useState('');
  const [found,    setFound]    = useState([]);
  const [searching, setSearching] = useState(false);
  const [product,  setProduct]  = useState(null);
  const [pubStats, setPubStats] = useState({});    // productId → { counts, last }

  const [images,   setImages]   = useState([]);     // все кандидаты
  const [picked,   setPicked]   = useState([]);     // выбранные индексы (порядок = порядок в карусели)
  const [text,     setText]     = useState('');
  const [priceMode, setPriceMode] = useState('retail');  // retail | wholesale
  const [lang,     setLang]     = useState('ky');        // ky | kk
  // Заголовок поста: что подставил словарь, что вписано руками в карточку.
  const [titleAuto,   setTitleAuto]   = useState('');
  const [titleInput,  setTitleInput]  = useState('');
  const [titleSaved,  setTitleSaved]  = useState('');    // последнее сохранённое в карточку
  const [savingTitle, setSavingTitle] = useState(false);
  const [textDirty, setTextDirty] = useState(false);     // текст правили руками
  const [uploading, setUploading] = useState(false);

  const [accounts, setAccounts] = useState([]);
  const [flows,    setFlows]    = useState([]);
  const [flowId,   setFlowId]   = useState('');
  const [targets,  setTargets]  = useState({});     // accountId → { postType, delayMinutes, captionTemplate }

  const [previews, setPreviews] = useState([]);
  const [scheduledAt, setScheduledAt] = useState('');
  const [sending,  setSending]  = useState(false);
  const [result,   setResult]   = useState(null);
  const [error,    setError]    = useState('');

  const debounce   = useRef(null);
  const fileInput  = useRef(null);
  const schedInput = useRef(null);   // нужен, чтобы поймать недовведённую дату (см. publish)

  // Статистика публикаций грузится один раз: список короткий, а в поиске нужна мгновенно
  useEffect(() => {
    socialGetPublishStats().then(r => setPubStats(r.data || {})).catch(() => {});
  }, []);

  useEffect(() => {
    socialGetAccounts().then(r => setAccounts((r.data.accounts || []).filter(a => a.enabled))).catch(() => {});
    socialGetFlows().then(r => {
      const list = r.data.flows || [];
      setFlows(list);
      const def = list.find(f => f.isDefault) || list[0];
      if (def) applyFlow(def._id);
    }).catch(() => {});
  }, []);

  // Схема — пресет: подставляет свой набор площадок с их настройками, дальше правится галочками.
  const applyFlow = async (id) => {
    setFlowId(id);
    if (!id) { setTargets({}); return; }
    try {
      const r = await socialGetFlowTargets(id);
      const next = {};
      (r.data.targets || []).forEach(t => {
        next[t.accountId] = { postType: t.postType, delayMinutes: t.delayMinutes, captionTemplate: t.captionTemplate };
      });
      setTargets(next);
    } catch { /* схема могла быть удалена — оставляем ручной выбор */ }
  };

  useEffect(() => {
    clearTimeout(debounce.current);
    if (!productQ.trim()) { setFound([]); return; }
    debounce.current = setTimeout(() => {
      setSearching(true);
      adminGetProducts({ search: productQ, limit: 10 })
        .then(r => setFound(r.data.products || r.data || []))
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 300);
  }, [productQ]);

  const selectProduct = async (p) => {
    setProductQ(''); setFound([]); setError(''); setResult(null);
    try {
      const r = await socialGetDraft(p._id, priceMode, lang);
      setProduct({ ...p, ...(r.data.product || {}) });
      const imgs = r.data.images || [];
      setImages(imgs);
      // По умолчанию берём ВСЕ фото товара — чаще всего нужен весь набор,
      // а лишнее проще снять, чем отмечать каждое вручную. Больше 10 площадки не примут.
      setPicked(imgs.slice(0, MAX_IMAGES).map((_, i) => i));
      setText(r.data.text || '');
      setTextDirty(false);
      applyTitle(r.data);
    } catch (e) {
      setError(e.response?.data?.message || 'Не удалось загрузить товар');
    }
  };

  // Заголовок из ответа сервера: что показывать в поле и с чем сравнивать,
  // чтобы понять, правил ли пользователь название.
  const applyTitle = (d) => {
    setTitleAuto(d.titleAuto || '');
    setTitleSaved(d.titleManual || '');
    setTitleInput(d.title || '');
  };

  const reset = () => {
    setProduct(null); setImages([]); setPicked([]); setText('');
    setError(''); setResult(null); setPreviews([]); setTextDirty(false);
    setTitleAuto(''); setTitleInput(''); setTitleSaved('');
  };

  // Смена цены перегенерирует весь текст: подменять одну строку регуляркой
  // ненадёжно — пользователь мог её отредактировать или перенести.
  const changePriceMode = async (mode) => {
    if (mode === priceMode) return;
    if (textDirty && !window.confirm('Текст правили вручную — при смене цены он будет перегенерирован. Продолжить?')) return;
    setPriceMode(mode);
    await regenerate({ priceMode: mode });
  };

  // Перевод поста: текст собирается заново на выбранном языке. Название берётся
  // из карточки (если вписано руками) или из словаря типов товара, описание
  // остаётся русским — машинного перевода в проекте нет.
  const changeLang = async (next) => {
    if (next === lang) return;
    if (textDirty && !window.confirm('Текст правили вручную — при смене языка он будет перегенерирован. Продолжить?')) return;
    setLang(next);
    await regenerate({ lang: next });
  };

  const regenerate = async (over = {}) => {
    if (!product) return;
    try {
      const r = await socialGetDraft(product._id, over.priceMode || priceMode, over.lang || lang);
      setText(r.data.text || '');
      setTextDirty(false);
      setPreviews([]);
      applyTitle(r.data);
    } catch {
      setError('Не удалось перегенерировать текст');
    }
  };

  // Название на выбранном языке сохраняется в карточку товара: словарь знает
  // частые типы товара, а не весь каталог, и правку нет смысла делать заново
  // при каждом посте. Пустое поле — вернуться к словарю.
  const saveTitle = async () => {
    if (!product) return;
    setSavingTitle(true); setError('');
    try {
      const value = titleInput.trim() === titleAuto.trim() ? '' : titleInput.trim();
      await socialSaveProductName(product._id, lang, value);
      await regenerate();
    } catch (e) {
      setError(e.response?.data?.message || 'Не удалось сохранить название');
    }
    setSavingTitle(false);
  };

  const togglePick = (i) => {
    setPicked(p => p.includes(i) ? p.filter(x => x !== i) : [...p, i]);
    setPreviews([]);
  };

  // Снять все / вернуть все: снимать по одной при 8 картинках — то ещё удовольствие.
  const toggleAllPicks = () => {
    setPicked(p => p.length ? [] : images.slice(0, MAX_IMAGES).map((_, i) => i));
    setPreviews([]);
  };

  const upload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append('image', file);
        const res = await adminUploadImage(fd);
        if (res.data?.url) {
          setImages(prev => { const next = [...prev, res.data.url]; setPicked(p => [...p, next.length - 1]); return next; });
        }
      }
    } catch {
      setError('Ошибка загрузки фото');
    }
    setUploading(false);
    e.target.value = '';
  };

  const toggleTarget = (a) => {
    setTargets(t => {
      const next = { ...t };
      if (next[a._id]) delete next[a._id];
      else next[a._id] = { postType: a.postTypes?.[0] || 'feed', delayMinutes: 0, captionTemplate: '' };
      return next;
    });
    setPreviews([]);
  };

  const setTargetPostType = (id, postType) => {
    setTargets(t => ({ ...t, [id]: { ...t[id], postType } }));
    setPreviews([]);
  };

  const targetList = () => Object.entries(targets).map(([accountId, cfg]) => ({ accountId, ...cfg }));

  const loadPreview = async () => {
    setError('');
    try {
      const r = await socialPreview({ productId: product?._id, text, targets: targetList(), lang });
      setPreviews(r.data.previews || []);
    } catch (e) {
      setError(e.response?.data?.message || 'Не удалось построить предпросмотр');
    }
  };

  const publish = async () => {
    const list = targetList();
    if (!list.length)     { setError('Не выбрана ни одна площадка'); return; }
    if (!text.trim())     { setError('Пустой текст поста'); return; }

    // Недовведённая дата в datetime-local (вписан день, но не время) — это ПУСТОЕ
    // значение: браузер показывает «12.08.2026 --:--», а value остаётся ''. Молча
    // опубликовать сразу в этом случае нельзя — человек ждёт отложку.
    if (!scheduledAt && schedInput.current?.validity?.badInput) {
      setError('Дата отложенной публикации введена не полностью — укажите и дату, и время (или нажмите «Сразу»).');
      return;
    }
    if (scheduledAt && new Date(scheduledAt).getTime() <= Date.now()) {
      setError('Время отложенной публикации уже прошло — выберите будущее время.');
      return;
    }

    setSending(true); setError(''); setResult(null);
    try {
      const r = await socialPublish({
        kind: 'product',           // свободных постов на этой странице нет — публикуем только товары
        productId: product?._id,
        text: text.trim(),
        lang,
        images: picked.map(i => images[i]).filter(Boolean),
        flowId: flowId || undefined,
        targets: list,
        // Отправляем момент времени, а не «голую» строку: сервер на Render живёт в UTC
        // и «20:00» без зоны понял бы как 20:00 UTC — пост ушёл бы на 6 часов позже.
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
      });
      setResult(r.data);
      // Счётчики «где уже публиковали» должны сразу учесть этот пост
      socialGetPublishStats().then(x => setPubStats(x.data || {})).catch(() => {});
    } catch (e) {
      setError(e.response?.data?.message || 'Ошибка публикации');
    }
    setSending(false);
  };

  const selectedImages = picked.map(i => images[i]).filter(Boolean);
  const canPublish = Object.keys(targets).length > 0 && text.trim() && product;

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '28px 0 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>🚀 Автопубликация</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/admin/publish/flow')}     style={navBtn}>🧩 Схема</button>
          <button onClick={() => navigate('/admin/publish/accounts')} style={navBtn}>🔌 Площадки</button>
          <button onClick={() => navigate('/admin/publish/history')}  style={navBtn}>📜 Журнал</button>
        </div>
      </div>

      {!accounts.length && (
        <div style={{ fontSize: 13, color: '#8a6d00', background: '#fff8e1', border: '1px solid #ffe08a', padding: '12px 16px', borderRadius: 10, marginBottom: 18 }}>
          Нет включённых площадок. Сначала <b style={{ cursor: 'pointer' }} onClick={() => navigate('/admin/publish/accounts')}>подключите их →</b>
        </div>
      )}

      {/* 1. Что публикуем */}
      <div style={CARD}>
        <label style={L}>Что публикуем</label>

        {product ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#f7f8fa', border: '1.5px solid #e0e0e0', borderRadius: 10, padding: '10px 14px' }}>
            {images[0] && <img src={cloudinaryOpt(images[0], 300)} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111' }}>{product.fullName || product.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#7d96a0' }}>
                  {product.priceUndefined || !product.price ? 'Цена по запросу' : `${fmtPrice(product.price)} ${signOf(product)}`}
                </span>
                <PublishedBadges stat={pubStats[product._id]} />
              </div>
            </div>
            <button onClick={reset} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 20 }}>×</button>
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            <input value={productQ} onChange={e => setProductQ(e.target.value)}
              placeholder="Поиск товара по названию..." style={INP} />
            {(found.length > 0 || searching) && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1.5px solid #e0e0e0', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,.1)', zIndex: 10, maxHeight: 260, overflowY: 'auto', marginTop: 4 }}>
                {searching && <div style={{ padding: '12px 16px', fontSize: 13, color: '#aaa' }}>Поиск...</div>}
                {found.map(p => (
                  <button key={p._id} onClick={() => selectProduct(p)}
                    style={{ display: 'block', width: '100%', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid #f4f4f4' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{p.fullName || p.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                      <span style={{ fontSize: 11, color: '#aaa' }}>{p.priceUndefined || !p.price ? 'Цена по запросу' : `${fmtPrice(p.price)} ${signOf(p)}`}</span>
                      <PublishedBadges stat={pubStats[p._id]} size={10} />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {product && (
        <>
          {/* 2. Контент */}
          <div style={CARD}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
              <label style={{ ...L, marginBottom: 0 }}>
                Фото <span style={{ color: '#bbb', fontWeight: 400 }}>
                  (отмечены все — уйдут альбомом/каруселью; в историю Instagram — только первое)
                </span>
              </label>
              {images.length > 1 && (
                <button onClick={toggleAllPicks} style={{
                  marginLeft: 'auto', background: 'none', border: 'none', padding: 0,
                  fontSize: 12, fontWeight: 700, color: '#3463A3', cursor: 'pointer',
                }}>
                  {picked.length ? 'Снять все' : 'Выбрать все'}
                </button>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 22 }}>
              {images.map((url, i) => {
                const pos = picked.indexOf(i);
                return (
                  <button key={i} onClick={() => togglePick(i)} style={{
                    position: 'relative', width: 84, height: 84, borderRadius: 10, padding: 0,
                    cursor: 'pointer', overflow: 'hidden', background: '#fafafa',
                    border: pos >= 0 ? '3px solid #111' : '2px solid #e0e0e0',
                  }}>
                    <img src={cloudinaryOpt(url, 300)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    {pos >= 0 && (
                      <span style={{
                        position: 'absolute', top: 4, left: 4, background: '#111', color: '#fff',
                        fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '1px 6px',
                      }}>{pos + 1}</span>
                    )}
                  </button>
                );
              })}
              <button onClick={() => fileInput.current?.click()} disabled={uploading} style={{
                width: 84, height: 84, borderRadius: 10, border: '2px dashed #ddd', background: '#fafafa',
                cursor: uploading ? 'wait' : 'pointer', color: '#999', fontSize: 11, fontWeight: 600,
              }}>{uploading ? '...' : '+ Фото'}</button>
              <input ref={fileInput} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={upload} />
            </div>

            {picked.length > MAX_IMAGES && (
              <div style={{ fontSize: 12, color: '#b8860b', marginTop: -14, marginBottom: 18 }}>
                Отмечено {picked.length} фото — площадки примут только первые {MAX_IMAGES}.
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
              <label style={{ ...L, margin: 0 }}>Текст <span style={{ color: '#bbb', fontWeight: 400 }}>(поддерживает &lt;b&gt;; для Битрикс24 переводится в его разметку)</span></label>
              {product && (
                <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
                  {LANGS.map(([code, label]) => (
                    <button key={code} onClick={() => changeLang(code)}
                      title={code === 'kk' ? 'Перевести пост на казахский' : 'Пост на кыргызском'}
                      style={{
                        padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        border: lang === code ? '2px solid #111' : '1.5px solid #e0e0e0',
                        background: lang === code ? '#f4f5f7' : '#fff', color: '#111',
                      }}>{label}</button>
                  ))}
                  <span style={{ width: 1, background: '#e6e8eb', margin: '2px 4px' }} />
                  {[['retail', '🏷 Розничная'], ['wholesale', '📦 Оптовая']].map(([m, label]) => {
                    const missing = m === 'wholesale' && !product.priceWholesale;
                    return (
                      <button key={m} onClick={() => changePriceMode(m)} disabled={missing}
                        title={missing ? 'У товара не заполнена оптовая цена' : ''}
                        style={{
                          padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                          cursor: missing ? 'not-allowed' : 'pointer',
                          border: priceMode === m ? '2px solid #111' : '1.5px solid #e0e0e0',
                          background: priceMode === m ? '#f4f5f7' : '#fff',
                          color: missing ? '#bbb' : '#111',
                        }}>{label}</button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Название на языке поста. Словарь знает частые типы товара, но не
                весь каталог: то, что он не осилил, правится здесь один раз и
                остаётся в карточке товара — следующий пост возьмёт готовое. */}
            {product && (
              <div style={{ background: '#f7f9fb', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#5c6873', whiteSpace: 'nowrap' }}>
                    Название {lang === 'kk' ? 'по-казахски' : 'по-кыргызски'}
                  </span>
                  <input value={titleInput} onChange={e => setTitleInput(e.target.value)}
                    placeholder={titleAuto}
                    style={{ ...INP, flex: '1 1 220px', width: 'auto', padding: '7px 11px', fontSize: 13, background: '#fff' }} />
                  <button onClick={saveTitle} disabled={savingTitle || titleInput.trim() === (titleSaved || titleAuto).trim()}
                    style={{
                      padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: 'none',
                      background: savingTitle || titleInput.trim() === (titleSaved || titleAuto).trim() ? '#dde2e7' : '#111',
                      color: '#fff', cursor: savingTitle ? 'wait' : 'pointer', whiteSpace: 'nowrap',
                    }}>
                    {savingTitle ? '...' : 'Сохранить в карточку'}
                  </button>
                </div>
                <div style={{ fontSize: 10, color: '#aab3bd', marginTop: 5, lineHeight: 1.5 }}>
                  {titleSaved
                    ? <>Вписано в карточку товара. Очистите поле и сохраните — вернётся вариант словаря: «{titleAuto}».</>
                    : <>Собрано словарем из русского названия. Поправьте — сохранится в карточку и подставится в следующие посты.</>}
                </div>
              </div>
            )}

            <textarea value={text} onChange={e => { setText(e.target.value); setTextDirty(true); setPreviews([]); }} rows={8}
              style={{ ...INP, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
            <div style={{ fontSize: 11, color: '#8b98a5', marginTop: 6, lineHeight: 1.5 }}>
              Цена и ссылка на WhatsApp уходят только в Telegram, Битрикс24 и на сайт. В Instagram и Facebook
              строка с ценой вырезается, вместо ссылки встаёт «📲 Буюртма үчүн Direct / WhatsApp'ка жазыңыз»
              (ссылки там всё равно не кликаются), а в конец дописываются 5 тематических хэштегов по товару.
              Свои хэштеги в конце текста — оставляем как есть. Как это выглядит по каждой площадке, видно в предпросмотре.
            </div>
          </div>

          {/* 3. Куда */}
          <div style={CARD}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <label style={{ ...L, margin: 0 }}>Куда публикуем</label>
              <select value={flowId} onChange={e => applyFlow(e.target.value)} style={{
                marginLeft: 'auto', padding: '7px 12px', borderRadius: 8, border: '1.5px solid #e0e0e0', fontSize: 12,
              }}>
                <option value="">Без схемы (вручную)</option>
                {flows.map(f => <option key={f._id} value={f._id}>{f.name}{f.isDefault ? ' ★' : ''}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {accounts.map(a => {
                const meta = platformMeta(a.platform);
                const on   = !!targets[a._id];
                const allowed = a.postTypes?.length ? a.postTypes : ['feed'];
                return (
                  <div key={a._id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10,
                    border: on ? `2px solid ${meta.color}` : '1.5px solid #e8eaed',
                    background: on ? `${meta.color}0d` : '#fff', flexWrap: 'wrap',
                  }}>
                    <input type="checkbox" checked={on} onChange={() => toggleTarget(a)} style={{ width: 17, height: 17, cursor: 'pointer' }} />
                    <span style={{ fontSize: 18 }}>{meta.icon}</span>
                    <div style={{ flex: 1, minWidth: 120 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>{a.title}</div>
                      <div style={{ fontSize: 11, color: '#8b98a5' }}>{meta.label}</div>
                    </div>

                    {on && a.platform === 'instagram' && allowed.length > 1 && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        {allowed.map(t => (
                          <button key={t} onClick={() => setTargetPostType(a._id, t)} style={{
                            padding: '5px 11px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                            border: targets[a._id]?.postType === t ? `2px solid ${meta.color}` : '1.5px solid #e0e0e0',
                            background: targets[a._id]?.postType === t ? '#fff' : '#fafafa', color: '#333',
                          }}>{POST_TYPES[t]?.icon} {POST_TYPES[t]?.label}</button>
                        ))}
                      </div>
                    )}
                    {on && targets[a._id]?.delayMinutes > 0 && (
                      <span style={{ fontSize: 11, color: '#8b98a5', fontWeight: 600 }}>через {targets[a._id].delayMinutes} мин</span>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#666' }}>Отложить до</label>
              <input ref={schedInput} type="datetime-local" min={localNow()}
                value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 9, border: '1.5px solid #e0e0e0', fontSize: 13 }} />
              {scheduledAt ? (
                <>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#1e7c3a' }}>
                    🕓 уйдёт {new Date(scheduledAt).toLocaleString('ru')}
                  </span>
                  <button onClick={() => setScheduledAt('')} style={{ ...navBtn, padding: '6px 12px' }}>Сразу</button>
                </>
              ) : (
                <span style={{ fontSize: 12, color: '#8b98a5' }}>пусто — пост уйдёт сразу</span>
              )}
            </div>
          </div>

          {/* 4. Предпросмотр */}
          <div style={CARD}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <label style={{ ...L, margin: 0 }}>Предпросмотр по площадкам</label>
              <button onClick={loadPreview} style={{ ...navBtn, marginLeft: 'auto' }}>Обновить</button>
            </div>

            {!previews.length ? (
              <div style={{ fontSize: 13, color: '#aaa' }}>Нажмите «Обновить», чтобы увидеть итоговый текст для каждой площадки.</div>
            ) : (
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                {previews.map(p => {
                  const meta = platformMeta(p.platform);
                  const isStory = p.postType === 'story';
                  return (
                    <div key={p.accountId + p.postType} style={{ width: 250, background: '#eef0f3', borderRadius: 12, padding: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: meta.color, marginBottom: 8 }}>
                        {meta.icon} {p.title}{isStory ? ' · история' : ''}
                      </div>
                      <div style={{ background: '#fff', borderRadius: 10, overflow: 'hidden' }}>
                        {selectedImages[0] && (
                          <img src={cloudinaryOpt(selectedImages[0], 400)} alt="" style={{
                            width: '100%', display: 'block', height: isStory ? 200 : 140, objectFit: 'cover',
                          }} />
                        )}
                        <div style={{ padding: '9px 12px', fontSize: 12, whiteSpace: 'pre-wrap', lineHeight: 1.5, color: '#111', maxHeight: 180, overflow: 'auto' }}>
                          {isStory ? <i style={{ color: '#999' }}>У историй нет подписи — уйдёт только фото</i> : stripHtml(p.caption)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {error && <div style={{ fontSize: 13, color: '#c0392b', background: '#fdf0ef', padding: '11px 15px', borderRadius: 9, marginBottom: 16 }}>{error}</div>}

          {result && (
            <div style={{ ...CARD, padding: 18 }}>
              {result.scheduled ? (
                <div style={{ fontSize: 13, color: '#1e7c3a' }}>
                  🕓 Публикация{result.publication?.number ? ` №${result.publication.number}` : ''} запланирована
                  {' '}на {new Date(result.publication.scheduledAt).toLocaleString('ru')}
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {result.publication?.number && (
                      <span style={{
                        background: '#eef2f7', color: '#3463A3', borderRadius: 6,
                        padding: '2px 8px', fontSize: 12, fontVariantNumeric: 'tabular-nums',
                      }}>№{result.publication.number}</span>
                    )}
                    <span>Результат: {result.published || 0} опубликовано{result.failed ? `, ${result.failed} с ошибкой` : ''}</span>
                  </div>
                  {(result.publication?.targets || []).map((t, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span>{platformMeta(t.platform).icon}</span>
                      <b>{t.title}</b>
                      {t.status === 'published' && <span style={{ color: '#1e7c3a' }}>✅ опубликовано</span>}
                      {t.status === 'pending'   && <span style={{ color: '#8a6d00' }}>🕓 по расписанию</span>}
                      {t.status === 'skipped'   && <span style={{ color: '#888' }}>пропущено — {t.error}</span>}
                      {t.status === 'failed'    && <span style={{ color: '#c0392b' }}>❌ {t.error}</span>}
                      {/* Опубликовано, но не так, как задумывали (например, вместо альбома ушло одно фото) */}
                      {t.status === 'published' && t.error && <span style={{ color: '#b26a00' }}>⚠️ {t.error}</span>}
                      {t.externalUrl && <a href={t.externalUrl} target="_blank" rel="noreferrer" style={{ color: '#3463A3' }}>открыть</a>}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button onClick={reset} style={{ ...navBtn, padding: '11px 22px', fontSize: 14 }}>Сбросить</button>
            <button onClick={publish} disabled={sending || !canPublish} style={{
              padding: '12px 30px', borderRadius: 10, border: 'none',
              background: sending || !canPublish ? '#bbb' : '#111', color: '#fff', fontSize: 14, fontWeight: 700,
              cursor: sending || !canPublish ? 'default' : 'pointer',
            }}>
              {sending ? 'Публикую...' : scheduledAt ? '🕓 Запланировать' : `🚀 Опубликовать${Object.keys(targets).length ? ` (${Object.keys(targets).length})` : ''}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const navBtn = {
  padding: '7px 14px', borderRadius: 8, border: '1.5px solid #e0e0e0',
  background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#555',
};
