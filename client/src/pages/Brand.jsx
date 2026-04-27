import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getBrand } from '../api/index';
import './Brand.css';

const BRAND_TITLE = {
  'matkasym-home':  'Для дома',
  'matkasym-shaar': 'Для города',
};

export default function Brand() {
  const { brandKey } = useParams();
  const [brand, setBrand] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getBrand(brandKey)
      .then(r => setBrand(r.data))
      .catch(() => setBrand(null))
      .finally(() => setLoading(false));
  }, [brandKey]);

  if (loading) return (
    <div className="spinner-wrap"><div className="spinner" /></div>
  );

  if (!brand) return (
    <div className="container" style={{ padding: '80px 24px', textAlign: 'center' }}>
      <h2>Бренд не найден</h2>
      <Link to="/" className="btn btn-primary" style={{ marginTop: 24 }}>На главную</Link>
    </div>
  );

  const sets = [...(brand.sets || [])].sort((a, b) => a.order - b.order);
  const subKey = brandKey.replace('matkasym-', '');

  return (
    <div>
      {/* Hero */}
      <section className="brand-hero" style={{ '--brand-color': brand.color }}>
        <div className="container brand-hero-inner">
          <div className="brand-hero-accent" />
          <div className="brand-hero-text">
            <img
              src={`/logos/logo-${subKey}-white.png`}
              alt={brand.label}
              className="brand-hero-logo"
            />
            <p className="brand-hero-tagline">{brand.tagline}</p>
            <p className="brand-hero-desc">{brand.desc}</p>
          </div>
        </div>
      </section>

      {/* Sets */}
      <section className="section">
        <div className="container">
          <h2 className="brand-sets-title">{BRAND_TITLE[brandKey] || brand.label}</h2>

          {sets.length > 0 ? (
            <div className="brand-sets-grid">
              {sets.map(s => (
                <div key={s.key} className="set-card">
                  <Link to={`/sets?brand=${brandKey}&set=${s.key}`} className="set-card__img-wrap">
                    {s.image ? (
                      <img src={s.image} alt={s.label} />
                    ) : (
                      <div className="set-card__placeholder">
                        <span>{s.label}</span>
                      </div>
                    )}
                  </Link>
                  <div className="set-card__body">
                    <div className="set-card__meta">
                      <h3 className="set-card__name">{s.label}</h3>
                      {s.labelRu && <p className="set-card__name-ru">{s.labelRu}</p>}
                    </div>
                    <Link
                      to={`/sets?brand=${brandKey}&set=${s.key}`}
                      className="btn btn-primary"
                    >
                      Подробнее
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h2>Скоро</h2>
              <p>Товары появятся в ближайшее время</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
