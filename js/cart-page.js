// ================================
// МАТКАСЫМ — Cart Page JS
// ================================

document.addEventListener('DOMContentLoaded', renderCartPage);

function renderCartPage() {
  const layout = document.getElementById('cartLayout');
  if (!layout) return;

  if (cart.length === 0) {
    layout.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty__icon">🛒</div>
        <h2>Корзина пуста</h2>
        <p>Добавьте товары из каталога, чтобы оформить заказ</p>
        <a href="catalog.html" class="btn btn--blue">Перейти в каталог</a>
      </div>`;
    return;
  }

  const subtotal = getCartTotal();
  const delivery = subtotal >= 50000 ? 0 : 3900;
  const total    = subtotal + delivery;

  const itemsHTML = cart.map(item => {
    const p = PRODUCTS.find(pr => pr.id === item.id);
    if (!p) return '';
    return `
      <div class="cart-item" data-id="${p.id}">
        <div class="cart-item__img">${productSVG(p.color, p.icon)}</div>
        <div class="cart-item__info">
          <div class="cart-item__name">${p.fullName}</div>
          <div class="cart-item__sku">Артикул: MKS-${String(p.id).padStart(5,'0')}</div>
          <div class="cart-item__actions">
            <div class="cart-item__qty">
              <button onclick="cartQty(${p.id},-1)">−</button>
              <span>${item.qty}</span>
              <button onclick="cartQty(${p.id},1)">+</button>
            </div>
            <span class="cart-item__remove" onclick="cartRemove(${p.id})">Удалить</span>
          </div>
        </div>
        <div class="cart-item__price">${formatPrice(p.price * item.qty)}</div>
      </div>`;
  }).join('');

  layout.innerHTML = `
    <div class="cart-items">${itemsHTML}</div>
    <aside class="cart-summary">
      <h3>Итого</h3>
      <div class="cart-summary__row"><span>Товары (${cart.reduce((s,i)=>s+i.qty,0)} шт.)</span><span>${formatPrice(subtotal)}</span></div>
      <div class="cart-summary__row"><span>Доставка</span><span>${delivery === 0 ? 'Бесплатно' : formatPrice(delivery)}</span></div>
      ${delivery > 0 ? `<p class="cart-summary__delivery">До бесплатной доставки: ${formatPrice(50000 - subtotal)}</p>` : `<p class="cart-summary__delivery">Бесплатная доставка!</p>`}
      <div class="cart-summary__row cart-summary__row--total"><span>Итого</span><span>${formatPrice(total)}</span></div>
      <a href="checkout.html" class="btn btn--blue">Оформить заказ</a>
      <a href="catalog.html" class="btn btn--outline">Продолжить покупки</a>
    </aside>`;
}

function cartQty(id, delta) {
  updateQty(id, delta);
  renderCartPage();
}

function cartRemove(id) {
  removeFromCart(id);
  renderCartPage();
}
