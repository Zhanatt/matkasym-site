import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  adminGetProducts, adminUploadImage,
  socialGetAccounts, socialGetFlows, socialGetFlowTargets,
  socialGetDraft, socialPreview, socialPublish,
} from '../../api';
import { cloudinaryOpt } from '../../utils/drive';
import { POST_TYPES, platformMeta } from '../../config/socialPlatforms';

const CARD = { background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 1px 6px rgba(0,0,0,.07)', marginBottom: 16 };
const L    = { fontSize: 12, fontWeight: 700, color: '#666', display: 'block', marginBottom: 8 };
const INP  = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e0e0e0', fontSize: 14, outline: 'none', boxSizing: 'border-box' };

const fmtPrice = (n) => Number(n || 0).toLocaleString('ru-RU');

// Грубое HTML→текст для предпросмотра: разметку площадки рендерят сами.
const stripHtml = (s) => String(s || '').replace(/<\/?[bi]>/g, '').replace(/&amp;/g, '&');

export default function AdminPublish() {
  const navigate = useNavigate();

  const [kind, setKind] = useState('product');     // product | custom

  const [productQ, setProductQ] = useState('');
  const [found,    setFound]    = useState([]);
  const [searching, setSearching] = useState(false);
  const [product,  setProduct]  = useState(null);

  const [images,   setImages]   = useState([]);     // все кандидаты
  const [picked,   setPicked]   = useState([]);     // выбранные индексы (порядок = порядок в карусели)
  const [text,     setText]     = useState('');
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
      const r = await socialGetDraft(p._id);
      setProduct({ ...p, ...(r.data.product || {}) });
      setImages(r.data.images || []);
      setPicked((r.data.images || []).length ? [0] : []);
      setText(r.data.text || '');
    } catch (e) {
      setError(e.response?.data?.message || 'Не удалось загрузить товар');
    }
  };

  const reset = () => {
    setProduct(null); setImages([]); setPicked([]); setText('');
    setError(''); setResult(null); setPreviews([]);
  };

  const togglePick = (i) => {
    setPicked(p => p.includes(i) ? p.filter(x => x !== i) : [...p, i]);
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
      const r = await socialPreview({ productId: product?._id, text, targets: targetList() });
      setPreviews(r.data.previews || []);
    } catch (e) {
      setError(e.response?.data?.message || 'Не удалось построить предпросмотр');
    }
  };

  const publish = async () => {
    const list = targetList();
    if (!list.length)     { setError('Не выбрана ни одна площадка'); return; }
    if (!text.trim())     { setError('Пустой текст поста'); return; }

    setSending(true); setError(''); setResult(null);
    try {
      const r = await socialPublish({
        kind,
        productId: kind === 'product' ? product?._id : undefined,
        text: text.trim(),
        images: picked.map(i => images[i]).filter(Boolean),
        flowId: flowId || undefined,
        targets: list,
        scheduledAt: scheduledAt || undefined,
      });
      setResult(r.data);
    } catch (e) {
      setError(e.response?.data?.message || 'Ошибка публикации');
    }
    setSending(false);
  };

  const selectedImages = picked.map(i => images[i]).filter(Boolean);
  const canPublish = Object.keys(targets).length > 0 && text.trim() && (kind === 'custom' || product);

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
        <div style={{ display: 'flex', gap: 8, marginBottom: kind === 'product' ? 20 : 0 }}>
          {[['product', '📦 Товар'], ['custom', '✍️ Свободный пост']].map(([k, label]) => (
            <button key={k} onClick={() => { setKind(k); reset(); }} style={{
              padding: '9px 18px', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              border: kind === k ? '2px solid #111' : '1.5px solid #e0e0e0',
              background: kind === k ? '#f4f5f7' : '#fff', color: '#111',
            }}>{label}</button>
          ))}
        </div>

        {kind === 'product' && (product ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#f7f8fa', border: '1.5px solid #e0e0e0', borderRadius: 10, padding: '10px 14px' }}>
            {images[0] && <img src={cloudinaryOpt(images[0], 300)} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111' }}>{product.fullName || product.name}</div>
              <div style={{ fontSize: 12, color: '#7d96a0', marginTop: 2 }}>
                {product.priceUndefined || !product.price ? 'Цена по запросу' : `${fmtPrice(product.price)} сом`}
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
                    <div style={{ fontSize: 11, color: '#aaa' }}>{p.priceUndefined || !p.price ? 'Цена по запросу' : `${fmtPrice(p.price)} сом`}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {(kind === 'custom' || product) && (
        <>
          {/* 2. Контент */}
          <div style={CARD}>
            <label style={L}>
              Фото <span style={{ color: '#bbb', fontWeight: 400 }}>
                (можно несколько — уйдут альбомом/каруселью; в историю Instagram — только первое)
              </span>
            </label>
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

            <label style={L}>Текст <span style={{ color: '#bbb', fontWeight: 400 }}>(поддерживает &lt;b&gt;; для Битрикс24 переводится в его разметку)</span></label>
            <textarea value={text} onChange={e => { setText(e.target.value); setPreviews([]); }} rows={8}
              placeholder={kind === 'custom' ? 'Текст новости или объявления...' : ''}
              style={{ ...INP, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
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
              <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 9, border: '1.5px solid #e0e0e0', fontSize: 13 }} />
              {scheduledAt && (
                <button onClick={() => setScheduledAt('')} style={{ ...navBtn, padding: '6px 12px' }}>Сразу</button>
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
                  🕓 Публикация запланирована на {new Date(result.publication.scheduledAt).toLocaleString('ru')}
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
                    Результат: {result.published || 0} опубликовано{result.failed ? `, ${result.failed} с ошибкой` : ''}
                  </div>
                  {(result.publication?.targets || []).map((t, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span>{platformMeta(t.platform).icon}</span>
                      <b>{t.title}</b>
                      {t.status === 'published' && <span style={{ color: '#1e7c3a' }}>✅ опубликовано</span>}
                      {t.status === 'pending'   && <span style={{ color: '#8a6d00' }}>🕓 по расписанию</span>}
                      {t.status === 'skipped'   && <span style={{ color: '#888' }}>пропущено — {t.error}</span>}
                      {t.status === 'failed'    && <span style={{ color: '#c0392b' }}>❌ {t.error}</span>}
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
