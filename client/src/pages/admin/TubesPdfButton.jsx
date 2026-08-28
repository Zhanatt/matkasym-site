// Кнопка PDF для сета труб: перед скачиванием спрашивает язык каталога —
// один и тот же прайс уходит и кыргызским клиентам, и русскоязычным.
import { useState, useRef, useEffect } from 'react';
import { downloadTubesCatalogPDF } from './TubesCatalogPDF';

const LANGS = [
  { key: 'ky', label: 'Кыргызча' },
  { key: 'ru', label: 'Русский' },
];

export default function TubesPdfButton({ products }) {
  const [open,     setOpen]     = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef(null);
  const wrapRef  = useRef(null);

  useEffect(() => {
    if (!open) return;
    const away = e => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  useEffect(() => () => clearInterval(timerRef.current), []);

  if (!products?.length) return null;

  const make = async (lang) => {
    setOpen(false);
    if (loading) return;

    // «В пути» в каталог не идёт — товара на складе ещё нет
    const available = products.filter(p => p.inStock || p.stock > 0 || p.isOnOrder);
    if (!available.length) { alert('Нет доступных труб для выгрузки'); return; }

    setLoading(true);
    setProgress(5);
    timerRef.current = setInterval(() => {
      setProgress(p => (p < 88 ? p + (88 - p) * 0.12 : p));
    }, 250);

    try {
      await downloadTubesCatalogPDF(available, lang);
      setProgress(100);
    } catch (e) {
      console.error('PDF error:', e);
      alert('Не удалось собрать каталог');
    } finally {
      clearInterval(timerRef.current);
      setTimeout(() => { setLoading(false); setProgress(0); }, 600);
    }
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={loading}
        style={{
          position: 'relative', overflow: 'hidden',
          padding: '5px 14px', borderRadius: 6, border: 'none',
          cursor: loading ? 'wait' : 'pointer',
          background: '#1a73e8', color: '#fff',
          fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap', minWidth: 90,
        }}
      >
        {loading && (
          <span style={{
            position: 'absolute', top: 0, left: 0, bottom: 0,
            background: 'rgba(255,255,255,0.22)',
            width: `${progress}%`, transition: 'width 0.25s ease', borderRadius: 6,
          }} />
        )}
        <span style={{ position: 'relative', zIndex: 1 }}>
          {loading ? `⏳ ${Math.round(progress)}%` : '📄 PDF'}
        </span>
      </button>

      {open && !loading && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50,
          background: '#fff', borderRadius: 8, border: '1px solid #e0e0e0',
          boxShadow: '0 8px 24px rgba(0,0,0,0.14)', overflow: 'hidden', minWidth: 150,
        }}>
          <div style={{ padding: '7px 12px', fontSize: 10, fontWeight: 700, color: '#888',
                        letterSpacing: 0.4, borderBottom: '1px solid #f0f0f0' }}>
            ЯЗЫК КАТАЛОГА
          </div>
          {LANGS.map(l => (
            <button
              key={l.key}
              onClick={() => make(l.key)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '9px 12px', border: 'none', background: '#fff',
                cursor: 'pointer', fontSize: 13, color: '#333',
              }}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
