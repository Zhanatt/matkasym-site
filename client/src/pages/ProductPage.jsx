import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getProduct } from '../api';
import { useCart } from '../context/CartContext';
import { driveThumb, cloudinaryOpt } from '../utils/drive';
import './ProductPage.css';

function getImages(product) {
  if (product.images?.length)      return product.images;
  if (product.driveImages?.length) return product.driveImages.map(id => driveThumb(id, 800));
  return [];
}

function imgSrc(url, width = 800) {
  return url.includes('cloudinary.com') ? cloudinaryOpt(url, width) : url;
}

export default function ProductPage() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [qty,     setQty]     = useState(1);
  const [loading, setLoading] = useState(true);
  const [active,  setActive]  = useState(0);
  const { addItem, items } = useCart();
  const inCart = items.some(i => i.product === id);

  useEffect(() => {
    setLoading(true);
    setActive(0);
    getProduct(id)
      .then(r => setProduct(r.data))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="spinner-wrap"><div className="spinner" /></div>;
  if (!product) return <div className="container"><p>Товар не найден.</p></div>;

  const images = getImages(product);

  const prev = () => setActive(i => (i - 1 + images.length) % images.length);
  const next = () => setActive(i => (i + 1) % images.length);

  return (
    <div className="container product-page">
      <div className="breadcrumb">
        <Link to="/">Главная</Link> / <Link to="/catalog">Каталог</Link> / {product.name}
      </div>

      <div className="product-layout">

        {/* ── Gallery ── */}
        <div className="product-gallery">
          {/* Thumbnails */}
          {images.length > 1 && (
            <div className="product-thumbs">
              {images.map((url, i) => (
                <button
                  key={i}
                  className={`product-thumb ${i === active ? 'active' : ''}`}
                  onClick={() => setActive(i)}
                >
                  <img src={imgSrc(url, 120)} alt="" />
                </button>
              ))}
            </div>
          )}

          {/* Main image */}
          <div className="product-main-img">
            {images.length > 0 ? (
              <>
                {images.map((url, i) => (
                  <img
                    key={i}
                    src={imgSrc(url)}
                    alt={product.name}
                    className={`product-slide ${i === active ? 'visible' : ''}`}
                  />
                ))}

                {images.length > 1 && (
                  <>
                    <button className="product-slide-btn prev" onClick={prev} aria-label="Назад">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6"/></svg>
                    </button>
                    <button className="product-slide-btn next" onClick={next} aria-label="Вперёд">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6"/></svg>
                    </button>

                    <div className="product-slide-dots">
                      {images.map((_, i) => (
                        <button
                          key={i}
                          className={`product-slide-dot ${i === active ? 'active' : ''}`}
                          onClick={() => setActive(i)}
                        />
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="product-no-img">📦</div>
            )}
          </div>
        </div>

        {/* ── Info ── */}
        <div className="product-info">
          <p className="product-brand-label">
            {product.brand?.replace('matkasym-', '').toUpperCase()}
            {product.set && ` · ${product.set.toUpperCase()}`}
          </p>

          <h1 className="product-title">{product.fullName}</h1>

          <div className="product-meta">
            {product.rating > 0 && (
              <span className="product-rating">★ {product.rating} ({product.reviewCount} отзывов)</span>
            )}
            <span className={`product-stock ${product.inStock ? 'in-stock' : 'out-of-stock'}`}>
              {product.inStock ? '✓ В наличии' : '✗ Нет в наличии'}
            </span>
          </div>

          <div className="product-price">
            {product.price.toLocaleString('ru')} сом
            {product.oldPrice > 0 && (
              <span className="product-old-price">{product.oldPrice.toLocaleString('ru')} сом</span>
            )}
          </div>

          {product.description && (
            <p className="product-desc">{product.description}</p>
          )}

          {product.tags?.length > 0 && (
            <div className="product-tags">
              {product.tags.map(t => <span key={t} className="tag">{t}</span>)}
            </div>
          )}

          <div className="product-actions">
            <div className="qty-control">
              <button onClick={() => setQty(q => Math.max(1, q - 1))}>−</button>
              <span>{qty}</span>
              <button onClick={() => setQty(q => q + 1)}>+</button>
            </div>
            <button
              className={`btn btn-full ${inCart ? 'btn-outline' : 'btn-primary'}`}
              disabled={!product.inStock}
              onClick={() => !inCart && addItem(product, qty)}
            >
              {inCart ? '✓ Уже в корзине' : '+ В корзину'}
            </button>
          </div>

          <Link to="/cart" className="btn btn-outline-dark btn-full" style={{ marginTop: 10 }}>
            Перейти в корзину →
          </Link>

          {/* Characteristics table */}
          {(product.dimensions || product.specs?.some(s => s.value)) && (
            <div className="product-specs">
              <h3 className="product-specs-title">Характеристики</h3>
              <table className="product-specs-table">
                <tbody>
                  {product.dimensions && (
                    <tr>
                      <td>Габариты (ДxШxВ)</td>
                      <td>{product.dimensions}</td>
                    </tr>
                  )}
                  {product.specs?.filter(s => s.value).map(s => (
                    <tr key={s.key}>
                      <td>{s.key}</td>
                      <td>{s.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
