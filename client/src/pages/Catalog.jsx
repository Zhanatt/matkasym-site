import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getProducts } from '../api';
import ProductCard from '../components/ProductCard';
import './Catalog.css';

const CATEGORY_LABELS = {
  'laundry-basket': 'Корзины для белья',
  'clothes-dryer':  'Сушилки для белья',
  'ironing-board':  'Гладильные доски',
  'wardrobe-rack':  'Гардеробные вешалки',
  'coat-hanger':    'Костюмные вешалки',
  'accessories':    'Аксессуары',
};

const SORTS = [
  { value: 'newest',     label: 'Новинки' },
  { value: 'price_asc',  label: 'Цена: по возрастанию' },
  { value: 'price_desc', label: 'Цена: по убыванию' },
  { value: 'rating',     label: 'По рейтингу' },
];

export default function Catalog() {
  const [params, setParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(true);

  const category = params.get('category') || '';
  const sort     = params.get('sort')     || 'newest';
  const search   = params.get('search')   || '';

  useEffect(() => {
    setLoading(true);
    getProducts({ category, sort, search, limit: 50 })
      .then(r => { setProducts(r.data.products); setTotal(r.data.total); })
      .finally(() => setLoading(false));
  }, [category, sort, search]);

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next);
  };

  return (
    <div className="container catalog-page">
      <div className="catalog-top">
        <h1 className="page-title">
          {category ? CATEGORY_LABELS[category] : 'Весь каталог'}
          <span className="total-count">{total} товаров</span>
        </h1>

        <div className="catalog-controls">
          <input
            className="search-input"
            placeholder="Поиск товаров..."
            value={search}
            onChange={e => setFilter('search', e.target.value)}
          />
          <select value={sort} onChange={e => setFilter('sort', e.target.value)}>
            {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      <div className="catalog-layout">
        {/* Sidebar */}
        <aside className="sidebar">
          <h3>Категории</h3>
          <ul className="cat-list">
            <li>
              <button
                className={!category ? 'active' : ''}
                onClick={() => setFilter('category', '')}
              >Все товары</button>
            </li>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <li key={key}>
                <button
                  className={category === key ? 'active' : ''}
                  onClick={() => setFilter('category', key)}
                >{label}</button>
              </li>
            ))}
          </ul>
        </aside>

        {/* Grid */}
        <div className="catalog-main">
          {loading ? (
            <div className="spinner-wrap"><div className="spinner" /></div>
          ) : products.length === 0 ? (
            <div className="empty-state">
              <h2>Товары не найдены</h2>
              <p>Попробуйте изменить фильтры</p>
            </div>
          ) : (
            <div className="product-grid">
              {products.map(p => <ProductCard key={p._id} product={p} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
