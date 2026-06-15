import { useState, useEffect } from 'react';
import { adminGetProducts, adminReceiveProduct } from '../../api';

const NO_PHOTO = '/logos/no-photo.png';

export default function AdminPendingReceive() {
  const [tab, setTab] = useState('pending'); // 'pending' | 'inTransit'
  const [pendingProducts, setPendingProducts] = useState([]);
  const [inTransitProducts, setInTransitProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [receiveQty, setReceiveQty] = useState(0);
  const [receiveAlert, setReceiveAlert] = useState('ok');
  const [receiveComment, setReceiveComment] = useState('');
  const [receiving, setReceiving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminGetProducts({ pendingReceive: true, limit: 500 });
      const all = res.data.products || [];
      // Разделяем: pendingReceive (на складе) vs inTransit (в пути)
      setPendingProducts(all.filter(p => p.pendingReceive && !p.inTransit));
      setInTransitProducts(all.filter(p => p.inTransit));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const products = tab === 'pending' ? pendingProducts : inTransitProducts;

  const openReceive = (p) => {
    if (p.inTransit) return; // Нельзя принять товар в пути
    setSelected(p);
    setReceiveQty(p.pendingReceiveQty || p.inTransitQty || 1);
    setReceiveAlert('ok');
    setReceiveComment('');
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
      setSelected(null);
      load();
    } catch (e) {
      alert('Ошибка: ' + (e.response?.data?.error || e.message));
    } finally {
      setReceiving(false);
    }
  };

  const expectedQty = selected ? (selected.pendingReceiveQty || selected.inTransitQty || 0) : 0;

  return (
    <div style={{ padding: '24px', maxWidth: 800, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>📦 Приём товара</h1>
      <p style={{ color: '#888', marginBottom: 20 }}>Поступления на склад</p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <button
          onClick={() => setTab('pending')}
          style={{
            padding: '10px 20px', fontSize: 14, fontWeight: 600,
            borderRadius: 10, border: 'none', cursor: 'pointer',
            background: tab === 'pending' ? '#22c55e' : '#f0f0f0',
            color: tab === 'pending' ? '#fff' : '#555',
          }}
        >
          📋 Ожидают приёмки
          {pendingProducts.length > 0 && (
            <span style={{
              marginLeft: 8, background: tab === 'pending' ? 'rgba(255,255,255,0.3)' : '#22c55e',
              color: '#fff', padding: '2px 8px', borderRadius: 10, fontSize: 12,
            }}>
              {pendingProducts.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('inTransit')}
          style={{
            padding: '10px 20px', fontSize: 14, fontWeight: 600,
            borderRadius: 10, border: 'none', cursor: 'pointer',
            background: tab === 'inTransit' ? '#3b82f6' : '#f0f0f0',
            color: tab === 'inTransit' ? '#fff' : '#555',
          }}
        >
          🚚 В пути
          {inTransitProducts.length > 0 && (
            <span style={{
              marginLeft: 8, background: tab === 'inTransit' ? 'rgba(255,255,255,0.3)' : '#3b82f6',
              color: '#fff', padding: '2px 8px', borderRadius: 10, fontSize: 12,
            }}>
              {inTransitProducts.length}
            </span>
          )}
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>Загрузка...</div>
      ) : products.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 60, background: '#f9f9f9',
          borderRadius: 16, color: '#888'
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>
            {tab === 'pending' ? '✓' : '📭'}
          </div>
          <div style={{ fontSize: 16 }}>
            {tab === 'pending' ? 'Нет товаров для приёмки' : 'Нет товаров в пути'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {products.map(p => {
            const isPending = p.pendingReceive && !p.inTransit;
            const isInTransit = p.inTransit;
            return (
              <div
                key={p._id}
                onClick={() => openReceive(p)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  background: '#fff',
                  border: `1.5px solid ${isInTransit ? '#bfdbfe' : '#e5e5e5'}`,
                  borderRadius: 12, padding: 16,
                  cursor: isPending ? 'pointer' : 'default',
                  opacity: isInTransit ? 0.8 : 1,
                  transition: 'all 0.15s',
                }}
                onMouseOver={e => { if (isPending) e.currentTarget.style.borderColor = '#22c55e'; }}
                onMouseOut={e => { e.currentTarget.style.borderColor = isInTransit ? '#bfdbfe' : '#e5e5e5'; }}
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
                      🚚 Ещё в пути, ждём поступления
                    </div>
                  )}
                </div>
                <div style={{
                  background: isPending ? '#dcfce7' : '#dbeafe',
                  color: isPending ? '#166534' : '#1d4ed8',
                  padding: '6px 12px', borderRadius: 20,
                  fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap'
                }}>
                  {p.pendingReceiveQty || p.inTransitQty || '?'} шт
                </div>
                {isPending && (
                  <div style={{
                    background: '#22c55e', color: '#fff',
                    padding: '8px 16px', borderRadius: 10,
                    fontSize: 13, fontWeight: 700,
                  }}>
                    Принять
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {selected && (
        <>
          <div
            onClick={() => setSelected(null)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
              zIndex: 1000
            }}
          />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0,
            background: '#fff', borderRadius: '24px 24px 0 0',
            padding: '24px', zIndex: 1001, maxHeight: '85vh',
            overflow: 'auto',
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
                  background: '#dcfce7', color: '#166534',
                  padding: '4px 10px', borderRadius: 16,
                  fontSize: 12, fontWeight: 700,
                }}>
                  📋 Готов к приёмке
                </span>
              </div>
              <button
                onClick={() => setSelected(null)}
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
                <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>ПОЛУЧЕНО</div>
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
                  : `📈 Излишек: пришло на ${receiveQty - expectedQty} шт. больше`
                }
              </div>
            )}

            {/* Problems */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 8 }}>
                Проблемы (если есть):
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
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
              {receiving ? '⏳ Принимаем...' : `✓ Принять ${receiveQty} шт.`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
