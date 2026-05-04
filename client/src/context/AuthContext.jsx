import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { getMe, heartbeat } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,        setUser]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [authError,   setAuthError]   = useState(false); // network error on startup
  const hbRef = useRef(null);

  const checkAuth = () => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }
    setLoading(true);
    setAuthError(false);
    getMe()
      .then(r => { setUser(r.data.user); setAuthError(false); })
      .catch(err => {
        if (err.response?.status === 401 || err.response?.status === 403) {
          localStorage.removeItem('token');
        } else {
          // Network/server error — keep token, show retry
          setAuthError(true);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { checkAuth(); }, []);

  // Heartbeat every 60s when logged in
  useEffect(() => {
    if (!user) { clearInterval(hbRef.current); return; }
    heartbeat().catch(() => {});
    hbRef.current = setInterval(() => heartbeat().catch(() => {}), 60_000);
    return () => clearInterval(hbRef.current);
  }, [!!user]);

  const saveLogin = (token, userData) => {
    localStorage.setItem('token', token);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, authError, checkAuth, saveLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
