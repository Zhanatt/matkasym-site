import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { shopFilters, shopProducts } from './shopApi';
import { hideBackButton, haptic } from './useTelegram';
import { photoOf, money, setLabel, stockLabel } from './shopUtils';

const PAGE_SIZE = 24;

export default function ShopCatalog() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ sets: [], total: 0 });
  const [set, setSet]         = useState('');
  const [search, setSearch]   = useState('');
  const [items, setItems]     = useState([]);
  const [page, setPage]       = useState(1);
  const [pages, setPages]     = useState(1);
  const [loading, setLoading] = useState(true);

  // Экран верхнего уровня — системная «назад» здесь только сбивает: ей некуда вести
  useEffect(() => { hideBackButton(); }, []);
  useEffect(() => { shopFilters().then(setFilters).catch(() => {}); }, []);

  // Поиск набирают по букве — ждём паузу, иначе на каждый символ уходит запрос
  const debounce = useRef();
  const [query, setQuery] = useState('');
  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(debounce.current);
  }, [search]);

  // Смена фильтра — это новая выдача, страницы начинаем заново
  useEffect(() => { setPage(1); }, [query, set]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    shopProducts({ page, limit: PAGE_SIZE, ...(set && { set }), ...(query && { search: query }) })
      .then(d => {
        if (cancelled) return;
        // Первая страница заменяет список, следующие — дописывают
        setItems(prev => (page === 1 ? d.items : [...prev, ...d.items]));
        setPages(d.pages);
      })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [page, query, set]);

  const openProduct = p => {
    haptic('light');
    navigate(`/shop/p/${p._id}`);
  };

  return (
    <>
      <header className="shop-head">
        <div className="shop-head__row">
          <div className="shop-brand">
            <span>MATKASYM</span>
            <small>товары для дома</small>
          </div>
          <button className="shop-mine" onClick={() => navigate('/shop/my')}>Мои заявки</button>
        </div>

        <input
          className="shop-search"
          placeholder="Поиск: сушилка, вешалка, артикул…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <div className="shop-chips">
          <button
            className={`shop-chip ${set === '' ? 'shop-chip--on' : ''}`}
            onClick={() => { haptic('light'); setSet(''); }}
          >
            Всё<small>{filters.total}</small>
          </button>
          {filters.sets.map(s => (
            <button
              key={s.key}
              className={`shop-chip ${set === s.key ? 'shop-chip--on' : ''}`}
              onClick={() => { haptic('light'); setSet(set === s.key ? '' : s.key); }}
            >
              {setLabel(s.key)}<small>{s.count}</small>
            </button>
          ))}
        </div>
      </header>

      {loading && page === 1 ? (
        <p className="shop-loading">Загружаем товары…</p>
      ) : items.length === 0 ? (
        <p className="shop-empty">
          Ничего не нашли.<br />Попробуйте другое слово или выберите набор выше.
        </p>
      ) : (
        <>
          <div className="shop-grid">
            {items.map(p => (
              <article key={p._id} className="shop-card" onClick={() => openProduct(p)}>
                <div className="shop-card__photo">
                  <img src={photoOf(p)} alt={p.name} loading="lazy" />
                  {p.stock <= 3 && <span className="shop-badge">Осталось {p.stock}</span>}
                </div>
                <div className="shop-card__body">
                  <div className="shop-card__name">{p.fullName || p.name}</div>
                  <div className="shop-card__price">{money(p.price)}</div>
                  <div className="shop-card__stock">{stockLabel(p.stock)}</div>
                </div>
              </article>
            ))}
          </div>

          {page < pages && (
            <button className="shop-more" disabled={loading} onClick={() => setPage(p => p + 1)}>
              {loading ? 'Загружаем…' : 'Показать ещё'}
            </button>
          )}
        </>
      )}
    </>
  );
}
