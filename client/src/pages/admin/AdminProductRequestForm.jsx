import { useState, useEffect, useRef } from 'react';
import { adminCreateProductRequest, adminGetMyProductRequests } from '../../api';

const CLOUD = 'dnbg21ef8';
const PRESET = 'Matkasym';

const TYPES = [
  { key: 'test', icon: '🧪', title: 'Тестовый продукт', desc: 'Пробная закупка на тест', accent: '#00838f', bg: '#e0f7fa' },
  { key: 'real', icon: '🛒', title: 'Заказать настоящий', desc: 'Обычный заказ товара',   accent: '#b45309', bg: '#fef3c7' },
];

const label = { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 };
const input = {
  width: '100%', fontSize: 16, padding: '12px 14px', border: '1.5px solid #e2e8f0',
  borderRadius: 12, outline: 'none', boxSizing: 'border-box', background: '#fff',
};

function StatusChip({ status }) {
  const done = status === 'done';
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
      background: done ? '#e8f5e9' : '#fff3e0', color: done ? '#2d7a3a' : '#b45309',
    }}>
      {done ? '✓ Выполнена' : '⏳ В работе'}
    </span>
  );
}

export default function AdminProductRequestForm() {
  const [open, setOpen]         = useState(false);
  const [type, setType]         = useState('');
  const [photo, setPhoto]       = useState('');
  const [uploading, setUpload]  = useState(false);
  const [name, setName]         = useState('');
  const [dimensions, setDim]    = useState('');
  const [color, setColor]       = useState('');
  const [note, setNote]         = useState('');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [toast, setToast]       = useState('');
  const [mine, setMine]         = useState([]);
  const fileRef = useRef(null);

  const loadMine = () => adminGetMyProductRequests().then(r => setMine(r.data.requests || [])).catch(() => {});
  useEffect(() => { loadMine(); }, []);

  const reset = () => {
    setType(''); setPhoto(''); setName(''); setDim(''); setColor(''); setNote(''); setError('');
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUpload(true); setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('upload_preset', PRESET);
      fd.append('folder', 'matkasym/product-requests');
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, { method: 'POST', body: fd });
      const data = await res.json();
      if (data.secure_url) setPhoto(data.secure_url);
      else setError(data.error?.message || 'Не удалось загрузить фото');
    } catch { setError('Ошибка загрузки фото'); }
    setUpload(false);
  };

  const submit = async () => {
    if (!type)         return setError('Выберите тип заявки');
    if (!name.trim())  return setError('Укажите название товара');
    setSaving(true); setError('');
    try {
      await adminCreateProductRequest({ type, photo, name, dimensions, color, note });
      setToast('Заявка отправлена ✓');
      setTimeout(() => setToast(''), 3000);
      reset(); setOpen(false);
      loadMine();
    } catch (e) {
      setError(e?.response?.data?.error || 'Ошибка при отправке');
    }
    setSaving(false);
  };

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', paddingBottom: 40 }}>
      <style>{`
        .pr-type-card { transition: transform .1s, box-shadow .15s; }
        .pr-type-card:active { transform: scale(.98); }
        @media (max-width: 640px) { .pr-types { grid-template-columns: 1fr !important; } }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#111' }}>🛒 Заявка на товар</div>
        <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 3 }}>
          Подайте заявку — тестовый или настоящий товар. Заявка уйдёт на закуп.
        </div>
      </div>

      {toast && (
        <div style={{ background: '#e8f5e9', color: '#2d7a3a', border: '1px solid #a5d6a7',
          borderRadius: 12, padding: '12px 16px', marginBottom: 16, fontWeight: 600, fontSize: 14 }}>
          {toast}
        </div>
      )}

      {/* Big submit button */}
      {!open && (
        <button onClick={() => { reset(); setOpen(true); }}
          style={{ width: '100%', padding: '18px', fontSize: 17, fontWeight: 700, color: '#fff',
            background: 'linear-gradient(135deg, #DC1E24 0%, #b3161b 100%)', border: 'none',
            borderRadius: 16, cursor: 'pointer', boxShadow: '0 6px 18px rgba(220,30,36,.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <span style={{ fontSize: 22, lineHeight: 1 }}>＋</span> Подать заявку на товар
        </button>
      )}

      {/* Form */}
      {open && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 12px rgba(0,0,0,.06)' }}>
          {/* Type choice */}
          <div style={label}>Тип заявки</div>
          <div className="pr-types" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
            {TYPES.map(t => {
              const sel = type === t.key;
              return (
                <div key={t.key} className="pr-type-card" onClick={() => setType(t.key)}
                  style={{ cursor: 'pointer', borderRadius: 14, padding: '14px 12px', textAlign: 'center',
                    border: `2px solid ${sel ? t.accent : '#eceff3'}`, background: sel ? t.bg : '#fafbfc',
                    boxShadow: sel ? `0 4px 12px ${t.accent}22` : 'none' }}>
                  <div style={{ fontSize: 28, lineHeight: 1 }}>{t.icon}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1c1c1c', marginTop: 6 }}>{t.title}</div>
                  <div style={{ fontSize: 11, color: '#8a97a5', marginTop: 2 }}>{t.desc}</div>
                </div>
              );
            })}
          </div>

          {/* Photo */}
          <div style={label}>Фото товара</div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} style={{ display: 'none' }} />
          {photo ? (
            <div style={{ position: 'relative', marginBottom: 18, borderRadius: 12, overflow: 'hidden', border: '1px solid #eceff3' }}>
              <img src={photo} alt="" style={{ width: '100%', maxHeight: 260, objectFit: 'contain', background: '#f8f9fb', display: 'block' }} />
              <button onClick={() => setPhoto('')}
                style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,.6)', color: '#fff',
                  border: 'none', borderRadius: 20, width: 32, height: 32, cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>
          ) : (
            <div onClick={() => fileRef.current?.click()}
              style={{ marginBottom: 18, border: '2px dashed #d3dae3', borderRadius: 12, padding: '26px 12px',
                textAlign: 'center', cursor: 'pointer', background: '#fafbfc', color: '#7b8794' }}>
              {uploading ? (
                <span style={{ color: '#1976d2', fontWeight: 600 }}>Загрузка…</span>
              ) : (
                <><div style={{ fontSize: 30 }}>📷</div>
                  <div style={{ fontSize: 14, marginTop: 6, fontWeight: 600 }}>Добавить фото</div>
                  <div style={{ fontSize: 11, marginTop: 2 }}>Снять камерой или выбрать из галереи</div></>
              )}
            </div>
          )}

          {/* Name */}
          <div style={{ marginBottom: 14 }}>
            <div style={label}>Название товара <span style={{ color: '#DC1E24' }}>*</span></div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Например: Складной табурет" style={input} />
          </div>

          {/* Dimensions + Color */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={label}>Размеры</div>
              <input value={dimensions} onChange={e => setDim(e.target.value)} placeholder="30×30×40 см" style={input} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={label}>Цвет</div>
              <input value={color} onChange={e => setColor(e.target.value)} placeholder="Синий" style={input} />
            </div>
          </div>

          {/* Note */}
          <div style={{ marginBottom: 18 }}>
            <div style={label}>Дополнительно</div>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
              placeholder="Комментарий, ссылка, количество и т.п. (необязательно)"
              style={{ ...input, resize: 'vertical' }} />
          </div>

          {error && <div style={{ color: '#c00', fontSize: 13, marginBottom: 12 }}>{error}</div>}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => { setOpen(false); reset(); }}
              style={{ flex: '0 0 auto', padding: '14px 18px', fontSize: 15, fontWeight: 600, color: '#555',
                background: '#f1f5f9', border: 'none', borderRadius: 12, cursor: 'pointer' }}>
              Отмена
            </button>
            <button onClick={submit} disabled={saving || uploading}
              style={{ flex: 1, padding: '14px', fontSize: 16, fontWeight: 700, color: '#fff',
                background: saving ? '#9aa5b1' : '#DC1E24', border: 'none', borderRadius: 12,
                cursor: saving ? 'default' : 'pointer' }}>
              {saving ? 'Отправка…' : 'Отправить заявку'}
            </button>
          </div>
        </div>
      )}

      {/* My requests */}
      {mine.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#111', marginBottom: 12 }}>Мои заявки</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {mine.map(r => (
              <div key={r._id} style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#fff',
                borderRadius: 12, padding: 10, boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
                <div style={{ width: 52, height: 52, borderRadius: 10, background: '#f1f5f9', flexShrink: 0,
                  overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {r.photo ? <img src={r.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                           : <span style={{ fontSize: 22 }}>{r.type === 'test' ? '🧪' : '🛒'}</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#111', overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                    №{r.number} · {r.type === 'test' ? 'Тест' : 'Заказ'}
                    {r.dimensions ? ` · ${r.dimensions}` : ''}{r.color ? ` · ${r.color}` : ''}
                  </div>
                </div>
                <StatusChip status={r.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
