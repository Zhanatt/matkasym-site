import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminCreateTechRequest } from '../../api';
import { LEGAL_STATUSES, SYMBOL_TYPES, PRIORITIES, needsCompany } from '../../config/techRequest';

const inputStyle = {
  width: '100%', padding: '11px 12px', borderRadius: 8, border: '1.5px solid #e0e0e0',
  fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit',
};

function Field({ label, required, hint, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 6 }}>
        {label} {required && <span style={{ color: '#d32f2f' }}>*</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: 11, color: '#999', marginTop: 5 }}>{hint}</div>}
    </div>
  );
}

function Section({ title, icon, children }) {
  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: 20, marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
      <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>{icon}</span> {title}
      </h2>
      {children}
    </div>
  );
}

export default function AdminTechRequestForm() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const [clientName, setClientName] = useState('');
  const [status, setStatus] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');

  const [itemName, setItemName] = useState('');
  const [dimensions, setDimensions] = useState('');
  const [color, setColor] = useState('');
  const [quantity, setQuantity] = useState(1);

  const [hasSymbols, setHasSymbols] = useState(false);
  const [symbolTypes, setSymbolTypes] = useState([]);
  const [symbolDesc, setSymbolDesc] = useState('');

  const [specDesc, setSpecDesc] = useState('');
  const [specMedia, setSpecMedia] = useState([]);
  const [priority, setPriority] = useState('medium');
  const [deadline, setDeadline] = useState('');

  const companyRequired = needsCompany(status);

  const valid =
    clientName.trim() &&
    status &&
    (!companyRequired || companyName.trim()) &&
    dimensions.trim() &&
    color.trim() &&
    specDesc.trim();

  const toggleSymbol = (key) => {
    setSymbolTypes(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    const urls = [];
    for (const file of files) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('upload_preset', 'matkasym_unsigned');
      try {
        const res = await fetch('https://api.cloudinary.com/v1_1/dnbg21ef8/auto/upload', { method: 'POST', body: fd });
        const data = await res.json();
        if (data.secure_url) urls.push(data.secure_url);
      } catch (err) {
        console.error('Upload error:', err);
      }
    }
    setSpecMedia(prev => [...prev, ...urls]);
    setUploading(false);
  };

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    setError('');
    try {
      await adminCreateTechRequest({
        client: { name: clientName, legalStatus: status, companyName, phone },
        item:   { name: itemName, dimensions, color, quantity: Number(quantity) || 1 },
        symbols: {
          has: hasSymbols,
          types: hasSymbols ? symbolTypes : [],
          description: hasSymbols ? symbolDesc : '',
        },
        spec: { description: specDesc, media: specMedia },
        priority,
        deadline: deadline || null,
      });
      navigate('/admin/tech-requests');
    } catch (e) {
      setError(e.response?.data?.error || 'Не удалось создать заявку');
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: '20px 0', maxWidth: 720 }}>
      <button onClick={() => navigate('/admin/tech-requests')} style={{ background: 'none', border: 'none', color: '#888', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 12 }}>
        ← К доске
      </button>

      <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 4px' }}>Новая заявка на техлист</h1>
      <p style={{ color: '#888', margin: '0 0 24px', fontSize: 13 }}>
        Чем подробнее ТЗ, тем меньше вопросов от конструктора.
      </p>

      <Section title="Клиент" icon="👤">
        <Field label="Имя клиента" required>
          <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Например: Айбек Осмонов" style={inputStyle} />
        </Field>

        <Field label="Юридический статус" required>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {LEGAL_STATUSES.map(s => (
              <button
                key={s.key}
                onClick={() => setStatus(s.key)}
                style={{
                  padding: '9px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  border: status === s.key ? '1.5px solid #1976d2' : '1.5px solid #e0e0e0',
                  background: status === s.key ? '#e3f2fd' : '#fff',
                  color: status === s.key ? '#1976d2' : '#555',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </Field>

        {status && (
          <Field
            label="Название компании"
            required={companyRequired}
            hint={companyRequired ? 'Для юридического лица название обязательно' : 'Необязательно'}
          >
            <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder='ОсОО «Пример»' style={inputStyle} />
          </Field>
        )}

        <Field label="Телефон">
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+996 700 000 000" style={inputStyle} />
        </Field>
      </Section>

      <Section title="Изделие" icon="📦">
        <Field label="Наименование изделия">
          <input value={itemName} onChange={e => setItemName(e.target.value)} placeholder="Стеллаж, щит, шкаф..." style={inputStyle} />
        </Field>

        <Field
          label="Размеры"
          required
          hint="Пока свободное поле — у каждого вида продукции свои размеры. Пишите как удобно: 120×40×180 см, Ø300 мм, высота 2 м."
        >
          <input value={dimensions} onChange={e => setDimensions(e.target.value)} placeholder="120×40×180 см" style={inputStyle} />
        </Field>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 2 }}>
            <Field label="Цвет изделия" required>
              <input value={color} onChange={e => setColor(e.target.value)} placeholder="RAL 9003, белый матовый" style={inputStyle} />
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Количество">
              <input type="number" min={1} value={quantity} onChange={e => setQuantity(e.target.value)} style={inputStyle} />
            </Field>
          </div>
        </div>
      </Section>

      <Section title="Символика на изделии" icon="🏷">
        <div style={{ display: 'flex', gap: 8, marginBottom: hasSymbols ? 18 : 0 }}>
          <button
            onClick={() => setHasSymbols(false)}
            style={{
              flex: 1, padding: '11px 0', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
              border: !hasSymbols ? '1.5px solid #1976d2' : '1.5px solid #e0e0e0',
              background: !hasSymbols ? '#e3f2fd' : '#fff',
              color: !hasSymbols ? '#1976d2' : '#555',
            }}
          >
            Нет символики
          </button>
          <button
            onClick={() => setHasSymbols(true)}
            style={{
              flex: 1, padding: '11px 0', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
              border: hasSymbols ? '1.5px solid #5e35b1' : '1.5px solid #e0e0e0',
              background: hasSymbols ? '#ede7f6' : '#fff',
              color: hasSymbols ? '#5e35b1' : '#555',
            }}
          >
            Есть символика
          </button>
        </div>

        {hasSymbols && (
          <>
            <Field label="Что именно" hint="Можно выбрать несколько">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {SYMBOL_TYPES.map(s => {
                  const on = symbolTypes.includes(s.key);
                  return (
                    <button
                      key={s.key}
                      onClick={() => toggleSymbol(s.key)}
                      style={{
                        padding: '9px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                        border: on ? '1.5px solid #5e35b1' : '1.5px solid #e0e0e0',
                        background: on ? '#ede7f6' : '#fff',
                        color: on ? '#5e35b1' : '#555',
                      }}
                    >
                      {s.icon} {s.label}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="Описание символики" hint="Где расположена, размер, цвет, что на ней">
              <textarea
                value={symbolDesc}
                onChange={e => setSymbolDesc(e.target.value)}
                rows={3}
                placeholder="Логотип клиента на передней панели, 100×40 мм, лазерный вырез по центру"
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </Field>
          </>
        )}
      </Section>

      <Section title="Техническое задание" icon="📝">
        <Field label="Подробное ТЗ" required hint="Материал, толщина металла, покрытие, крепления, нагрузка, сроки, особые требования">
          <textarea
            value={specDesc}
            onChange={e => setSpecDesc(e.target.value)}
            rows={8}
            placeholder="Опишите изделие детально: назначение, материал, толщина, покрытие, крепёж, нагрузка, упаковка..."
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </Field>

        <Field label="Фото и файлы" hint="Референсы, эскизы, замеры">
          <input type="file" multiple accept="image/*,application/pdf" onChange={handleUpload} style={{ fontSize: 13 }} />
          {uploading && <div style={{ fontSize: 12, color: '#1976d2', marginTop: 8 }}>Загрузка...</div>}
          {specMedia.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {specMedia.map(url => (
                <div key={url} style={{ position: 'relative' }}>
                  <img src={url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid #eee' }} />
                  <button
                    onClick={() => setSpecMedia(prev => prev.filter(u => u !== url))}
                    style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: '#d32f2f', color: '#fff', fontSize: 11, cursor: 'pointer', lineHeight: 1 }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </Field>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <Field label="Приоритет">
              <div style={{ display: 'flex', gap: 6 }}>
                {Object.entries(PRIORITIES).map(([key, p]) => (
                  <button
                    key={key}
                    onClick={() => setPriority(key)}
                    style={{
                      flex: 1, padding: '10px 0', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                      border: priority === key ? `1.5px solid ${p.color}` : '1.5px solid #e0e0e0',
                      background: priority === key ? p.bg : '#fff',
                      color: priority === key ? p.color : '#555',
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Срок">
              <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} style={inputStyle} />
            </Field>
          </div>
        </div>
      </Section>

      {error && (
        <div style={{ background: '#ffebee', color: '#c62828', padding: 12, borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, paddingBottom: 40 }}>
        <button onClick={() => navigate('/admin/tech-requests')} style={{ flex: 1, padding: '14px 0', borderRadius: 8, border: '1.5px solid #e0e0e0', background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          Отмена
        </button>
        <button
          onClick={submit}
          disabled={!valid || saving}
          style={{
            flex: 2, padding: '14px 0', borderRadius: 8, border: 'none',
            background: valid ? '#1976d2' : '#e0e0e0',
            color: valid ? '#fff' : '#999',
            fontSize: 14, fontWeight: 700, cursor: valid ? 'pointer' : 'not-allowed',
          }}
        >
          {saving ? 'Создание...' : 'Создать заявку'}
        </button>
      </div>
    </div>
  );
}
