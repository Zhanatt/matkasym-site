import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { shopProduct, shopRequest } from './shopApi';
import { setBackButton, setMainButton, isTelegram, tgUser, haptic } from './useTelegram';
import { photoOf, money } from './shopUtils';

/**
 * Заявка «Уточнить наличие».
 *
 * Покупки внутри приложения нет намеренно: остаток на сайте — это выгрузка из 1С,
 * между выгрузками товар успевают продать в магазине. Поэтому менеджер сначала
 * подтверждает наличие, а оплату клиент делает переводом (MBank) уже после разговора.
 */
export default function ShopRequestForm() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [product, setProduct] = useState(null);
  const [name, setName]       = useState(tgUser()?.first_name || '');
  const [phone, setPhone]     = useState('');
  const [qty, setQty]         = useState(1);
  const [comment, setComment] = useState('');
  const [notify, setNotify]   = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError]     = useState('');
  const [done, setDone]       = useState(false);

  useEffect(() => { shopProduct(id).then(setProduct).catch(() => {}); }, [id]);
  useEffect(() => setBackButton(() => (done ? navigate('/shop') : navigate(`/shop/p/${id}`))), [id, done, navigate]);

  const phoneOk = phone.replace(/\D/g, '').length >= 9;

  const submit = async () => {
    if (sending || !phoneOk) {
      if (!phoneOk) setError('Укажите номер телефона — менеджер перезвонит по нему');
      return;
    }
    setSending(true);
    setError('');
    try {
      await shopRequest({ productId: id, qty, name, phone, comment, notifyOnRestock: notify });
      haptic('success');
      setDone(true);
    } catch (e) {
      haptic('error');
      const d = e.response?.data || {};
      // Код причины показываем рядом с текстом: по скриншоту от покупателя сразу видно,
      // что чинить — настройку сервера, устаревшую сессию или подпись.
      setError((d.error || 'Заявка не отправилась. Попробуйте ещё раз') + (d.code ? ` (${d.code})` : ''));
    } finally {
      setSending(false);
    }
  };

  // Кнопка Telegram ведёт себя как submit формы; после успеха она не нужна
  useEffect(() => {
    if (done) return;
    return setMainButton({
      text: sending ? 'Отправляем…' : 'Отправить заявку',
      onClick: submit,
      loading: sending,
      enabled: phoneOk && !sending,
    });
  }, [done, sending, phoneOk, qty, name, phone, comment, notify]);

  if (done) {
    return (
      <div className="shop-done">
        <div className="shop-done__icon">✅</div>
        <h2>Заявка отправлена</h2>
        <p>
          Менеджер проверит наличие и свяжется с вами{phone ? ` по номеру ${phone}` : ''}.
          Если товар есть — подскажет, как оплатить переводом MBank.
          {notify && ' Если товара не окажется — сообщим, как только он появится на складе.'}
        </p>
        <button className="shop-submit" style={{ width: '100%' }} onClick={() => navigate('/shop')}>
          Вернуться в каталог
        </button>
        <button className="shop-more" style={{ marginTop: 12 }} onClick={() => navigate('/shop/my')}>
          Мои заявки
        </button>
      </div>
    );
  }

  return (
    <div className="shop-form">
      <h2>Уточнить наличие</h2>

      {product && (
        <div className="shop-req">
          <img src={photoOf(product, 160)} alt={product.name} />
          <div>
            <div className="shop-req__name">{product.fullName || product.name}</div>
            <div className="shop-req__meta">{money(product.price)}{product.sku ? ` · арт. ${product.sku}` : ''}</div>
          </div>
        </div>
      )}

      <p className="shop-form__hint">
        Остаток на сайте обновляется выгрузкой из 1С, поэтому менеджер сначала подтвердит наличие,
        а потом подскажет, как оплатить.
      </p>

      <div className="shop-field">
        <label htmlFor="shop-name">Как к вам обращаться</label>
        <input id="shop-name" value={name} onChange={e => setName(e.target.value)} placeholder="Имя" />
      </div>

      <div className="shop-field">
        <label htmlFor="shop-phone">Телефон *</label>
        <input
          id="shop-phone"
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="+996 700 00 00 00"
        />
      </div>

      <div className="shop-field">
        <label>Количество</label>
        <div className="shop-qty">
          <button type="button" onClick={() => { haptic('light'); setQty(q => Math.max(1, q - 1)); }}>−</button>
          <span>{qty}</span>
          <button type="button" onClick={() => { haptic('light'); setQty(q => Math.min(999, q + 1)); }}>+</button>
        </div>
      </div>

      <div className="shop-field">
        <label htmlFor="shop-comment">Комментарий</label>
        <textarea
          id="shop-comment"
          rows={3}
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="Цвет, доставка, удобное время звонка…"
        />
      </div>

      <label className="shop-check">
        <input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} />
        <span>Сообщить в Telegram, когда товар появится на складе, если сейчас его не окажется</span>
      </label>

      {error && <div className="shop-error">{error}</div>}

      {!isTelegram() && (
        <button className="shop-submit" disabled={sending || !phoneOk} onClick={submit}>
          {sending ? 'Отправляем…' : 'Отправить заявку'}
        </button>
      )}
    </div>
  );
}
