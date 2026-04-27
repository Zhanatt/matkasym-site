import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getProducts, getBrands } from '../api/index';
import ProductCard from '../components/ProductCard';
import './Home.css';

const HOME_SETS = [
  { key: 'taza-kiym',    label: 'TAZA KIYM',    desc: 'Комплект для стирки' },
  { key: 'kosh-kelniz',  label: 'KOSH KELNIZ',  desc: 'Гардеробная система' },
  { key: 'achyk-asman',  label: 'ACHYK ASMAN',  desc: 'Открытое хранение' },
  { key: 'den-sooluk',   label: 'DEN SOOLUK',   desc: 'Здоровый образ жизни' },
];

export default function Home() {
  const [products, setProducts] = useState([]);
  const [brands, setBrands] = useState([]);

  useEffect(() => {
    getProducts({ limit: 8, sort: 'rating' })
      .then(r => setProducts(r.data.products))
      .catch(() => {});
    getBrands()
      .then(r => setBrands(r.data))
      .catch(() => {});
  }, []);

  return (
    <div>
      {/* ── Hero ─────────────────────────────── */}
      <section className="home-hero">
        <div className="container home-hero-inner">
          <div className="home-hero-text">
            <p className="home-hero-label">Первый завод в Кыргызстане международного уровня</p>
            <h1 className="home-hero-title">
              Мебель,<br/>которая<br/><span>служит вам.</span>
            </h1>
            <p className="home-hero-sub">
              Три бренда. Один стандарт качества.
            </p>
            <div className="home-hero-actions">
              <Link to="/catalog" className="btn btn-primary btn-lg">Весь каталог</Link>
              <Link to="/brand/matkasym-home" className="btn btn-outline btn-lg">M·HOME</Link>
            </div>
          </div>
          <div className="home-hero-badge">
            <img src="/logos/logo-vertical.png" alt="" aria-hidden="true" />
          </div>
        </div>
      </section>

      {/* ── Brands ───────────────────────────── */}
      <section className="section">
        <div className="container">
          <p className="section-label">Наши бренды</p>
          <h2 className="section-title">Три направления</h2>
          <div className="brands-grid">
            {brands.map(b => (
              <Link key={b.key} to={`/brand/${b.key}`} className="brand-card">
                <div className="brand-card__accent" style={{ background: b.color }} />
                <div className="brand-card__body">
                  <img
                    src={`/logos/logo-${b.key.replace('matkasym-', '')}-dark.png`}
                    alt={b.label}
                    className="brand-card__logo"
                  />
                  <p className="brand-card__desc">{b.desc}</p>
                  <span className="brand-card__link">Смотреть →</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── TAZA KIYM feature ────────────────── */}
      <section className="home-feature">
        <div className="container home-feature-inner">
          <div className="home-feature-text">
            <p className="section-label">M·HOME / Флагманский сет</p>
            <h2 className="section-title">TAZA KIYM</h2>
            <p className="home-feature-desc">
              Полный комплект для ухода за одеждой: сушилка, корзина для белья,
              гладильная доска и гардеробная вешалка. Три уровня комплектации —
              Standard, VIP, Premium.
            </p>
            <div className="home-feature-sets">
              {HOME_SETS.map(s => (
                <Link
                  key={s.key}
                  to={`/sets?brand=matkasym-home&set=${s.key}`}
                  className="set-chip"
                >
                  <strong>{s.label}</strong>
                  <span>{s.desc}</span>
                </Link>
              ))}
            </div>
            <Link to="/sets?brand=matkasym-home&set=taza-kiym" className="btn btn-primary">
              Выбрать комплект
            </Link>
          </div>
          <div className="home-feature-visual">
            <div className="home-feature-placeholder">
              <p>TAZA KIYM</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Popular products ─────────────────── */}
      {products.length > 0 && (
        <section className="section">
          <div className="container">
            <div className="section-head">
              <div>
                <p className="section-label">Каталог</p>
                <h2 className="section-title">Популярные товары</h2>
              </div>
              <Link to="/catalog" className="btn btn-ghost">Все товары →</Link>
            </div>
            <div className="product-grid">
              {products.map(p => <ProductCard key={p._id} product={p} />)}
            </div>
          </div>
        </section>
      )}

      {/* ── CTA strip ────────────────────────── */}
      <section className="home-cta">
        <div className="container home-cta-inner">
          <div>
            <h2>Бишкек, ул. Маева, Тепличный 1/2</h2>
            <p>Приходите в шоурум или звоните: +996 500 001 652</p>
          </div>
          <div className="home-cta-actions">
            <a href="tel:+996500001652" className="btn btn-primary">Позвонить</a>
            <a href="https://instagram.com/matkasym_official" target="_blank" rel="noreferrer" className="btn btn-outline">Instagram</a>
          </div>
        </div>
      </section>
    </div>
  );
}
