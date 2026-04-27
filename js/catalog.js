// ================================
// МАТКАСЫМ — Catalog JS
// ================================

let currentCat = '';
let currentTags = [];
let priceMin = 0;
let priceMax = Infinity;
let sortBy = 'default';
let searchQ = '';

const catNames = {
  living: 'Гостиная', bedroom: 'Спальня', kitchen: 'Кухня',
  bathroom: 'Ванная', kids: 'Детская', office: 'Кабинет',
  storage: 'Хранение', decor: 'Декор', sale: 'Акции'
};

document.addEventListener('DOMContentLoaded', () => {
  // Read URL params
  const params = new URLSearchParams(location.search);
  currentCat = params.get('cat') || '';
  searchQ    = params.get('q') || '';
  const sort = params.get('sort');
  if (sort === 'new') currentTags = ['new'];

  // Set active category radio
  document.querySelectorAll('input[name="cat"]').forEach(r => {
    r.checked = (r.value === currentCat);
    r.addEventListener('change', () => { currentCat = r.value; applyFilters(); });
  });

  // Breadcrumb
  const bc = document.getElementById('breadCrumbCat');
  if (bc && currentCat) bc.textContent = catNames[currentCat] || 'Каталог';

  // Tag checkboxes
  document.querySelectorAll('input[name="tag"]').forEach(cb => {
    cb.checked = currentTags.includes(cb.value);
    cb.addEventListener('change', () => {
      if (cb.checked) currentTags.push(cb.value);
      else currentTags = currentTags.filter(t => t !== cb.value);
      applyFilters();
    });
  });

  // Price filter
  document.getElementById('applyPrice').addEventListener('click', () => {
    const mn = document.getElementById('priceMin').value;
    const mx = document.getElementById('priceMax').value;
    priceMin = mn ? parseInt(mn) : 0;
    priceMax = mx ? parseInt(mx) : Infinity;
    applyFilters();
  });

  // Sort
  document.getElementById('sortSelect').addEventListener('change', e => {
    sortBy = e.target.value;
    applyFilters();
  });

  // Search
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.value = searchQ;
    searchInput.addEventListener('input', e => { searchQ = e.target.value; applyFilters(); });
  }

  // Reset
  document.getElementById('resetFilters').addEventListener('click', resetFilters);

  applyFilters();
});

function applyFilters() {
  let result = [...PRODUCTS];

  if (currentCat === 'sale') {
    result = result.filter(p => p.tags.includes('sale'));
  } else if (currentCat) {
    result = result.filter(p => p.category === currentCat);
  }

  if (currentTags.length) {
    result = result.filter(p => currentTags.every(t => p.tags.includes(t) || (t === 'new' && p.isNew)));
  }

  result = result.filter(p => p.price >= priceMin && p.price <= priceMax);

  if (searchQ.trim()) {
    const q = searchQ.toLowerCase();
    result = result.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.fullName.toLowerCase().includes(q) ||
      p.desc.toLowerCase().includes(q)
    );
  }

  switch (sortBy) {
    case 'price-asc':  result.sort((a,b) => a.price - b.price); break;
    case 'price-desc': result.sort((a,b) => b.price - a.price); break;
    case 'name':       result.sort((a,b) => a.name.localeCompare(b.name, 'ru')); break;
  }

  const grid  = document.getElementById('catalogGrid');
  const empty = document.getElementById('emptyState');
  const count = document.getElementById('resultsCount');

  if (result.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    count.textContent = 'Нет результатов';
  } else {
    empty.style.display = 'none';
    renderProducts(grid, result);
    count.textContent = `Показано товаров: ${result.length}`;
  }
}

function resetFilters() {
  currentCat = ''; currentTags = [];
  priceMin = 0; priceMax = Infinity; searchQ = '';
  sortBy = 'default';
  document.querySelectorAll('input[name="cat"]').forEach(r => r.checked = r.value === '');
  document.querySelectorAll('input[name="tag"]').forEach(cb => cb.checked = false);
  document.getElementById('priceMin').value = '';
  document.getElementById('priceMax').value = '';
  document.getElementById('sortSelect').value = 'default';
  const si = document.getElementById('searchInput');
  if (si) si.value = '';
  applyFilters();
}
