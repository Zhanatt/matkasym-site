import { useState, useRef, useEffect } from 'react';
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

  return (
    <select
      className="swa-select"
      value={value}
      onChange={e => {
        if (e.target.value === '__add__') setAdding(true);
        else onChange(e.target.value);
      }}
    >
      {!value && <option value="">{placeholder}</option>}
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
      <option value="__add__">+ Добавить новый...</option>
    </select>
  );
}
