import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { getMe, heartbeat, logoutApi } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,      setUser]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [authError, setAuthError] = useState(false);
  const hbRef = useRef(null);

  const checkAuth = () => {
    setLoading(true);
    setAuthError(false);
    // Always call /me — if no localStorage token the browser sends the cookie automatically.
    // The server returns { user, token? }; if token is present we restore localStorage.
    getMe()
      .then(r => {
        setUser(r.data.user);
        setAuthError(false);
        if (r.data.token) {
          // Authenticated via cookie — persist token to localStorage for subsequent requests
          localStorage.setItem('token', r.data.token);
        }
      })
      .catch(err => {
        if (err.response?.status === 401 || err.response?.status === 403) {
          localStorage.removeItem('token');
          setUser(null);
        } else {
          setAuthError(true);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { checkAuth(); }, []);

  // Отметка активности раз в минуту — но только когда сайтом действительно
  // пользуются. Раньше стук шёл всегда, пока человек залогинен, и вкладка,
  // забытая открытой на фоне, всю неделю писалась как «активен сегодня»:
  // и время в журнале копилось, и «был в сети» врал.
  //
  // Условий два. Вкладка на экране — фоновая по определению не используется.
  // И было касание за последние пять минут: открытая, но брошенная вкладка
  // видима и при этом простаивает.
  const IDLE_MS = 5 * 60_000;
  const lastActiveRef = useRef(Date.now());

  useEffect(() => {
    if (!user) { clearInterval(hbRef.current); return; }

    const touch = () => { lastActiveRef.current = Date.now(); };
    const inUse = () =>
      document.visibilityState === 'visible' &&
      Date.now() - lastActiveRef.current < IDLE_MS;

    const beat = () => { if (inUse()) heartbeat().catch(() => {}); };

    // Слушаем то, что означает работу руками. passive — чтобы не тормозить
    // прокрутку: обработчик только запоминает время.
    const EVENTS = ['mousedown', 'mousemove', 'keydown', 'wheel', 'touchstart', 'scroll'];
    EVENTS.forEach(e => window.addEventListener(e, touch, { passive: true }));

    // Вернулись на вкладку — это тоже действие, и отметиться надо сразу,
    // не дожидаясь следующей минуты.
    const onVisible = () => { if (document.visibilityState === 'visible') { touch(); beat(); } };
    document.addEventListener('visibilitychange', onVisible);

    touch();
    beat();
    hbRef.current = setInterval(beat, 60_000);

    return () => {
      clearInterval(hbRef.current);
      EVENTS.forEach(e => window.removeEventListener(e, touch));
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [!!user]);

  const saveLogin = (token, userData) => {
    localStorage.setItem('token', token);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    logoutApi().catch(() => {}); // clear server-side cookie
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, authError, checkAuth, saveLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
