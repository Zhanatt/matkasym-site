// ================================
// МАТКАСЫМ — Cart Logic
// ================================

let cart = JSON.parse(localStorage.getItem('matkasym_cart') || '[]');
let favorites = JSON.parse(localStorage.getItem('matkasym_favs') || '[]');

function saveCart() {
  localStorage.setItem('matkasym_cart', JSON.stringify(cart));
  updateCartBadge();
}
function saveFavs() {
  localStorage.setItem('matkasym_favs', JSON.stringify(favorites));
}

function updateCartBadge() {
  const total = cart.reduce((s, i) => s + i.qty, 0);
  document.querySelectorAll('#cartBadge, .cart-badge').forEach(el => {
    el.textContent = total;
    el.classList.toggle('visible', total > 0);
  });
}

function addToCart(productId) {
  const product = PRODUCTS.find(p => p.id === productId);
  if (!product) return;
  const existing = cart.find(i => i.id === productId);
  if (existing) {
    existing.qty++;
  } else {
    cart.push({ id: productId, qty: 1 });
  }
  saveCart();
  showToast(`«${product.name}» добавлен в корзину`);
}

function removeFromCart(productId) {
  cart = cart.filter(i => i.id !== productId);
  saveCart();
}

function updateQty(productId, delta) {
  const item = cart.find(i => i.id === productId);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) removeFromCart(productId);
  else saveCart();
}

function getCartTotal() {
  return cart.reduce((sum, item) => {
    const p = PRODUCTS.find(pr => pr.id === item.id);
    return sum + (p ? p.price * item.qty : 0);
  }, 0);
}

function toggleFav(productId, btn) {
  const idx = favorites.indexOf(productId);
  if (idx === -1) {
    favorites.push(productId);
    btn && btn.classList.add('active');
    showToast('Добавлено в избранное');
  } else {
    favorites.splice(idx, 1);
    btn && btn.classList.remove('active');
    showToast('Удалено из избранного');
  }
  saveFavs();
}

function showToast(message) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  updateCartBadge();
  // Mark existing favs
  document.querySelectorAll('.product-card__btn-fav').forEach(btn => {
    const card = btn.closest('.product-card');
    if (card) {
      const id = parseInt(card.dataset.id);
      if (favorites.includes(id)) btn.classList.add('active');
    }
  });
});
