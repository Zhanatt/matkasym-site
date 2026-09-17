import { useState, useRef, useEffect } from 'react';
import SearchSelect from './SearchSelect';
import './SelectWithAdd.css';

/**
 * options: [{ value, label }]
 * value: string
 * onChange: (value) => void
 * onAdd: (newItem: { value, label }) => void
 * placeholder: string
 */
export default function SelectWithAdd({ options, value, onChange, onAdd, placeholder = 'Выберите...' }) {
  const [adding, setAdding]   = useState(false);
  const [newVal, setNewVal]   = useState('');
  const inputRef              = useRef(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const confirmAdd = () => {
    const trimmed = newVal.trim();
    if (!trimmed) { setAdding(false); return; }
    // value = slug (lowercase, dashes), label = as typed
    const slug = trimmed.toLowerCase().replace(/\s+/g, '-');
    onAdd({ value: slug, label: trimmed });
    onChange(slug);
    setNewVal('');
    setAdding(false);
  };

  const handleKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); confirmAdd(); }
    if (e.key === 'Escape') { setAdding(false); setNewVal(''); }
  };

  if (adding) {
    return (
      <div className="swa-add-row">
        <input
          ref={inputRef}
          className="swa-input"
          value={newVal}
          onChange={e => setNewVal(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Введите название..."
        />
        <button type="button" className="swa-confirm" onClick={confirmAdd}>✓</button>
        <button type="button" className="swa-cancel" onClick={() => { setAdding(false); setNewVal(''); }}>✕</button>
      </div>
    );
  }

  // Список с поиском, а не <select>: категорий под сотню, и мотать их глазами
  // было единственным способом найти нужную. Напечатанное в поиске подставляется
  // в поле добавления — если ничего не нашлось, это ровно то, что хотели завести.
  return (
    <SearchSelect
      options={options}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      action={{ label: '+ Добавить новый…', onClick: (q) => { setNewVal(q || ''); setAdding(true); } }}
    />
  );
}
