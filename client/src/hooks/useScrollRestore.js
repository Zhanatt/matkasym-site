import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Saves and restores .admin-main scroll position per route.
// Pass loading=true while data is fetching; restore fires after loading becomes false.
export function useScrollRestore(loading = false) {
  const { pathname } = useLocation();
  const key = `adminScroll_${pathname}`;

  // Save scroll on every scroll event
  useEffect(() => {
    const el = document.querySelector('.admin-main');
    if (!el) return;
    const save = () => sessionStorage.setItem(key, String(Math.round(el.scrollTop)));
    el.addEventListener('scroll', save, { passive: true });
    return () => el.removeEventListener('scroll', save);
  }, [key]);

  // Restore scroll after content loads
  useEffect(() => {
    if (loading) return;
    const el = document.querySelector('.admin-main');
    if (!el) return;
    const saved = sessionStorage.getItem(key);
    if (!saved) return;
    // Two rAF frames to wait for layout
    requestAnimationFrame(() =>
      requestAnimationFrame(() => { el.scrollTop = parseInt(saved, 10); })
    );
  }, [loading, key]);
}
