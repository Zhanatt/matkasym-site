import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getProducts } from '../api';
import { driveThumb } from '../utils/drive';
import { useCart } from '../context/CartContext';
import './Sets.css';

const SET_INFO = {
  'taza-kiym': {
    name: 'TAZA KIYM',
    nameRu: 'Таза кийим',
    desc: 'Готовые решения для стирки и хранения одежды',
    levels: [
      { key: 'standard', label: 'Стандарт', color: '#555', products: ['Comfort', 'Washday', 'Eco', 'Enigma'] },
      { key: 'vip',      label: 'VIP',      color: '#0058A3', products: ['Sakura', 'Avangard', 'Washday', 'Infinity', 'Sakura (доска)'] },
      { key: 'premium',  label: 'Premium',  color: '#8B1A1A', products: ['Keremet', 'Fenix', 'Muras', 'Sanira S', 'Washday'] },
    ],
    colors: ['white', 'black'],
  },
};

const COLOR_LABELS = { white: 'Белый', black: 'Чёрный', grey: 'Серый' };
const LEVEL_COLORS = { standard: '#555', vip: '#0058A3', premium: '#8B1A1A' };

export default function Sets() {
  const [products, setProducts] = useState([]);
  const [level, setLevel]       = useState('');
  const [color, setColor]       = useState('');
  const { addItem, items } = useCart();

  useEffect(() => {
    const params = { set: 'taza-kiym', limit: 50 };
    if (level) params.setLevel = level;
    if (color) params.color = color;
    getProducts(params).then(r => setProducts(r.data.products)).catch(() => {});
  }, [level, color]);

  // Group by category for display
  const byCategory = products.reduce((acc, p) => {
    const cat = p.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});

  const catLabels = {
    'clothes-dryer': 'Сушилка для белья',
    'laundry-basket': 'Корзина для белья',
    'ironing-board': 'Гладильная доска',
    'wardrobe-rack': 'Гардеробная вешалка',
    'coat-hanger': 'Костюмная вешалка',
  };
  const catOrder = ['clothes-dryer', 'laundry-basket', 'ironing-board', 'wardrobe-rack', 'coat-hanger'];

  return (
    <div className="sets-page">
      {/* Hero */}
      <div className="sets-hero">
        <div className="container">
          <p className="sets-brand">MATKASYM HOME</p>
          <h1>TAZA KIYM</h1>
          <p className="sets-tagline">Сиздин үйүңүзгө даяр чечимдер — Готовые решения для вашего дома</p>
        </div>
      </div>

      <div className="container sets-body">
        {/* Level selector */}
        <div className="sets-filters">
          <div className="filter-group">
            <span>Уровень:</span>
            {[
              { key: '', label: 'Все' },
              { key: 'standard', label: 'Стандарт' },
              { key: 'vip', label: 'VIP' },
              { key: 'premium', label: 'Premium' },
            ].map(l => (
              <button
                key={l.key}
                className={`level-btn ${level === l.key ? 'active' : ''}`}
                style={level === l.key && l.key ? { background: LEVEL_COLORS[l.key], color: '#fff', borderColor: LEVEL_COLORS[l.key] } : {}}
                onClick={() => setLevel(l.key)}
              >{l.label}</button>
            ))}
          </div>

          <div className="filter-group">
            <span>Цвет:</span>
            {[
              { key: '', label: 'Все' },
              { key: 'white', label: 'Белый' },
              { key: 'black', label: 'Чёрный' },
              { key: 'grey',  label: 'Серый'  },
            ].map(c => (
              <button
                key={c.key}
                className={`color-btn ${color === c.key ? 'active' : ''}`}
                onClick={() => setColor(c.key)}
              >
                {c.key && <span className="color-dot" style={{ background: c.key === 'white' ? '#eee' : c.key === 'black' ? '#111' : '#888', border: '1px solid #ccc' }} />}
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Products by category */}
        {catOrder.map(cat => {
          const prods = byCategory[cat];
          if (!prods?.length) return null;
          return (
            <div key={cat} className="set-category">
              <h2 className="set-cat-title">{catLabels[cat] || cat}</h2>
              <div className="set-products">
                {prods.map(p => {
                  const inCart = items.some(i => i.product === p._id);
                  const lvl = p.setLevel;
                  return (
                    <div key={p._id} className="set-card">
                      {lvl && (
                        <div className="set-card-level" style={{ background: LEVEL_COLORS[lvl] || '#555' }}>
                          {lvl.toUpperCase()}
                        </div>
                      )}
                      <Link to={`/product/${p._id}`} className="set-card-img">
                        {p.driveImages?.[0]
                          ? <img src={driveThumb(p.driveImages[0])} alt={p.name} loading="lazy" />
                          : <div className="set-card-no-img">📦</div>
                        }
                      </Link>
                      <div className="set-card-body">
                        <Link to={`/product/${p._id}`} className="set-card-name">{p.fullName}</Link>
                        {p.color && <span className="set-card-color">{COLOR_LABELS[p.color] || p.color}</span>}
                        <div className="set-card-footer">
                          <span className="set-card-price">{p.price.toLocaleString('ru')} сом</span>
                          <button
                            className={`btn btn-sm ${inCart ? 'btn-outline' : 'btn-primary'}`}
                            onClick={() => !inCart && addItem(p)}
                          >
                            {inCart ? '✓' : '+'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
