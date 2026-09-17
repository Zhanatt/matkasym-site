import { useState, useRef, useEffect, useMemo } from 'react';
import './SearchSelect.css';

/**
 * Выпадающий список с поиском.
 *
 * Обычный <select> хорош, пока в нём десяток строк. У пользователей и категорий
 * их под сотню, и найти нужную можно было только прокруткой: список открывался
 * на всю высоту экрана, а имена в нём идут не по алфавиту, а как пришли из базы.
 * Здесь то же поле, но в него можно печатать — список сужается по мере ввода.
 *
 * options: [{ value, label, hint }]  hint — вторая строка (почта, артикул)
 * value: string
 * onChange: (value) => void
 * emptyLabel: подпись пункта «ничего не выбрано»; без неё пункта нет
 * action: { label, onClick } — строка внизу списка («+ Добавить новый…»)
 */
export default function SearchSelect({
  options = [], value, onChange, placeholder = 'Выберите…',
  emptyLabel, action, className = '',
}) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState('');
  const [hover, setHover] = useState(0);
  const boxRef   = useRef(null);
  const inputRef = useRef(null);
  const listRef  = useRef(null);

  const selected = options.find(o => String(o.value) === String(value));
  // Что показывать, когда список закрыт: выбранное, а не то, что печатали.
  const shown = open ? query : (selected?.label ?? '');

  // «ё» и регистр не должны мешать поиску: люди пишут «елка» и «Ёлка».
  const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е');
  const list = useMemo(() => {
    const rows = emptyLabel !== undefined
      ? [{ value: '', label: emptyLabel, empty: true }, ...options]
      : options;
    const q = norm(query).trim();
    if (!open || !q) return rows;
    // Пункт «ничего не выбрано» в поиске не участвует — он не ответ на запрос.
    return rows.filter(o => !o.empty && (norm(o.label).includes(q) || norm(o.hint).includes(q)));
  }, [options, query, open, emptyLabel]);

  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (!boxRef.current?.contains(e.target)) close(); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  // Подсвеченная строка всегда должна быть видна — иначе стрелками уезжаешь вслепую.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[data-hover="1"]')?.scrollIntoView({ block: 'nearest' });
  }, [hover, open]);

  const openList = () => {
    setQuery('');
    setHover(Math.max(0, list.findIndex(o => String(o.value) === String(value))));
    setOpen(true);
  };

  const close = () => { setOpen(false); setQuery(''); };

  const pick = (o) => { onChange(o.value); close(); inputRef.current?.blur(); };

  const onKey = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { openList(); return; }
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHover(h => Math.min(h + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHover(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (list[hover]) pick(list[hover]);
      else if (action && query.trim()) action.onClick(query.trim());
    }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  };

  return (
    <div className={`ss ${className}`} ref={boxRef}>
      <input
        ref={inputRef}
        className={`ss-input ${open ? 'ss-input--open' : ''}`}
        value={shown}
        placeholder={selected ? selected.label : placeholder}
        onChange={e => { setQuery(e.target.value); setHover(0); if (!open) setOpen(true); }}
        onFocus={openList}
        onKeyDown={onKey}
        autoComplete="off"
      />
      <span className="ss-caret" aria-hidden onMouseDown={e => {
        // Стрелка — это переключатель: второй клик по ней закрывает список.
        e.preventDefault();
        open ? close() : inputRef.current?.focus();
      }}>▾</span>

      {open && (
        <div className="ss-drop" ref={listRef}>
          {list.map((o, i) => (
            <button
              key={`${o.value}-${i}`}
              type="button"
              data-hover={i === hover ? '1' : '0'}
              className={'ss-item'
                + (i === hover ? ' ss-item--hover' : '')
                + (String(o.value) === String(value) ? ' ss-item--on' : '')
                + (o.empty ? ' ss-item--empty' : '')}
              onMouseEnter={() => setHover(i)}
              onClick={() => pick(o)}
            >
              <span className="ss-label">{o.label}</span>
              {o.hint && <span className="ss-hint">{o.hint}</span>}
            </button>
          ))}

          {!list.length && (
            <div className="ss-none">Ничего не найдено{query.trim() ? ` по «${query.trim()}»` : ''}</div>
          )}

          {action && (
            <button type="button" className="ss-action"
              onClick={() => { const q = query.trim(); close(); action.onClick(q); }}>
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
