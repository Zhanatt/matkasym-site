import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminGetProducts, adminGetFrontmen, adminCreateFeedback } from '../../api';
import { cloudinaryOpt } from '../../utils/drive';

const TYPES = [
  { key: 'complaint',  label: 'Жалоба клиента', icon: '😠', desc: 'Клиент недоволен товаром' },
  { key: 'defect',     label: 'Дефект товара',  icon: '🔧', desc: 'Брак, поломка, несоответствие' },
  { key: 'suggestion', label: 'Предложение',    icon: '💡', desc: 'Идея по улучшению товара' },
  { key: 'question',   label: 'Вопрос',         icon: '❓', desc: 'Нужна консультация' },
];

const PRIORITIES = [
  { key: 'low',    label: 'Низкий',  color: '#666' },
  { key: 'medium', label: 'Средний', color: '#f57c00' },
  { key: 'high',   label: 'Высокий', color: '#d32f2f' },
];

export default function AdminFeedbackForm() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Form state
  const [frontmanId, setFrontmanId] = useState('');
  const [productId, setProductId] = useState('');
  const [type, setType] = useState('');
  const [priority, setPriority] = useState('medium');
  const [problemDesc, setProblemDesc] = useState('');
  const [problemMedia, setProblemMedia] = useState([]);
  const [altDesc, setAltDesc] = useState('');
  const [altMedia, setAltMedia] = useState([]);

  // Data
  const [frontmen, setFrontmen] = useState([]);
  const [products, setProducts] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);

  useEffect(() => {
    adminGetFrontmen().then(r => setFrontmen(r.data || []));
  }, []);

  useEffect(() => {
    if (productSearch.length >= 2) {
      adminGetProducts({ search: productSearch, limit: 20 }).then(r => {
        setProducts(r.data.products || []);
      });
    } else {
      setProducts([]);
    }
  }, [productSearch]);

  const handleSelectProduct = (p) => {
    setProductId(p._id);
    setSelectedProduct(p);
    setProductSearch('');
    setProducts([]);
  };

  const handleMediaUpload = async (e, setter) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    setLoading(true);
    const urls = [];

    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', 'matkasym_unsigned');

      try {
        const res = await fetch('https://api.cloudinary.com/v1_1/dnbg21ef8/auto/upload', {
          method: 'POST', body: formData
        });
        const data = await res.json();
        if (data.secure_url) urls.push(data.secure_url);
      } catch (e) {
        console.error('Upload error:', e);
      }
    }

    setter(prev => [...prev, ...urls]);
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!frontmanId || !productId || !type || !problemDesc) {
      alert('Заполните все обязательные поля');
      return;
    }

    setLoading(true);
    try {
      await adminCreateFeedback({
        productId,
        frontmanId,
        type,
        priority,
        problem: { description: problemDesc, media: problemMedia },
        alternatives: { description: altDesc, media: altMedia }
      });
      navigate('/admin/feedback');
    } catch (e) {
      alert('Ошибка: ' + (e.response?.data?.error || e.message));
    }
    setLoading(false);
  };

  const canProceed = () => {
    if (step === 1) return frontmanId && productId;
    if (step === 2) return type;
    if (step === 3) return problemDesc.length >= 10;
    return true;
  };

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Новая заявка</h1>
        <p style={{ color: '#666', margin: '4px 0 0' }}>Обратная связь от фронтмена</p>
      </div>

      {/* Progress */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 32 }}>
        {[1, 2, 3, 4].map(s => (
          <div key={s} style={{
            flex: 1, height: 4, borderRadius: 2,
            background: s <= step ? '#1976d2' : '#e0e0e0',
            transition: 'background 0.3s'
          }} />
        ))}
      </div>

      {/* Step 1: Select frontman & product */}
      {step === 1 && (
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Шаг 1: Выберите фронтмена и товар</h2>

          {/* Frontman */}
          <label style={{ display: 'block', marginBottom: 16 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#333', display: 'block', marginBottom: 6 }}>
              Фронтмен *
            </span>
            <select
              value={frontmanId}
              onChange={e => setFrontmanId(e.target.value)}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 8, border: '1.5px solid #e0e0e0',
                fontSize: 15, background: '#fff', cursor: 'pointer'
              }}
            >
              <option value="">Выберите фронтмена</option>
              {frontmen.map(f => (
                <option key={f._id} value={f._id}>{f.name} ({f.channel})</option>
              ))}
            </select>
          </label>

          {/* Product search */}
          <label style={{ display: 'block', marginBottom: 16 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#333', display: 'block', marginBottom: 6 }}>
              Товар *
            </span>
            {selectedProduct ? (
              <div style={{
                display: 'flex', gap: 12, alignItems: 'center', padding: 12, background: '#f5f5f5',
                borderRadius: 8, border: '1.5px solid #e0e0e0'
              }}>
                {selectedProduct.images?.[0] && (
                  <img src={cloudinaryOpt(selectedProduct.images[0], 80)} alt=""
                    style={{ width: 50, height: 50, borderRadius: 6, objectFit: 'cover' }} />
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{selectedProduct.name}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>{selectedProduct.sku}</div>
                </div>
                <button onClick={() => { setSelectedProduct(null); setProductId(''); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#999' }}>
                  ✕
                </button>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                  placeholder="Начните вводить название или SKU..."
                  style={{
                    width: '100%', padding: '12px 14px', borderRadius: 8, border: '1.5px solid #e0e0e0',
                    fontSize: 15, boxSizing: 'border-box'
                  }}
                />
                {products.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff',
                    border: '1px solid #e0e0e0', borderRadius: 8, marginTop: 4, maxHeight: 300,
                    overflowY: 'auto', zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                  }}>
                    {products.map(p => (
                      <div key={p._id} onClick={() => handleSelectProduct(p)}
                        style={{
                          display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px',
                          cursor: 'pointer', borderBottom: '1px solid #f0f0f0'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f5f5f5'}
                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                      >
                        {p.images?.[0] && (
                          <img src={cloudinaryOpt(p.images[0], 60)} alt=""
                            style={{ width: 36, height: 36, borderRadius: 4, objectFit: 'cover' }} />
                        )}
                        <div>
                          <div style={{ fontWeight: 500, fontSize: 14 }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: '#888' }}>{p.sku}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </label>
        </div>
      )}

      {/* Step 2: Type & Priority */}
      {step === 2 && (
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Шаг 2: Тип обращения</h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 24 }}>
            {TYPES.map(t => (
              <div key={t.key} onClick={() => setType(t.key)}
                style={{
                  padding: 16, borderRadius: 12, cursor: 'pointer', textAlign: 'center',
                  border: type === t.key ? '2px solid #1976d2' : '2px solid #e0e0e0',
                  background: type === t.key ? '#e3f2fd' : '#fff',
                  transition: 'all 0.2s'
                }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>{t.icon}</div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{t.label}</div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{t.desc}</div>
              </div>
            ))}
          </div>

          <label style={{ display: 'block' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#333', display: 'block', marginBottom: 8 }}>
              Приоритет
            </span>
            <div style={{ display: 'flex', gap: 10 }}>
              {PRIORITIES.map(p => (
                <button key={p.key} onClick={() => setPriority(p.key)}
                  style={{
                    flex: 1, padding: '10px 16px', borderRadius: 8, cursor: 'pointer',
                    border: priority === p.key ? `2px solid ${p.color}` : '2px solid #e0e0e0',
                    background: priority === p.key ? '#fff' : '#f5f5f5',
                    color: priority === p.key ? p.color : '#666',
                    fontWeight: 600, fontSize: 14
                  }}>
                  {p.label}
                </button>
              ))}
            </div>
          </label>
        </div>
      )}

      {/* Step 3: Problem description */}
      {step === 3 && (
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Шаг 3: Опишите проблему</h2>

          <label style={{ display: 'block', marginBottom: 20 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#333', display: 'block', marginBottom: 6 }}>
              Описание проблемы *
            </span>
            <textarea
              value={problemDesc}
              onChange={e => setProblemDesc(e.target.value)}
              placeholder="Опишите подробно, что случилось..."
              rows={5}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 8, border: '1.5px solid #e0e0e0',
                fontSize: 15, resize: 'vertical', boxSizing: 'border-box'
              }}
            />
          </label>

          <label style={{ display: 'block' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#333', display: 'block', marginBottom: 6 }}>
              Фото/видео проблемы
            </span>
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={e => handleMediaUpload(e, setProblemMedia)}
              style={{ display: 'none' }}
              id="problem-media"
            />
            <label htmlFor="problem-media" style={{
              display: 'inline-block', padding: '10px 20px', background: '#f5f5f5',
              borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500
            }}>
              📎 Прикрепить файлы
            </label>
            {problemMedia.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                {problemMedia.map((url, i) => (
                  <div key={i} style={{ position: 'relative' }}>
                    <img src={cloudinaryOpt(url, 120)} alt="" style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'cover' }} />
                    <button onClick={() => setProblemMedia(prev => prev.filter((_, j) => j !== i))}
                      style={{
                        position: 'absolute', top: -6, right: -6, width: 20, height: 20,
                        borderRadius: '50%', background: '#d32f2f', color: '#fff', border: 'none',
                        cursor: 'pointer', fontSize: 12, lineHeight: 1
                      }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </label>
        </div>
      )}

      {/* Step 4: Alternatives */}
      {step === 4 && (
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Шаг 4: Альтернативы решения</h2>
          <p style={{ color: '#666', marginBottom: 20, fontSize: 14 }}>
            Если у вас есть идеи как решить проблему — опишите их здесь. Это необязательно.
          </p>

          <label style={{ display: 'block', marginBottom: 20 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#333', display: 'block', marginBottom: 6 }}>
              Ваше предложение
            </span>
            <textarea
              value={altDesc}
              onChange={e => setAltDesc(e.target.value)}
              placeholder="Как можно улучшить товар или решить проблему..."
              rows={4}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 8, border: '1.5px solid #e0e0e0',
                fontSize: 15, resize: 'vertical', boxSizing: 'border-box'
              }}
            />
          </label>

          <label style={{ display: 'block' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#333', display: 'block', marginBottom: 6 }}>
              Примеры/референсы
            </span>
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={e => handleMediaUpload(e, setAltMedia)}
              style={{ display: 'none' }}
              id="alt-media"
            />
            <label htmlFor="alt-media" style={{
              display: 'inline-block', padding: '10px 20px', background: '#f5f5f5',
              borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500
            }}>
              📎 Прикрепить примеры
            </label>
            {altMedia.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                {altMedia.map((url, i) => (
                  <div key={i} style={{ position: 'relative' }}>
                    <img src={cloudinaryOpt(url, 120)} alt="" style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'cover' }} />
                    <button onClick={() => setAltMedia(prev => prev.filter((_, j) => j !== i))}
                      style={{
                        position: 'absolute', top: -6, right: -6, width: 20, height: 20,
                        borderRadius: '50%', background: '#d32f2f', color: '#fff', border: 'none',
                        cursor: 'pointer', fontSize: 12, lineHeight: 1
                      }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </label>
        </div>
      )}

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 32 }}>
        <button
          onClick={() => step > 1 ? setStep(step - 1) : navigate('/admin/feedback')}
          style={{
            padding: '12px 24px', borderRadius: 8, border: '1.5px solid #e0e0e0',
            background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14
          }}
        >
          {step > 1 ? '← Назад' : 'Отмена'}
        </button>

        {step < 4 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canProceed()}
            style={{
              padding: '12px 24px', borderRadius: 8, border: 'none',
              background: canProceed() ? '#1976d2' : '#e0e0e0',
              color: canProceed() ? '#fff' : '#999',
              cursor: canProceed() ? 'pointer' : 'not-allowed',
              fontWeight: 600, fontSize: 14
            }}
          >
            Далее →
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              padding: '12px 24px', borderRadius: 8, border: 'none',
              background: '#388e3c', color: '#fff',
              cursor: loading ? 'wait' : 'pointer',
              fontWeight: 600, fontSize: 14
            }}
          >
            {loading ? 'Отправка...' : '✓ Отправить заявку'}
          </button>
        )}
      </div>
    </div>
  );
}
