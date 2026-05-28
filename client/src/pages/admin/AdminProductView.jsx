import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { adminGetProduct, adminTZPdf } from '../../api/index';
import { useAuth } from '../../context/AuthContext';
import { CATEGORIES } from '../../config/categorySpecs';
import { cloudinaryOpt } from '../../utils/drive';
import { CRM_STAGES } from './AdminProductForm';

const PRODUCT_STATUS_META = {
  for_sale:       { label: 'В продаже',           color: '#2d7a3a' },
  planned:        { label: 'В плане',             color: '#3b5bdb' },
  in_development: { label: 'В разработке',        color: '#7c3aed' },
  improvement:    { label: 'На улучшении',        color: '#c47a00' },
  on_pause:       { label: '⏸ НА ПАУЗЕ',          color: '#475569' },
  discontinued:   { label: '🚫 СНЯТ',             color: '#c0392b' },
  nelikvid:       { label: '🗑️ НЕЛИКВИД',         color: '#92400e' },
};
const STOCK_STATUS_META = {
  in_stock:     { label: 'В наличии',     color: '#2d7a3a' },
  out_of_stock: { label: 'Нет в наличии', color: '#c0392b' },
  expected:     { label: 'Ожидается',     color: '#c47a00' },
};

function categoryLabel(value) {
  return CATEGORIES.find(c => c.value === value)?.label || value || '—';
}

