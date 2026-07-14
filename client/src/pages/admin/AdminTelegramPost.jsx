import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminGetProducts, adminGetProduct, adminUploadImage, adminPublishTelegram, adminGetTelegramChannel } from '../../api';
import { driveThumb, cloudinaryOpt } from '../../utils/drive';

// Все картинки-кандидаты товара (Cloudinary + Google Drive) для выбора обложки поста.
function imageCandidates(p) {
  if (!p) return [];
  const out = [];
  (p.images || []).forEach(u => { if (u && u.startsWith('http')) out.push(u); });
  (p.driveImages || []).forEach(id => { if (id) out.push(driveThumb(id, 1200)); });
  return out;
}

function preview(url) {
  return cloudinaryOpt(url, 300);
}

function fmtPrice(n) {
  return Number(n || 0).toLocaleString('ru-RU');
}

// Черновик текста поста из данных товара: название, характеристики, розничная цена.
// Остатки НЕ включаются — это витрина для клиентов.
function buildCaption(p) {
  if (!p) return '';
  const lines = [];
  lines.push(`🆕 <b>${p.fullName || p.name || ''}</b>`);

  const specs = (p.specs || []).filter(s => s && s.key && s.value);
  if (specs.length) {
    lines.push('');
    specs.forEach(s => lines.push(`• ${s.key}: ${s.value}`));
  }

  lines.push('');
  if (p.priceUndefined || !p.price) {
    lines.push('💰 Цена по запросу');
  } else {
    lines.push(`💰 Цена: <b>${fmtPrice(p.price)} сом</b>`);
  }

  return lines.join('\n');
}

// Грубое HTML→текст для предпросмотра (Telegram рендерит <b>, остальное убираем).
function stripHtml(s) {
  return String(s || '')
    .replace(/<b>|<\/b>/g, '')
    .replace(/<i>|<\/i>/g, '')
    .replace(/&amp;/g, '&');
}

