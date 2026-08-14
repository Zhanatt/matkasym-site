import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { shopMyRequests } from './shopApi';
import { setBackButton } from './useTelegram';
import { money, STATUS_LABELS, NO_PHOTO } from './shopUtils';

const dateFmt = d => new Date(d).toLocaleDateString('ru', { day: 'numeric', month: 'long' });

export default function ShopMyRequests() {
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [payUrl, setPayUrl] = useState('');

  useEffect(() => setBackButton(() => navigate('/shop')), [navigate]);
  useEffect(() => {
    shopMyRequests()
      .then(d => { setItems(d.items); setPayUrl(d.payUrl || ''); })
      .catch(() => setItems([]));
  }, []);

  if (items === null) return <p className="shop-loading">Загружаем…</p>;

  if (!items.length) {
    return (
      <div className="shop-done">
        <div className="shop-done__icon">🧾</div>
        <h2>Заявок пока нет</h2>
        <p>Выберите товар в каталоге и нажмите «Уточнить наличие» — менеджер свяжется с вами.</p>
        <button className="shop-submit" style={{ width: '100%' }} onClick={() => navigate('/shop')}>
          В каталог
        </button>
      </div>
    );
  }

  return (
    <>
      <header className="shop-head">
        <div className="shop-head__row">
          <div className="shop-brand"><span>Мои заявки</span></div>
          <button className="shop-mine" onClick={() => navigate('/shop')}>В каталог</button>
        </div>
      </header>

      <div className="shop-list">
        {items.map(r => (
          <div className="shop-req" key={r._id}>
            <img src={r.snapshot.image || NO_PHOTO} alt={r.snapshot.name} />
            <div>
              <div className="shop-req__name">{r.snapshot.name}</div>
              <div className="shop-req__meta">
                {money(r.snapshot.price)} · {r.qty} шт. · {dateFmt(r.createdAt)}
              </div>
              <span className={`shop-status shop-status--${r.status}`}>
                {STATUS_LABELS[r.status] || r.status}
              </span>
              {r.status === 'out_of_stock' && r.notifyOnRestock && (
                <div className="shop-req__meta">Сообщим, когда появится на складе</div>
              )}
              {/* Менеджер подтвердил наличие — можно платить. Кнопка живёт здесь,
                  а не только в сообщении бота: сообщение может не дойти, а в приложение
                  клиент заходит сам. */}
              {r.status === 'in_stock' && payUrl && (
                <a className="shop-pay" href={payUrl} target="_blank" rel="noreferrer">
                  💳 Оплатить {(Number(r.snapshot.price) * r.qty).toLocaleString('ru')} сом
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