export default function AdminProductView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = user?.role === 'owner' || user?.role === 'editor';

  const [product,    setProduct]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [imgIdx,     setImgIdx]     = useState(0);
  const [pdfLoading, setPdfLoading] = useState(null);

  useEffect(() => {
    adminGetProduct(id)
      .then(r => setProduct(r.data))
      .catch(() => navigate(-1))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="admin-empty">Загрузка...</div>;
  if (!product) return null;

  const images = product.images || [];
  const ps = PRODUCT_STATUS_META[product.productStatus] || { label: product.productStatus, color: '#888' };
  const ss = STOCK_STATUS_META[product.stockStatus]     || { label: product.stockStatus,   color: '#888' };

  const imgSrc = (url) => url?.includes('cloudinary.com') ? cloudinaryOpt(url, 600) : url;

  // Strip Cloudinary transforms to get original full-resolution URL
  const imgOriginal = (url) => {
    if (!url) return url;
    if (url.includes('cloudinary.com')) return url.replace(/\/upload\/[^/]+\//, '/upload/');
    return url;
  };

  const downloadImage = async (url, index) => {
    const orig = imgOriginal(url);
    const name = `${product.name || 'photo'}_${index + 1}.jpg`.replace(/[\\/:*?"<>|]/g, '_');
    try {
      const resp = await fetch(orig);
      const blob = await resp.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(orig, '_blank');
    }
  };

  const downloadAll = () => images.forEach((url, i) => downloadImage(url, i));

  const prevImg = () => setImgIdx(i => (i - 1 + images.length) % images.length);
  const nextImg = () => setImgIdx(i => (i + 1) % images.length);

  const downloadTZ = async (type) => {
    setPdfLoading(type);
    try {
      const r = await adminTZPdf(id, type);
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ТЗ_${product.name}_${type === 'development' ? 'разработка' : 'улучшение'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Ошибка генерации PDF');
    } finally {
      setPdfLoading(null);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="admin-page-header" style={{ marginBottom: 24 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
          ← Назад
        </button>
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={() => navigate(`/admin/products/${id}/edit`, { replace: true })}>
            Редактировать
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, alignItems: 'start' }}>

        {/* ── Left: Image slider ── */}
        <div>
          <div style={{
            position: 'relative',
            background: '#f7f6f3',
            borderRadius: 16,
            overflow: 'hidden',
            aspectRatio: '1 / 1',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {images.length > 0 ? (
              <>
                <img
                  src={imgSrc(images[imgIdx])}
                  alt={product.name}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
                {images.length > 1 && (
                  <>
                    <button onClick={prevImg} style={arrowBtn('left')}>‹</button>
                    <button onClick={nextImg} style={arrowBtn('right')}>›</button>
                    <div style={{
                      position: 'absolute', bottom: 12, left: 0, right: 0,
                      display: 'flex', justifyContent: 'center', gap: 6,
                    }}>
                      {images.map((_, i) => (
                        <div key={i} onClick={() => setImgIdx(i)} style={{
                          width: 8, height: 8, borderRadius: '50%', cursor: 'pointer',
                          background: i === imgIdx ? '#000' : '#ccc',
                          transition: 'background .2s',
                        }} />
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <div style={{ fontSize: 64 }}>📦</div>
            )}
          </div>

          {/* Download buttons */}
          {images.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button
                onClick={() => downloadImage(images[imgIdx], imgIdx)}
                style={{
                  flex: 1, padding: '7px 0', borderRadius: 8, border: '1.5px solid #e0e0e0',
                  background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#333',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                ↓ Скачать фото
              </button>
              {images.length > 1 && (
                <button
                  onClick={downloadAll}
                  style={{
                    flex: 1, padding: '7px 0', borderRadius: 8, border: '1.5px solid #e0e0e0',
                    background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#333',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  ↓ Все ({images.length})
                </button>
              )}
            </div>
          )}

          {/* Thumbnails */}
          {images.length > 1 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {images.map((url, i) => (
                <div
                  key={i}
                  style={{ position: 'relative', flexShrink: 0 }}
                  onClick={() => setImgIdx(i)}
                >
                  <div style={{
                    width: 60, height: 60, borderRadius: 8, overflow: 'hidden',
                    border: i === imgIdx ? '2px solid #000' : '2px solid transparent',
                    cursor: 'pointer', background: '#f7f6f3',
                  }}>
                    <img
                      src={imgSrc(url)}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                  {/* Download icon on thumbnail */}
                  <button
                    onClick={e => { e.stopPropagation(); downloadImage(url, i); }}
                    title="Скачать"
                    style={{
                      position: 'absolute', bottom: 2, right: 2,
                      width: 18, height: 18, borderRadius: 4,
                      background: 'rgba(0,0,0,0.55)', border: 'none',
                      color: '#fff', fontSize: 10, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      lineHeight: 1,
                    }}
                  >
                    ↓
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Right: Info ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Name + badges */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
              {product.brand?.replace('matkasym-', '').toUpperCase()} · {product.set?.toUpperCase() || '—'}
            </div>
            <h2 style={{ fontSize: 26, fontWeight: 800, margin: 0, lineHeight: 1.2 }}>
              {product.fullName || product.name}
            </h2>
            {product.sku && (
              <div style={{ fontSize: 12, color: 'var(--slate)', marginTop: 4 }}>SKU: {product.sku}</div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: ps.color, background: ps.color + '18', padding: '3px 10px', borderRadius: 20 }}>
                {ps.label}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: ss.color, background: ss.color + '18', padding: '3px 10px', borderRadius: 20 }}>
                {ss.label}
              </span>
              {product.inTransit && (
                <span style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', background: '#eef6ff', padding: '3px 10px', borderRadius: 20 }}>
                  🚚 В пути
                </span>
              )}
              {product.isNew && (
                <span style={{ fontSize: 12, fontWeight: 700, color: '#e10523', background: '#fde8e8', padding: '3px 10px', borderRadius: 20 }}>NEW</span>
              )}
            </div>
          </div>

          {/* CRM pipeline */}
          {product.productStatus === 'in_development' && product.developmentStage && (
            <CrmPipeline stage={product.developmentStage} />
          )}

          {/* Category */}
          <Row label="Категория" value={categoryLabel(product.category)} />

          {/* Color */}
          {product.color && <Row label="Цвет" value={{ white: 'Белый', black: 'Чёрный', grey: 'Серый', pink: 'Розовый', green: 'Зелёный' }[product.color] || product.color} />}

          {/* Dimensions */}
          {product.dimensions && <Row label="Габариты" value={product.dimensions} />}

          {/* Supplier — привозной товар */}
          {product.isSupplied && (
            <div style={{ background: '#eef6ff', border: '1.5px solid #93c5fd', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
                📦 Привозной товар (поставщик)
              </div>
              {product.supplier?.company && <Row label="Компания" value={product.supplier.company} />}
              {product.supplier?.contactName && <Row label="Контактное лицо" value={product.supplier.contactName} />}
              {product.supplier?.sku && <Row label="Артикул поставщика" value={product.supplier.sku} />}
              {!product.supplier?.company && !product.supplier?.contactName && !product.supplier?.sku && (
                <span style={{ fontSize: 13, color: 'var(--slate)' }}>Данные поставщика не заполнены</span>
              )}
            </div>
          )}

          {/* Description */}
          {product.description && (
            <div>
              <Label>Описание</Label>
              <p style={{ fontSize: 14, color: '#333', lineHeight: 1.6, margin: 0 }}>{product.description}</p>
            </div>
          )}

          {/* Specs */}
          {product.specs?.length > 0 && (
            <div>
              <Label>Характеристики</Label>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <tbody>
                  {product.specs.map((s, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--gray-200)' }}>
                      <td style={{ padding: '6px 0', color: 'var(--slate)', width: '50%' }}>{s.key}</td>
                      <td style={{ padding: '6px 0', fontWeight: 600 }}>{s.value}{s.unit ? ` ${s.unit}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TZ: В разработке */}
          {product.productStatus === 'in_development' && (
            <TZView
              type="development"
              data={product.developmentTZ}
              accent="#7c3aed"
              accentBg="#f3e8ff"
              title="Техническое задание"
              fields={[{ key: 'description', label: 'Описание ТЗ' }]}
              onDownload={() => downloadTZ('development')}
              loading={pdfLoading === 'development'}
            />
          )}

          {/* TZ: На улучшении */}
          {product.productStatus === 'improvement' && (
            <TZView
              type="improvement"
              data={product.improvementTZ}
              accent="#c47a00"
              accentBg="#fff8e6"
              title="Задача на улучшение"
              fields={[
                { key: 'problem',  label: 'В чем проблема?' },
                { key: 'solution', label: 'Возможное решение' },
              ]}
              onDownload={() => downloadTZ('improvement')}
              loading={pdfLoading === 'improvement'}
            />
          )}

          {/* На паузе — причина */}
          {product.productStatus === 'on_pause' && product.pauseNote && (
            <div style={{ background: '#f0f4f8', border: '1.5px solid #94a3b8', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
                ⏸ Причина паузы
              </div>
              <div style={{ fontSize: 14, color: '#334155', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {product.pauseNote}
              </div>
            </div>
          )}

          {/* Prices */}
          <div>
            <Label>Цены</Label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              <PriceCard label="Розничная" value={product.price} />
              <PriceCard label="Оптовая"   value={product.priceWholesale} />
              <PriceCard label="Дилерская" value={product.priceDealer} />
              <PriceCard label="Себестоимость" value={product.priceCost} />
            </div>
          </div>

          {/* Stock */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div>
              <Label>Остаток на складе</Label>
              <span style={{
                fontSize: 28, fontWeight: 800,
                color: product.stock > 10 ? '#2d7a3a' : product.stock > 0 ? '#c47a00' : '#c0392b',
              }}>
                {product.stock ?? 0}
              </span>
              <span style={{ fontSize: 13, color: 'var(--slate)', marginLeft: 4 }}>шт.</span>
            </div>
          </div>

          {canEdit && (
            <button
              className="btn btn-primary"
              onClick={() => navigate(`/admin/products/${id}/edit`)}
              style={{ alignSelf: 'flex-start', marginTop: 8 }}
            >
              Редактировать товар
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TZView({ data, accent, accentBg, title, fields, onDownload, loading }) {
  const hasContent = fields.some(f => data?.[f.key]?.trim()) || data?.files?.length > 0;

  return (
    <div style={{ padding: '16px 20px', borderRadius: 12, border: `1.5px solid ${accent}30`, background: accentBg + '55' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: accent }}>
          {title}
        </div>
        <button
          onClick={onDownload}
          disabled={loading}
          style={{
            padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
            border: `1.5px solid ${accent}`, background: accent, color: '#fff',
            cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1,
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          {loading ? '⏳' : '⬇'} Скачать ТЗ
        </button>
      </div>

      {!hasContent && (
        <p style={{ fontSize: 13, color: 'var(--slate)', margin: 0 }}>ТЗ не заполнено</p>
      )}

      {fields.map(f => data?.[f.key] ? (
        <div key={f.key} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: accent, marginBottom: 5 }}>
            {f.label}
          </div>
          <p style={{ fontSize: 13, color: '#1a1a1a', lineHeight: 1.65, margin: 0, whiteSpace: 'pre-wrap' }}>
            {data[f.key]}
          </p>
        </div>
      ) : null)}

      {data?.files?.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: accent, marginBottom: 6 }}>
            Прикреплённые файлы
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {data.files.map((f, i) => (
              <a
                key={i} href={f.url} target="_blank" rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: accent, textDecoration: 'none', padding: '5px 10px', borderRadius: 7, background: '#fff', border: '1px solid var(--gray-200)' }}
              >
                <span>📎</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                <span style={{ fontSize: 11, fontWeight: 700 }}>Открыть →</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Label({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--slate)', marginBottom: 6 }}>{children}</div>;
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: 12, fontSize: 14 }}>
      <span style={{ color: 'var(--slate)', minWidth: 120 }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function PriceCard({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <div style={{ background: '#f7f6f3', borderRadius: 8, padding: '10px 14px' }}>
      <div style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 600, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800 }}>{Number(value).toLocaleString('ru')} сом</div>
    </div>
  );
}

function CrmPipeline({ stage }) {
  const activeIdx = CRM_STAGES.indexOf(stage);
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: '#7c3aed', marginBottom: 10 }}>
        Этап разработки (CRM)
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        {CRM_STAGES.map((s, i) => {
          const done    = i < activeIdx;
          const current = i === activeIdx;
          const future  = i > activeIdx;
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < CRM_STAGES.length - 1 ? 1 : 'none' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800,
                  background: done ? '#7c3aed' : current ? '#f3e8ff' : '#f0f0f0',
                  border: current ? '2px solid #7c3aed' : done ? 'none' : '2px solid #ddd',
                  color: done ? '#fff' : current ? '#7c3aed' : '#bbb',
                }}>
                  {done ? '✓' : i + 1}
                </div>
                <div style={{
                  fontSize: 10, fontWeight: current ? 700 : 500, textAlign: 'center',
                  color: done ? '#7c3aed' : current ? '#7c3aed' : '#bbb',
                  whiteSpace: 'nowrap', maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis',
                }} title={s}>
                  {s}
                </div>
              </div>
              {i < CRM_STAGES.length - 1 && (
                <div style={{
                  flex: 1, height: 2, marginBottom: 16,
                  background: done ? '#7c3aed' : '#e0e0e0',
                  transition: 'background .3s',
                }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function arrowBtn(side) {
  return {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
    [side]: 12,
    background: 'rgba(255,255,255,.85)', border: 'none', borderRadius: '50%',
    width: 36, height: 36, fontSize: 22, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,.15)', zIndex: 2,
  };
}