export default function AdminTelegramPost() {
  const navigate = useNavigate();

  const [productQ,    setProductQ]    = useState('');
  const [products,    setProducts]    = useState([]);
  const [prodLoading, setProdLoading] = useState(false);
  const [product,     setProduct]     = useState(null);

  const [images,   setImages]   = useState([]);   // кандидаты обложки
  const [imgIdx,   setImgIdx]   = useState(0);     // выбранная обложка (индекс), -1 = без фото
  const [caption,  setCaption]  = useState('');
  const [uploading, setUploading] = useState(false);

  const [channelConfigured, setChannelConfigured] = useState(true);
  const [sending, setSending] = useState(false);
  const [error,   setError]   = useState('');
  const [done,    setDone]    = useState(false);

  const prodDebounce = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    adminGetTelegramChannel()
      .then(r => setChannelConfigured(!!r.data?.configured))
      .catch(() => {});
  }, []);

  useEffect(() => {
    clearTimeout(prodDebounce.current);
    if (!productQ.trim()) { setProducts([]); return; }
    prodDebounce.current = setTimeout(() => {
      setProdLoading(true);
      adminGetProducts({ search: productQ, limit: 10 })
        .then(r => setProducts(r.data.products || r.data || []))
        .catch(() => {})
        .finally(() => setProdLoading(false));
    }, 300);
  }, [productQ]);

  const selectProduct = async (p) => {
    setProductQ(''); setProducts([]); setError(''); setDone(false);
    // Догружаем полную карточку — в поиске может не быть specs.
    let full = p;
    try {
      const r = await adminGetProduct(p._id);
      full = r.data?.product || r.data || p;
    } catch { /* используем то, что есть */ }
    setProduct(full);
    const imgs = imageCandidates(full);
    setImages(imgs);
    setImgIdx(imgs.length ? 0 : -1);
    setCaption(buildCaption(full));
  };

  const reset = () => {
    setProduct(null); setImages([]); setImgIdx(0); setCaption(''); setError(''); setDone(false);
  };

  const uploadCustom = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append('image', file);
        const res = await adminUploadImage(fd);
        if (res.data?.url) {
          setImages(prev => { const next = [...prev, res.data.url]; setImgIdx(next.length - 1); return next; });
        }
      }
    } catch {
      setError('Ошибка загрузки фото');
    }
    setUploading(false);
    e.target.value = '';
  };

  const publish = async () => {
    if (!caption.trim()) { setError('Пустой текст поста'); return; }
    setSending(true); setError(''); setDone(false);
    try {
      await adminPublishTelegram({
        caption: caption.trim(),
        imageUrl: imgIdx >= 0 ? images[imgIdx] : null,
      });
      setDone(true);
    } catch (e) {
      setError(e.response?.data?.message || 'Ошибка публикации');
    }
    setSending(false);
  };

  const L = { fontSize: 12, fontWeight: 700, color: '#666', display: 'block', marginBottom: 8 };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 0 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <button onClick={() => navigate('/admin')} style={{
          background: 'none', border: '1.5px solid #e0e0e0', borderRadius: 8,
          padding: '6px 14px', fontSize: 13, cursor: 'pointer', color: '#555', fontWeight: 600,
        }}>← Назад</button>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>📣 Публикация в Telegram-канал</h1>
      </div>

      {!channelConfigured && (
        <div style={{ fontSize: 13, color: '#8a6d00', background: '#fff8e1', border: '1px solid #ffe08a', padding: '12px 16px', borderRadius: 10, marginBottom: 20 }}>
          ⚠️ Канал не настроен. Задайте переменную окружения <b>TELEGRAM_CHANNEL_ID</b> на сервере (Render)
          и добавьте бота в канал как администратора. Публикация не сработает, пока это не сделано.
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 14, padding: 28, boxShadow: '0 1px 6px rgba(0,0,0,.07)' }}>

        {/* Выбор товара */}
        <label style={L}>Товар *</label>
        {product ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#f7f8fa', border: '1.5px solid #e0e0e0', borderRadius: 10, padding: '10px 14px', marginBottom: 24 }}>
            {images[0] && <img src={preview(images[0])} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111' }}>{product.fullName || product.name}</div>
              <div style={{ fontSize: 12, color: '#7d96a0', marginTop: 2 }}>
                {product.priceUndefined || !product.price ? 'Цена по запросу' : `${fmtPrice(product.price)} сом`}
              </div>
            </div>
            <button onClick={reset} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 20 }}>×</button>
          </div>
        ) : (
          <div style={{ position: 'relative', marginBottom: 24 }}>
            <input
              value={productQ}
              onChange={e => setProductQ(e.target.value)}
              placeholder="Поиск по названию..."
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e0e0e0', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            />
            {(products.length > 0 || prodLoading) && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1.5px solid #e0e0e0', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,.1)', zIndex: 10, maxHeight: 260, overflowY: 'auto', marginTop: 4 }}>
                {prodLoading && <div style={{ padding: '12px 16px', fontSize: 13, color: '#aaa' }}>Поиск...</div>}
                {products.map(p => {
                  const img = imageCandidates(p)[0];
                  return (
                    <button key={p._id} onClick={() => selectProduct(p)}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid #f4f4f4' }}>
                      {img && <img src={preview(img)} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />}
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{p.fullName || p.name}</div>
                        <div style={{ fontSize: 11, color: '#aaa' }}>{p.priceUndefined || !p.price ? 'Цена по запросу' : `${fmtPrice(p.price)} сом`}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {product && (
          <>
            {/* Выбор фото */}
            <label style={L}>Фото поста</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
              {images.map((url, i) => (
                <button key={i} onClick={() => setImgIdx(i)} style={{
                  width: 84, height: 84, borderRadius: 10, padding: 0, cursor: 'pointer', overflow: 'hidden',
                  border: imgIdx === i ? '3px solid #3463A3' : '2px solid #e0e0e0', background: '#fafafa',
                }}>
                  <img src={preview(url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </button>
              ))}
              <button onClick={() => setImgIdx(-1)} style={{
                width: 84, height: 84, borderRadius: 10, cursor: 'pointer', fontSize: 11, fontWeight: 600,
                border: imgIdx === -1 ? '3px solid #3463A3' : '2px dashed #ddd',
                background: imgIdx === -1 ? '#eef4fc' : '#fafafa', color: '#888',
              }}>Без фото</button>
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading} style={{
                width: 84, height: 84, borderRadius: 10, border: '2px dashed #ddd', background: '#fafafa',
                cursor: uploading ? 'wait' : 'pointer', color: '#999', fontSize: 11, fontWeight: 600,
              }}>{uploading ? '...' : '+ Своё'}</button>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={uploadCustom} />
            </div>

            {/* Текст поста */}
            <label style={L}>Текст поста <span style={{ color: '#bbb', fontWeight: 400 }}>(можно редактировать, поддерживает &lt;b&gt;)</span></label>
            <textarea
              value={caption}
              onChange={e => setCaption(e.target.value)}
              rows={8}
              style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1.5px solid #e0e0e0', fontSize: 14, outline: 'none', marginBottom: 24, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
            />

            {/* Предпросмотр */}
            <label style={L}>Предпросмотр</label>
            <div style={{ background: '#e7ebf0', borderRadius: 14, padding: 14, marginBottom: 24 }}>
              <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', maxWidth: 340, boxShadow: '0 1px 3px rgba(0,0,0,.12)' }}>
                {imgIdx >= 0 && images[imgIdx] && (
                  <img src={preview(images[imgIdx])} alt="" style={{ width: '100%', display: 'block', maxHeight: 300, objectFit: 'cover' }} />
                )}
                <div style={{ padding: '10px 14px', fontSize: 14, whiteSpace: 'pre-wrap', lineHeight: 1.5, color: '#111' }}>
                  {stripHtml(caption)}
                </div>
              </div>
            </div>

            {error && (
              <div style={{ fontSize: 13, color: '#c0392b', marginBottom: 18, background: '#fdf0ef', padding: '10px 14px', borderRadius: 8 }}>{error}</div>
            )}
            {done && (
              <div style={{ fontSize: 13, color: '#1e7c3a', marginBottom: 18, background: '#eafaf1', padding: '10px 14px', borderRadius: 8 }}>✅ Опубликовано в канал!</div>
            )}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button onClick={reset} style={{
                padding: '11px 22px', borderRadius: 10, border: '1.5px solid #e0e0e0',
                background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#555',
              }}>Сбросить</button>
              <button onClick={publish} disabled={sending || done} style={{
                padding: '11px 28px', borderRadius: 10, border: 'none',
                background: sending || done ? '#aaa' : '#229ED9', color: '#fff', fontSize: 14, fontWeight: 700,
                cursor: sending || done ? 'default' : 'pointer',
              }}>{sending ? 'Публикация...' : done ? 'Отправлено' : '📤 Опубликовать в канал'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
