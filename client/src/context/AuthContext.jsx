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

  // Heartbeat every 60 s when logged in
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
    logoutApi().catch(() => {}); // clear server-side cookie
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, authError, checkAuth, saveLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
