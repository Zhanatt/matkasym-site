import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import { adminGetProducts, adminReceiveProduct, adminGetProductRequestCount } from '../../api';
import AdminProductModal from './AdminProductModal';
import PendingOrderRequests from './PendingOrderRequests';

const NO_PHOTO = '/logos/no-photo.png';

function useIsMobile() {
  const [mob, setMob] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const h = () => setMob(window.innerWidth < 640);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return mob;
}

export default function AdminPendingReceive() {
  const { user } = useAuth();
  const isWarehouse = user?.role === 'warehouse';
  const isMobile = useIsMobile();

  const [tab, setTab] = useState('pending'); // 'orders' | 'inTransit' | 'pending' | 'received'
  const [orderCount, setOrderCount] = useState(0);
  const [inTransitProducts, setInTransitProducts] = useState([]);
  const [pendingProducts, setPendingProducts] = useState([]);
  const [receivedProducts, setReceivedProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [receiveQty, setReceiveQty] = useState(0);
  const [receiveAlert, setReceiveAlert] = useState('ok');
  const [receiveComment, setReceiveComment] = useState('');
  const [receiving, setReceiving] = useState(false);
  const [viewProduct, setViewProduct] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      // Товары в пути и ожидающие приёмки
      const res = await adminGetProducts({ pendingReceive: true, limit: 500 });
      const all = res.data.products || [];
      setInTransitProducts(all.filter(p => p.inTransit));
      setPendingProducts(all.filter(p => p.pendingReceive && !p.inTransit));

      // Недавно принятые (последние 50 с stock > 0, которые были приняты)
      const recentRes = await adminGetProducts({
        includePending: true,
        sort: 'newest',
        limit: 50,
        inStock: true
      });
      // Фильтруем только те, что из набора китайских щитов или недавно принятые
      const recent = (recentRes.data.products || []).filter(p =>
        p.sku?.startsWith('MKS-SF-') || p.sku?.startsWith('MKS-W')
      );
      setReceivedProducts(recent.slice(0, 30));

      // Счётчик активных заявок на заказ для бейджа вкладки
      adminGetProductRequestCount()
        .then(r => setOrderCount(r.data.activeCount || 0))
        .catch(() => {});
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const tabs = [
    { key: 'orders', label: '📥 Заявки на заказ', count: orderCount, color: '#DC1E24' },
    { key: 'inTransit', label: '🚚 В пути', count: inTransitProducts.length, color: '#3b82f6' },
    { key: 'pending', label: '📋 Ожидают приёмки', count: pendingProducts.length, color: '#f59e0b' },
    { key: 'received', label: '✓ В продаже', count: receivedProducts.length, color: '#22c55e' },
  ];

  const products = tab === 'inTransit' ? inTransitProducts
                 : tab === 'pending' ? pendingProducts
                 : receivedProducts;

  const openReceive = (p) => {
    if (p.inTransit || tab === 'received') return;
    setSelected(p);
    setReceiveQty(p.pendingReceiveQty || p.inTransitQty || 1);
    setReceiveAlert('ok');
    setReceiveComment('');
    document.body.style.overflow = 'hidden';
  };

  const closeModal = () => {
    setSelected(null);
    document.body.style.overflow = '';
  };

  const handleReceive = async () => {
    if (!selected) return;
    setReceiving(true);
    try {
      await adminReceiveProduct(selected._id, {
        receivedQty: receiveQty,
        alertType: receiveAlert,
        comment: receiveComment,
      });
      closeModal();
      load();
    } catch (e) {
      alert('Ошибка: ' + (e.response?.data?.error || e.message));
    } finally {
      setReceiving(false);
    }
  };

  const expectedQty = selected ? (selected.pendingReceiveQty || selected.inTransitQty || 0) : 0;

  return (
    <div style={{ padding: '24px', maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>📦 Поступления товаров</h1>
      <p style={{ color: '#888', marginBottom: 20 }}>Отслеживание этапов поставки</p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '10px 16px', fontSize: 14, fontWeight: 600,
              borderRadius: 10, border: 'none', cursor: 'pointer',
              background: tab === t.key ? t.color : '#f0f0f0',
              color: tab === t.key ? '#fff' : '#555',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            {t.label}
            {t.count > 0 && (
              <span style={{
                background: tab === t.key ? 'rgba(255,255,255,0.3)' : t.color,
                color: '#fff', padding: '2px 8px', borderRadius: 10, fontSize: 12,
              }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Заявки на заказ (отдельная вкладка) */}
      {tab === 'orders' ? (
        <PendingOrderRequests onCountChange={setOrderCount} />
      ) : (
       <>
      {/* Status explanation */}
      <div style={{
        background: tab === 'inTransit' ? '#eff6ff' : tab === 'pending' ? '#fef3c7' : '#dcfce7',
        padding: '12px 16px', borderRadius: 10, marginBottom: 20,
        fontSize: 13, color: tab === 'inTransit' ? '#1d4ed8' : tab === 'pending' ? '#92400e' : '#166534',
      }}>
        {tab === 'inTransit' && '🚚 Товары в процессе доставки. Когда поступят на склад — переведите в "Ожидают приёмки"'}
        {tab === 'pending' && '📋 Товары на складе, ждут подсчёта. Нажмите "Принять" чтобы посчитать и добавить в продажу'}
        {tab === 'received' && '✓ Товары приняты и доступны в каталоге для фронтменов'}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>Загрузка...</div>
      ) : products.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 60, background: '#f9f9f9',
          borderRadius: 16, color: '#888'
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>
            {tab === 'inTransit' ? '📭' : tab === 'pending' ? '✓' : '📦'}
          </div>
          <div style={{ fontSize: 16 }}>
            {tab === 'inTransit' && 'Нет товаров в пути'}
            {tab === 'pending' && 'Нет товаров для приёмки'}
            {tab === 'received' && 'Нет принятых товаров'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {products.map(p => {
            const isInTransit = p.inTransit;
            const isPending = p.pendingReceive && !p.inTransit;
            const isReceived = tab === 'received';
            const canReceive = isPending && isWarehouse;

            return (
              <div
                key={p._id}
                onClick={() => setViewProduct(p)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  background: '#fff',
                  border: `1.5px solid ${isInTransit ? '#bfdbfe' : isPending ? '#fde68a' : '#bbf7d0'}`,
                  borderRadius: 12, padding: 16,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseOver={e => e.currentTarget.style.borderColor = '#888'}
                onMouseOut={e => {
                  e.currentTarget.style.borderColor = isInTransit ? '#bfdbfe' : isPending ? '#fde68a' : '#bbf7d0';
                }}
              >
                <img
                  src={p.images?.[0] || NO_PHOTO}
                  alt=""
                  style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, background: '#f5f5f5' }}
                  onError={e => { e.target.src = NO_PHOTO; }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
                    {p.fullName || p.name}
                  </div>
                  <div style={{ fontSize: 12, color: '#888' }}>
                    {p.sku}
                  </div>
                  {isInTransit && (
                    <div style={{ fontSize: 11, color: '#3b82f6', marginTop: 4 }}>
                      🚚 В пути
                    </div>
                  )}
                </div>
                <div style={{
                  background: isInTransit ? '#dbeafe' : isPending ? '#fef3c7' : '#dcfce7',
                  color: isInTransit ? '#1d4ed8' : isPending ? '#92400e' : '#166534',
                  padding: '6px 12px', borderRadius: 20,
                  fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}>
                  {isReceived ? p.stock : (p.pendingReceiveQty || p.inTransitQty || '?')} шт
                </div>
                {canReceive && !isMobile && (
                  <div style={{
                    background: '#22c55e', color: '#fff',
                    padding: '8px 16px', borderRadius: 10,
                    fontSize: 13, fontWeight: 700,
                    flexShrink: 0,
                  }}>
                    Принять
                  </div>
                )}
                {canReceive && isMobile && (
                  <div style={{ fontSize: 18, color: '#22c55e' }}>→</div>
                )}
                {isReceived && (
                  <div style={{
                    background: '#dcfce7', color: '#166534',
                    padding: '6px 12px', borderRadius: 10,
                    fontSize: 12, fontWeight: 600,
                    flexShrink: 0,
                  }}>
                    ✓ В продаже
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
       </>
      )}

      {/* Receive Modal */}
      {selected && createPortal(
        <>
          <div
            onClick={closeModal}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.6)',
              zIndex: 1600,
            }}
          />
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1601,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24, pointerEvents: 'none',
          }}>
            <div style={{
              background: '#fff', borderRadius: 18,
              width: '100%', maxWidth: 500,
              maxHeight: '90vh', overflow: 'auto',
              padding: 24, pointerEvents: 'auto',
              boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
            }}>
              {/* Header */}
              <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
                <img
                  src={selected.images?.[0] || NO_PHOTO}
                  alt=""
                  style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 12, background: '#f5f5f5' }}
                  onError={e => { e.target.src = NO_PHOTO; }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>
                    {selected.fullName || selected.name}
                  </div>
                  <div style={{ fontSize: 13, color: '#888', marginBottom: 8 }}>
                    {selected.sku}
                  </div>
                  <span style={{
                    background: '#fef3c7', color: '#92400e',
                    padding: '4px 10px', borderRadius: 16,
                    fontSize: 12, fontWeight: 700,
                  }}>
                    📋 Ожидает приёмки
                  </span>
                </div>
                <button
                  onClick={closeModal}
                  style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: '#f5f5f5', border: 'none',
                    fontSize: 18, cursor: 'pointer',
                  }}
                >✕</button>
              </div>

            {/* Qty comparison */}
            <div style={{
              display: 'flex', gap: 12, marginBottom: 20, padding: 16,
              background: '#f8f8f8', borderRadius: 12,
            }}>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>ОЖИДАЕТСЯ</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#333' }}>
                  {expectedQty || '—'}
                </div>
              </div>
              <div style={{ width: 1, background: '#ddd' }} />
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>ФАКТИЧЕСКИ</div>
                <input
                  type="number"
                  value={receiveQty}
                  onChange={e => {
                    const qty = Number(e.target.value);
                    setReceiveQty(qty);
                    if (qty === expectedQty) setReceiveAlert('ok');
                    else if (qty < expectedQty) setReceiveAlert('shortage');
                    else setReceiveAlert('excess');
                  }}
                  min={0}
                  style={{
                    width: 100, padding: '8px', fontSize: 32, fontWeight: 700,
                    border: '2px solid #3b82f6', borderRadius: 10, textAlign: 'center',
                    color: receiveQty === expectedQty ? '#22c55e' :
                           receiveQty < expectedQty ? '#ef4444' : '#3b82f6',
                  }}
                />
              </div>
            </div>

            {/* Difference warning */}
            {expectedQty > 0 && receiveQty !== expectedQty && (
              <div style={{
                padding: '12px 16px', borderRadius: 10, marginBottom: 20,
                background: receiveQty < expectedQty ? '#fef2f2' : '#eff6ff',
                color: receiveQty < expectedQty ? '#dc2626' : '#2563eb',
                fontSize: 14, fontWeight: 600,
              }}>
                {receiveQty < expectedQty
                  ? `⚠️ Недостача: не хватает ${expectedQty - receiveQty} шт.`
                  : `📈 Излишек: больше на ${receiveQty - expectedQty} шт.`
                }
              </div>
            )}

            {/* Problems */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 8 }}>
                Проблемы (если есть):
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  { key: 'damaged', label: '💔 Повреждён', color: '#ef4444' },
                  { key: 'wrong', label: '❌ Не тот товар', color: '#ef4444' },
                ].map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setReceiveAlert(receiveAlert === opt.key ? 'ok' : opt.key)}
                    style={{
                      padding: '8px 14px', fontSize: 13, fontWeight: 600, borderRadius: 20,
                      background: receiveAlert === opt.key ? opt.color : '#f0f0f0',
                      color: receiveAlert === opt.key ? '#fff' : '#555',
                      border: 'none', cursor: 'pointer',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Comment */}
            {((expectedQty > 0 && receiveQty !== expectedQty) || receiveAlert === 'damaged' || receiveAlert === 'wrong') && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 8 }}>
                  Комментарий:
                </div>
                <textarea
                  value={receiveComment}
                  onChange={e => setReceiveComment(e.target.value)}
                  placeholder="Опишите ситуацию..."
                  style={{
                    width: '100%', minHeight: 70, padding: 12, fontSize: 14,
                    border: '1.5px solid #ddd', borderRadius: 10, resize: 'vertical',
                    fontFamily: 'inherit', boxSizing: 'border-box',
                  }}
                />
              </div>
            )}

            {/* Submit button */}
            <button
              onClick={handleReceive}
              disabled={receiving || receiveQty <= 0}
              style={{
                width: '100%', padding: '18px', fontSize: 18, fontWeight: 700,
                background: receiving ? '#ccc' : '#22c55e', color: '#fff',
                border: 'none', borderRadius: 14, cursor: receiving ? 'not-allowed' : 'pointer',
              }}
            >
              {receiving ? '⏳ Принимаем...' : `✓ Принять ${receiveQty} шт. в продажу`}
            </button>
            </div>
          </div>
        </>,
        document.body
      )}

      {/* Product View Modal */}
      {viewProduct && (
        <AdminProductModal
          product={viewProduct}
          onClose={() => setViewProduct(null)}
          onSaved={() => { setViewProduct(null); load(); }}
          extraActions={
            viewProduct.pendingReceive && !viewProduct.inTransit && isWarehouse ? (
              <button
                onClick={(e) => { e.stopPropagation(); setViewProduct(null); openReceive(viewProduct); }}
                style={{
                  padding: '12px 24px', fontSize: 15, fontWeight: 700,
                  background: '#22c55e', color: '#fff',
                  border: 'none', borderRadius: 10, cursor: 'pointer',
                  marginTop: 12, width: '100%',
                }}
              >
                ✓ Принять товар
              </button>
            ) : null
          }
        />
      )}
    </div>
  );
}
