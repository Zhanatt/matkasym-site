// ================================
// МАТКАСЫМ — Home Page JS
// ================================

document.addEventListener('DOMContentLoaded', () => {
  // Featured: popular products
  const featured = PRODUCTS.filter(p => p.tags.includes('popular')).slice(0, 8);
  const featuredEl = document.getElementById('featuredProducts');
  if (featuredEl) renderProducts(featuredEl, featured);

  // New arrivals
  const newItems = PRODUCTS.filter(p => p.isNew || p.tags.includes('new')).slice(0, 4);
  const newEl = document.getElementById('newProducts');
  if (newEl) renderProducts(newEl, newItems);
});
