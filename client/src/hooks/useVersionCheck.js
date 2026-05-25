import { useEffect, useRef } from 'react';

export function useVersionCheck() {
  const currentVersion = useRef(null);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/version');
        const { version } = await res.json();

        if (!currentVersion.current) {
          currentVersion.current = version;
          return;
        }

        if (version !== currentVersion.current) {
          showToastAndReload();
        }
      } catch {
        // ignore network errors
      }
    };

    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, []);
}

function showToastAndReload() {
  const toast = document.createElement('div');
  toast.textContent = '🔄 Вышло обновление сайта, перезагружаем...';
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '24px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: '#111',
    color: '#fff',
    padding: '12px 24px',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: '600',
    zIndex: '99999',
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
  });
  document.body.appendChild(toast);
  setTimeout(() => window.location.reload(), 2500);
}
