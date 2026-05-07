import { useState, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { driveThumb, cloudinaryOpt } from '../utils/drive';
import './ProductCard.css';

function getImages(product) {
  if (product.images?.length)      return product.images;
  if (product.driveImages?.length) return product.driveImages.map(id => driveThumb(id));
  return [];
}

function imgSrc(url, width = 600) {
  return url.includes('cloudinary.com') ? cloudinaryOpt(url, width) : url;
}

export default function ProductCard({ product }) {
  const { addItem, items } = useCart();
  const navigate = useNavigate();
  const inCart   = items.some(i => i.product === product._id);
  const images   = getImages(product);
  const isPlanned      = product.productStatus === 'planned';
  const isLiquidation  = product.productStatus === 'liquidation';

  const [activeIdx, setActiveIdx] = useState(0);
  const intervalRef = useRef(null);

  const startSlider = useCallback(() => {
    if (images.length < 2) return;
    setActiveIdx(1);
    intervalRef.current = setInterval(() => {
      setActiveIdx(i => (i + 1) % images.length);
    }, 1400);
  }, [images.length]);

  const stopSlider = useCallback(() => {
    clearInterval(intervalRef.current);
    setActiveIdx(0);
  }, []);

  const discount = product.oldPrice > 0
    ? Math.round(((product.oldPrice - product.price) / product.oldPrice) * 100)
    : 0;

  return (
    <div className={`pc${isPlanned ? ' pc--planned' : ''}${isLiquidation ? ' pc--liquidation' : ''}`} onMouseEnter={startSlider} onMouseLeave={stopSlider}>

      {/* Image */}
      <Link to={`/product/${product._id}`} className="pc__img-wrap">
        {images.length > 0 ? (
          images.map((url, i) => (
            <img
              key={url}
              src={imgSrc(url)}
              alt={product.name}
              loading="lazy"
              className={`pc__slide ${i === activeIdx ? 'visible' : ''}${isPlanned ? ' pc__slide--blurred' : ''}`}
            />
          ))
        ) : (
          <div className={`pc__no-img${isPlanned ? ' pc__slide--blurred' : ''}`}>📦</div>
        )}

        {isPlanned      && <span className="pc__badge-planned">В ПЛАНЕ</span>}
        {isLiquidation  && <span className="pc__badge-liquidation">ЛИКВИДАЦИЯ</span>}
        {!isPlanned && !isLiquidation && product.isNew && <span className="pc__badge-new">Новинка</span>}

        {images.length > 1 && (
          <div className="pc__dots">
            {images.map((_, i) => (
              <span key={i} className={`pc__dot ${i === activeIdx ? 'active' : ''}`} />
            ))}
          </div>
        )}
      </Link>

      {/* Text */}
      <div className="pc__body">
        <Link to={`/product/${product._id}`} className="pc__name">{product.fullName}</Link>
        {product.set && <p className="pc__sub">{product.set.toUpperCase()} {product.setLevel && `· ${product.setLevel}`}</p>}

        <div className="pc__pricing">
          {discount > 0 ? (
            <>
              <span className="pc__old-price">{product.oldPrice.toLocaleString('ru')} сом</span>
              <div className="pc__price-row">
                <span className="pc__price pc__price--sale">{product.price.toLocaleString('ru')} сом</span>
                <span className="pc__discount">−{discount}%</span>
              </div>
            </>
          ) : (
            <span className="pc__price">{product.price.toLocaleString('ru')} сом</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="pc__actions">
        <button
          className="pc__action-btn pc__action-btn--outline"
          onClick={() => navigate(`/product/${product._id}`)}
          title="Смотреть товар"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </button>

        <button
          className={`pc__action-btn pc__action-btn--fill ${inCart ? 'in-cart' : ''}`}
          onClick={() => !inCart && addItem(product)}
          title={inCart ? 'Уже в корзине' : 'В корзину'}
        >
          {inCart ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
            </svg>
          )}
        </button>
      </div>

    </div>
  );
}
