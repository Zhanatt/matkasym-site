// ================================
// МАТКАСЫМ — Main JS
// ================================

document.addEventListener('DOMContentLoaded', () => {
  initMobileMenu();
  initStickyHeader();
});

function initMobileMenu() {
  const burger  = document.getElementById('burgerBtn');
  const menu    = document.getElementById('mobileMenu');
  const close   = document.getElementById('mobileClose');
  const overlay = document.getElementById('overlay');
  if (!burger || !menu) return;

  const open  = () => { menu.classList.add('open'); overlay.classList.add('active'); document.body.style.overflow = 'hidden'; };
  const shut  = () => { menu.classList.remove('open'); overlay.classList.remove('active'); document.body.style.overflow = ''; };

  burger.addEventListener('click', open);
  close && close.addEventListener('click', shut);
  overlay.addEventListener('click', shut);
}

function initStickyHeader() {
  const header = document.getElementById('header');
  if (!header) return;
  window.addEventListener('scroll', () => {
    header.style.boxShadow = window.scrollY > 10
      ? '0 2px 16px rgba(0,0,0,.12)'
      : '0 1px 6px rgba(0,0,0,.07)';
  }, { passive: true });
}

// Reusable catalog filter + render
function renderProducts(containerEl, products) {
  containerEl.innerHTML = products.map(p => createProductCard(p)).join('');
  updateFavButtons();
}

function updateFavButtons() {
  const favs = JSON.parse(localStorage.getItem('matkasym_favs') || '[]');
  document.querySelectorAll('.product-card').forEach(card => {
    const id = parseInt(card.dataset.id);
    const btn = card.querySelector('.product-card__btn-fav');
    if (btn && favs.includes(id)) btn.classList.add('active');
  });
}
