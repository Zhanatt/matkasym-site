import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getMyOrders } from '../api';
import { useAuth } from '../context/AuthContext';
import './Orders.css';

const STATUS_LABELS = {
  pending:    { label: 'Принят',     color: '#f5a623' },
  processing: { label: 'Обрабатывается', color: '#0058A3' },
  shipped:    { label: 'Отправлен', color: '#8B5CF6' },
  delivered:  { label: 'Доставлен', color: '#008000' },
  cancelled:  { label: 'Отменён',   color: '#E00751' },
};

export default function Orders() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) { navigate('/login'); return; }
    if (user) {
      getMyOrders()
        .then(r => setOrders(r.data))
        .finally(() => setLoading(false));
    }
  }, [user, authLoading]);

  if (loading) return <div className="spinner-wrap"><div className="spinner" /></div>;

  return (
    <div className="container orders-page">
      <h1 className="page-title">Мои заказы</h1>

      {!orders.length ? (
        <div className="empty-state">
          <h2>Заказов пока нет</h2>
          <p>Оформите свой первый заказ</p>
          <Link to="/catalog" className="btn btn-primary" style={{ marginTop: 20 }}>В каталог</Link>
        </div>
      ) : (
        <div className="orders-list">
          {orders.map(order => {
            const st = STATUS_LABELS[order.status] || STATUS_LABELS.pending;
            return (
              <div key={order._id} className="order-card">
                <div className="order-header">
                  <div>
                    <p className="order-id">Заказ #{order._id.slice(-8).toUpperCase()}</p>
                    <p className="order-date">{new Date(order.createdAt).toLocaleDateString('ru')}</p>
                  </div>
                  <span className="order-status" style={{ color: st.color }}>{st.label}</span>
                </div>
                <div className="order-items">
                  {order.items.map((item, i) => (
                    <div key={i} className="order-item">
                      <span>{item.name}</span>
                      <span>× {item.qty}</span>
                      <span>{(item.price * item.qty).toLocaleString('ru')} сом</span>
                    </div>
                  ))}
                </div>
                <div className="order-footer">
                  <span>Итого: <strong>{order.total.toLocaleString('ru')} сом</strong></span>
                  {order.address?.city && <span>📍 {order.address.city}, {order.address.street}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
