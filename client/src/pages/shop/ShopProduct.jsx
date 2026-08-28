import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { shopProduct } from './shopApi';
import { setBackButton, setMainButton, isTelegram, haptic } from './useTelegram';
import { photosOf, money, setLabel, stockLabel } from './shopUtils';
import { dimensionLabel } from '../../utils/dimensions';

export default function ShopProduct() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [error, setError] = useState('');
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    shopProduct(id).then(setProduct).catch(e =>
      setError(e.response?.data?.error || 'Товар не открылся'));
  }, [id]);

  useEffect(() => setBackButton(() => navigate('/shop')), [navigate]);

  // Главное действие экрана — родной нижней кнопкой Telegram.
  // Вне Telegram её нет, тогда работает обычная кнопка внизу страницы.
  useEffect(() => {
    if (!product) return;
    return setMainButton({
      text: 'Уточнить наличие',
      onClick: () => { haptic('medium'); navigate(`/shop/p/${id}/request`); },
    });
  }, [product, id, navigate]);

  if (error)   return <p className="shop-empty">{error}</p>;
  if (!product) return <p className="shop-loading">Загружаем…</p>;

  const photos = photosOf(product);
  // «Размеры» из specs почти всегда повторяют dimensions карточки («60*90» и «60x90») —
  // в списке характеристик это выглядит как ошибка, поэтому дубль убираем.
  const sameSize = v => String(v).replace(/[\s*х]/gi, 'x').toLowerCase()
    === String(product.dimensions || '').replace(/[\s*х]/gi, 'x').toLowerCase();
  const specs = (product.specs || [])
    .filter(s => s.key && s.value)
    .filter(s => !(product.dimensions && sameSize(s.value)));

  return (
    <>
      <div
        className="shop-gallery"
        onScroll={e => {
          const w = e.currentTarget.clientWidth || 1;
          setSlide(Math.round(e.currentTarget.scrollLeft / w));
        }}
      >
        {photos.map((src, i) => <img key={i} src={src} alt={`${product.name} — фото ${i + 1}`} />)}
      </div>
      {photos.length > 1 && (
        <div className="shop-dots">
          {photos.map((_, i) => <span key={i} className={`shop-dot ${i === slide ? 'shop-dot--on' : ''}`} />)}
        </div>
      )}

      <div className="shop-detail">
        <h1>{product.fullName || product.name}</h1>
        <div className="shop-detail__price">{money(product.price)}</div>
        <div className="shop-detail__meta">
          {stockLabel(product.stock)}
          {product.set  && ` · ${setLabel(product.set)}`}
          {product.sku  && ` · арт. ${product.sku}`}
        </div>

        {product.description && <p className="shop-descr">{product.description}</p>}

        {(specs.length > 0 || product.dimensions) && (
          <div className="shop-specs">
            {product.dimensions && (
              <div className="shop-spec"><span>{dimensionLabel(product.dimensions)}</span><span>{product.dimensions}</span></div>
            )}
            {specs.map((s, i) => (
              <div className="shop-spec" key={i}><span>{s.key}</span><span>{s.value}</span></div>
            ))}
          </div>
        )}

        {!isTelegram() && (
          <button
            className="shop-submit"
            style={{ width: '100%', marginTop: 20 }}
            onClick={() => navigate(`/shop/p/${id}/request`)}
          >
            Уточнить наличие
          </button>
        )}
      </div>
    </>
  );
}
