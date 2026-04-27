import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createOrder } from '../api';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import './Checkout.css';

export default function Checkout() {
  const { items, total, clearCart } = useCart();
  const { user } = useAuth();
  const navigate  = useNavigate();
  const [form, setForm]   = useState({ city: '', address: '', paymentMethod: 'kaspi' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!items.length) {
    navigate('/cart');
    return null;
  }

  if (!user) {
    navigate('/login');
    return null;
  }

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.city || !form.address) { setError('Заполните адрес доставки'); return; }
    setLoading(true); setError('');
    try {
      await createOrder({
        items: items.map(i => ({ product: i.product, qty: i.qty })),
        address: { city: form.city, street: form.address },
        paymentMethod: form.paymentMethod,
      });
      clearCart();
      navigate('/orders');
    } catch (err) {
      setError(err.response?.data?.message || 'Ошибка оформления заказа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container checkout-page">
      <h1 className="page-title">Оформление заказа</h1>

      <div className="checkout-layout">
        <form className="checkout-form" onSubmit={handleSubmit}>
          <h2>Доставка</h2>

          <div className="form-group">
            <label>Город</label>
            <input
              value={form.city}
              onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
              placeholder="Алматы, Астана, Бишкек..."
            />
          </div>
          <div className="form-group">
            <label>Улица, дом, квартира</label>
            <input
              value={form.address}
              onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              placeholder="ул. Абая 12, кв 5"
            />
          </div>

          <h2>Оплата</h2>
          <div className="payment-options">
            {[
              { value: 'kaspi',   label: '💳 Kaspi Pay' },
              { value: 'cash',    label: '💵 Наличные при получении' },
              { value: 'card',    label: '🏦 Банковская карта' },
            ].map(opt => (
              <label key={opt.value} className={`payment-option ${form.paymentMethod === opt.value ? 'selected' : ''}`}>
                <input type="radio" name="payment" value={opt.value}
                  checked={form.paymentMethod === opt.value}
                  onChange={() => setForm(f => ({ ...f, paymentMethod: opt.value }))} />
                {opt.label}
              </label>
            ))}
          </div>

          {error && <p className="form-error">{error}</p>}

          <button className="btn btn-primary btn-full" disabled={loading}>
            {loading ? 'Оформляем...' : 'Подтвердить заказ'}
          </button>
        </form>

        <div className="checkout-summary">
          <h2>Ваш заказ</h2>
          {items.map(item => (
            <div key={item.product} className="checkout-item">
              <span>{item.name} × {item.qty}</span>
              <span>{(item.price * item.qty).toLocaleString('ru')} сом</span>
            </div>
          ))}
          <div className="checkout-total">
            <span>Итого</span>
            <span>{total.toLocaleString('ru')} сом</span>
          </div>
        </div>
      </div>
    </div>
  );
}
