import { useState, useEffect } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useVoiceSearch } from '../hooks/useVoiceSearch';
import './Header.css';

const NAV = [
  { to: '/brand/matkasym-home',  label: 'Для дома'  },
  { to: '/brand/matkasym-shaar', label: 'Для города' },
  { to: '/catalog',              label: 'Каталог'    },
];

export default function Header() {
  const { user, logout } = useAuth();
  const { count } = useCart();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen]     = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery]           = useState('');

  /* ── Голосовой поиск ── */
  const { listening, error: voiceError, isSupported, start: startVoice } = useVoiceSearch({
    lang: 'ru-RU',
    onResult: (transcript) => {
      setQuery(transcript);
      // Небольшая задержка — чтобы пользователь увидел текст перед поиском
      setTimeout(() => {
        navigate(`/catalog?search=${encodeURIComponent(transcript)}`);
        setQuery('');
        setSearchOpen(false);
      }, 600);
    },
  });

  // Открываем поиск автоматически при нажатии на микрофон
  const handleVoiceClick = () => {
    if (!searchOpen) setSearchOpen(true);
    startVoice();
  };

  // Закрываем voiceError через 3 сек
  useEffect(() => {
    if (!voiceError) return;
    const t = setTimeout(() => {}, 3000);
    return () => clearTimeout(t);
  }, [voiceError]);

  const handleSearch = (e) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    navigate(`/catalog?search=${encodeURIComponent(q)}`);
    setQuery('');
    setSearchOpen(false);
  };

  return (
    <header className="header">
      {/* Top bar */}
      <div className="header-top">
        <div className="container header-top-inner">
          <span>📍 Бишкек, ул. Маева, Тепличный 1/2</span>
          <span>+996 500 001 652</span>
        </div>
      </div>

      {/* Main header */}
      <div className="header-main">
        <div className="container header-inner">
          {/* Logo */}
          <Link to="/" className="logo">
            <img src="/logos/logo-main.png" alt="MATKASYM" className="logo-img" />
          </Link>

          {/* Nav */}
          <nav className={`nav ${menuOpen ? 'open' : ''}`}>
            {NAV.map(n => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
                onClick={() => setMenuOpen(false)}
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          {/* Actions */}
          <div className="header-actions">

            {/* Search form */}
            <form
              className={`header-search ${searchOpen ? 'open' : ''}`}
              onSubmit={handleSearch}
            >
              <input
                className="header-search__input"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={listening ? '🎙 Говорите...' : 'Поиск товаров...'}
                autoFocus={searchOpen}
              />

              {/* Кнопка микрофона — только если браузер поддерживает */}
              {isSupported && (
                <button
                  type="button"
                  className={`header-search__mic ${listening ? 'listening' : ''}`}
                  onClick={handleVoiceClick}
                  title={listening ? 'Остановить' : 'Голосовой поиск'}
                  aria-label="Голосовой поиск"
                >
                  {listening ? (
                    /* Анимированный микрофон — пульсирует */
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="9" y="2" width="6" height="12" rx="3"/>
                      <path d="M5 10a7 7 0 0 0 14 0" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>
                      <line x1="12" y1="19" x2="12" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      <line x1="8"  y1="22" x2="16" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <rect x="9" y="2" width="6" height="12" rx="3"/>
                      <path d="M5 10a7 7 0 0 0 14 0"/>
                      <line x1="12" y1="19" x2="12" y2="22"/>
                      <line x1="8"  y1="22" x2="16" y2="22"/>
                    </svg>
                  )}
                </button>
              )}

              <button type="submit" className="header-search__submit" aria-label="Найти">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
              </button>
            </form>

            {/* Иконка открытия поиска */}
            <button
              className="icon-btn"
              title="Поиск"
              aria-label="Поиск"
              onClick={() => setSearchOpen(o => !o)}
            >
              {searchOpen ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6 6 18M6 6l12 12"/>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
              )}
            </button>

            <Link to="/favorites" className="icon-btn" title="Избранное" aria-label="Избранное">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
            </Link>

            <Link to="/cart" className="icon-btn cart-icon" title="Корзина" aria-label="Корзина">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
              </svg>
              {count > 0 && <span className="cart-badge">{count}</span>}
            </Link>

            {user ? (
              <div className="user-menu">
                <Link to="/orders" className="user-name">{user.name.split(' ')[0]}</Link>
                <button onClick={() => { logout(); navigate('/'); }} className="btn btn-outline-dark btn-sm">Выйти</button>
              </div>
            ) : (
              <Link to="/login" className="btn btn-dark btn-sm">Войти</Link>
            )}

            <button className="burger" onClick={() => setMenuOpen(o => !o)} aria-label="Меню">
              <span /><span /><span />
            </button>
          </div>
        </div>
      </div>

      {/* Голосовые подсказки */}
      {voiceError && (
        <div className="voice-toast voice-toast--error">
          🎙 {voiceError}
        </div>
      )}
      {listening && (
        <div className="voice-toast voice-toast--listening">
          🎙 Слушаю… говорите название товара
        </div>
      )}
    </header>
  );
}
