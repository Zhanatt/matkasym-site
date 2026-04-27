// ================================
// МАТКАСЫМ — Product Detail JS
// ================================

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);
  const id = parseInt(params.get('id'));
  const product = PRODUCTS.find(p => p.id === id);
  if (!product) {
    document.getElementById('productDetail').innerHTML =
      '<div style="text-align:center;padding:80px"><h2>Товар не найден</h2><a href="catalog.html" class="btn btn--blue" style="margin-top:20px;display:inline-flex">В каталог</a></div>';
    return;
  }

  // Breadcrumb
  document.getElementById('bcProduct').textContent = product.fullName;
  document.title = `${product.fullName} — МАТКАСЫМ`;

  const catNames = { living:'Гостиная',bedroom:'Спальня',kitchen:'Кухня',bathroom:'Ванная',kids:'Детская',office:'Кабинет',storage:'Хранение',decor:'Декор' };
  const catLink = `<a href="catalog.html?cat=${product.category}">${catNames[product.category]||'Каталог'}</a>`;
  document.querySelector('#productBreadcrumb ul').innerHTML =
    `<li><a href="../index.html">Главная</a></li><li>${catLink}</li><li>${product.fullName}</li>`;

  // Badge
  const badgeHTML = product.tags.includes('sale') && product.oldPrice
    ? `<span class="product-detail__badge">Акция</span>`
    : product.isNew ? `<span class="product-detail__badge product-detail__badge--new">Новинка</span>` : '';

  // Price
  const savings = product.oldPrice ? product.oldPrice - product.price : 0;
  const savingsHTML = savings > 0
    ? `<span class="product-detail__savings">Вы экономите ${formatPrice(savings)}</span>` : '';
  const oldHTML = product.oldPrice
    ? `<span class="product-detail__price-old">${formatPrice(product.oldPrice)}</span>` : '';

  // Features
  const features = [
    ['Артикул', `MKS-${String(product.id).padStart(5,'0')}`],
    ['Категория', catNames[product.category] || '-'],
    ['Наличие', product.inStock ? 'В наличии' : 'Нет в наличии'],
    ['Цвет/Материал', 'Различные варианты'],
    ['Гарантия', '12 месяцев'],
  ];

  document.getElementById('productDetail').innerHTML = `
    <div class="product-detail__gallery">
      <div class="product-gallery__main">
        ${productSVG(product.color, product.icon)}
      </div>
    </div>
    <div class="product-detail__info">
      ${badgeHTML}
      <h1 class="product-detail__name">${product.fullName}</h1>
      <p class="product-detail__sku">Артикул: MKS-${String(product.id).padStart(5,'0')}</p>
      <div class="product-detail__price">
        <span class="product-detail__price-current">${formatPrice(product.price)}</span>
        ${oldHTML}
        <br>${savingsHTML}
      </div>
      <div class="product-detail__stock">
        <span class="stock-dot${product.inStock ? '' : ' out'}"></span>
        <span>${product.inStock ? 'В наличии' : 'Нет в наличии'}</span>
      </div>
      <div class="product-detail__qty">
        <label>Количество:</label>
        <div class="qty-control">
          <button class="qty-btn" onclick="changeQty(-1)">−</button>
          <input type="number" class="qty-input" id="qtyInput" value="1" min="1" max="99" />
          <button class="qty-btn" onclick="changeQty(1)">+</button>
        </div>
      </div>
      <div class="product-detail__actions">
        <button class="btn btn--blue" onclick="addToCartQty(${product.id})">В корзину</button>
        <button class="btn btn--outline" onclick="toggleFav(${product.id}, this)" id="favBtn">
          ♡ В избранное
        </button>
      </div>
      <div class="product-detail__features">
        <h3>Характеристики</h3>
        <table class="features-table">
          ${features.map(([k,v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}
        </table>
      </div>
      <p class="product-detail__desc">${product.desc}</p>
    </div>
  `;

  // Check fav state
  const favs = JSON.parse(localStorage.getItem('matkasym_favs') || '[]');
  if (favs.includes(product.id)) {
    const fb = document.getElementById('favBtn');
    if (fb) { fb.textContent = '♥ В избранном'; }
  }

  // Related
  const related = PRODUCTS.filter(p => p.category === product.category && p.id !== product.id).slice(0, 4);
  const relEl = document.getElementById('relatedGrid');
  if (relEl && related.length) renderProducts(relEl, related);
});

function changeQty(delta) {
  const input = document.getElementById('qtyInput');
  let v = parseInt(input.value) + delta;
  input.value = Math.max(1, Math.min(99, v));
}

function addToCartQty(productId) {
  const qty = parseInt(document.getElementById('qtyInput').value) || 1;
  for (let i = 0; i < qty; i++) addToCart(productId);
}
