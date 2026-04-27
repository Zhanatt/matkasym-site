import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import './Cart.css';

export default function Cart() {
  const { items, removeItem, updateQty, total } = useCart();

  if (!items.length) return (
    <div className="container">
      <div className="empty-state" style={{ marginTop: 40 }}>
        <h2>Корзина пуста</h2>
        <p>Добавьте товары из каталога</p>
        <Link to="/catalog" className="btn btn-primary" style={{ marginTop: 20 }}>Перейти в каталог</Link>
      </div>
    </div>
  );

  return (
    <div className="container cart-page">
      <h1 className="page-title">Корзина</h1>

      <div className="cart-layout">
        <div className="cart-items">
          {items.map(item => (
            <div key={item.product} className="cart-item">
              <div className="cart-item-img">
                {item.image ? <img src={item.image} alt={item.name} /> : <span>📦</span>}
              </div>
              <div className="cart-item-info">
                <p className="cart-item-name">{item.name}</p>
                <p className="cart-item-price">{item.price.toLocaleString('ru')} сом</p>
              </div>
              <div className="qty-control">
                <button onClick={() => updateQty(item.product, item.qty - 1)}>−</button>
                <span>{item.qty}</span>
                <button onClick={() => updateQty(item.product, item.qty + 1)}>+</button>
              </div>
              <p className="cart-item-sum">{(item.price * item.qty).toLocaleString('ru')} сом</p>
              <button className="cart-item-remove" onClick={() => removeItem(item.product)}>✕</button>
            </div>
          ))}
        </div>

        <div className="cart-summary">
          <h2>Итого</h2>
          <div className="summary-row">
            <span>Товары ({items.length})</span>
            <span>{total.toLocaleString('ru')} сом</span>
          </div>
          <div className="summary-row summary-total">
            <span>К оплате</span>
            <span>{total.toLocaleString('ru')} сом</span>
          </div>
          <Link to="/checkout" className="btn btn-primary btn-full">Оформить заказ</Link>
          <Link to="/catalog"  className="btn btn-ghost btn-full" style={{ marginTop: 8 }}>Продолжить покупки</Link>
        </div>
      </div>
    </div>
  );
}
