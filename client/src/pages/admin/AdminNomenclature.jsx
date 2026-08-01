import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminGetNomenclature, adminUpdateProduct } from '../../api';
import { useAuth } from '../../context/AuthContext';

const ACCENT = '#c0392b';
const COLS   = '150px minmax(0, 240px) minmax(0, 1fr) 90px';
const SET    = 'uzak-koldon';
const CAN_EDIT = ['owner', 'editor'];

function useIsMobile() {
  const [mob, setMob] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const h = () => setMob(window.innerWidth < 640);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return mob;
}

// Название на сайте — короткое («Шкаф AICHUROK GO 2»), для 1С нужно развёрнутое.
// Подсказки собираем из того, что уже есть у товара: габариты + расшифровка аббревиатур.
function hint(p) {
  return [p.dimensions, p.description].filter(Boolean).join(' · ');
}

// Объявлен вне страницы: иначе на каждый ввод символа React пересоздаёт тип
// компонента, размонтирует input и фокус слетает после первой буквы.
function Field({ p, value, state, canEdit, onChange, onSave }) {
  return (
    <div style={{ minWidth: 0 }}>
      <input
        value={value}
        readOnly={!canEdit}
        placeholder="Шкаф двухстворчатый с прозрачными стеклянными дверцами W052 H1850*W850*D400"
        onChange={e => onChange(e.target.value)}
        onBlur={() => canEdit && onSave()}
        onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
        style={{
          width: '100%', boxSizing: 'border-box', padding: '6px 9px', fontSize: 12.5,
          borderRadius: 6, outline: 'none', fontFamily: 'inherit', background: canEdit ? '#fff' : '#fafafa',
          border: `1.5px solid ${state === 'error' ? ACCENT : state === 'saved' ? '#2f9e44' : '#e6e6e6'}`,
          color: '#222',
        }}
      />
      {hint(p) && (
        <div style={{ fontSize: 10.5, color: '#bbb', marginTop: 3, paddingLeft: 2 }}>{hint(p)}</div>
      )}
    </div>
  );
}

export default function AdminNomenclature() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const canEdit = CAN_EDIT.includes(user?.role);

  const [products, setProducts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [draft,    setDraft]    = useState({});   // id → текст в поле
  const [saving,   setSaving]   = useState({});   // id → 'saving' | 'saved' | 'error'
  const [copied,   setCopied]   = useState(false);

  useEffect(() => {
    setLoading(true);
    adminGetNomenclature(SET)
      .then(r => {
        const list = r.data.products || [];
        setProducts(list);
        setDraft(Object.fromEntries(list.map(p => [p._id, p.nomenclature1C || ''])));
      })
      .finally(() => setLoading(false));
  }, []);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => (q
    ? products.filter(p =>
        (p.fullName || p.name || '').toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q) ||
        (draft[p._id] || '').toLowerCase().includes(q))
    : products), [products, draft, q]);

  const filledCount = products.filter(p => (draft[p._id] || '').trim()).length;

  async function save(p) {
    const value = (draft[p._id] || '').trim();
    if (value === (p.nomenclature1C || '')) return;   // без изменений — не дёргаем сервер
    setSaving(s => ({ ...s, [p._id]: 'saving' }));
    try {
      await adminUpdateProduct(p._id, { nomenclature1C: value });
      setProducts(list => list.map(x => x._id === p._id ? { ...x, nomenclature1C: value } : x));
      setSaving(s => ({ ...s, [p._id]: 'saved' }));
      setTimeout(() => setSaving(s => ({ ...s, [p._id]: undefined })), 1500);
    } catch {
      setSaving(s => ({ ...s, [p._id]: 'error' }));
    }
  }

  // В 1С удобнее вставлять две колонки: артикул и название
  function rows() {
    return filtered.map(p => [p.sku || '', (draft[p._id] || '').trim() || p.fullName || p.name]);
  }

  function copyAll() {
    navigator.clipboard.writeText(rows().map(r => r.join('\t')).join('\n'))
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); });
  }

  function downloadCsv() {
    // ; как разделитель и BOM — чтобы Excel открыл кириллицу без плясок
    const esc = v => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [['Артикул', 'Наименование'], ...rows()].map(r => r.map(esc).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `nomenclature-1c-${SET}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const btn = (extra = {}) => ({
    padding: '7px 14px', borderRadius: 7, border: '1.5px solid #e0e0e0', background: '#fff',
    cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#555', whiteSpace: 'nowrap', ...extra,
  });

  const fieldProps = p => ({
    p,
    value:    draft[p._id] ?? '',
    state:    saving[p._id],
    canEdit,
    onChange: v => setDraft(d => ({ ...d, [p._id]: v })),
    onSave:   () => save(p),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '0 0 16px 0', borderBottom: '1px solid #eee', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => navigate(-1)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: '0 4px', color: '#888' }}>←</button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: isMobile ? 16 : 18, fontWeight: 800, color: ACCENT }}>🧾 Номенклатура для 1С</div>
            <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>
              {loading ? '…' : `Uzak Koldon · ${products.length} товаров · заполнено ${filledCount}`}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по названию или артикулу…"
            style={{
              padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e0e0e0',
              fontSize: 13, flex: isMobile ? '1 1 100%' : '0 0 280px', outline: 'none', boxSizing: 'border-box',
            }}
          />
          <button onClick={copyAll} style={btn(copied ? { borderColor: '#2f9e44', color: '#2f9e44' } : {})}>
            {copied ? '✓ Скопировано' : '📋 Копировать всё'}
          </button>
          <button onClick={downloadCsv} style={btn()}>⬇ Выгрузить .csv</button>
        </div>

        {!canEdit && (
          <div style={{ fontSize: 11.5, color: '#aaa', marginTop: 10 }}>
            Только просмотр — редактировать названия могут владелец и редактор.
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ color: '#aaa', fontSize: 14, textAlign: 'center', paddingTop: 60 }}>Загрузка…</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: '#bbb', fontSize: 14, textAlign: 'center', paddingTop: 60 }}>Ничего не найдено</div>
      ) : isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 24 }}>
          {filtered.map(p => (
            <div key={p._id} style={{ padding: 10, background: '#fff', border: '1px solid #eee', borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: '#bbb', marginBottom: 2 }}>{p.sku || '—'}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#222', marginBottom: 8 }}>{p.fullName || p.name}</div>
              <Field {...fieldProps(p)} />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ border: '1px solid #eee', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: COLS, gap: 12, alignItems: 'center',
            padding: '10px 14px', background: '#fafafa', borderBottom: '1px solid #eee',
            fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: .3,
          }}>
            <span>Артикул</span>
            <span>Название на сайте</span>
            <span>Название для 1С</span>
            <span>Категория</span>
          </div>

          {filtered.map(p => (
            <div key={p._id} style={{
              display: 'grid', gridTemplateColumns: COLS, gap: 12, alignItems: 'start',
              padding: '9px 14px', borderBottom: '1px solid #f3f3f3', background: '#fff',
            }}>
              <span style={{ fontSize: 12, color: '#999', paddingTop: 7, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.sku || '—'}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#222', paddingTop: 6, minWidth: 0 }}>{p.fullName || p.name}</span>
              <Field {...fieldProps(p)} />
              <span style={{ fontSize: 11.5, color: '#aaa', paddingTop: 7 }}>{p.category || '—'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
