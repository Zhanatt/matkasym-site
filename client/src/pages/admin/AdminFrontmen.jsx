import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  adminGetFrontmen, adminCreateFrontman,
  adminUpdateFrontman, adminDeleteFrontman,
} from '../../api/index';

const BRAND_META = {
  'matkasym-home':  { label: 'HOME',  accent: '#DC1E24' },
  'matkasym-shaar': { label: 'SHAAR', accent: '#3463A3' },
};

const PALETTE = ['#E74C3C','#3498DB','#2ECC71','#F39C12','#9B59B6','#1ABC9C','#E67E22','#34495E'];

const SET_NAMES = {
  'taza-kiym':      'Taza Kiym',
  'kosh-keliniz':   'Kosh Keliniz',
  'achyk-asman':    'Achyk Asman',
  'den-sooluk':     'Den Sooluk',
  'baary-oorunda':  'Baary Oorunda',
  'jenil-ashkana':  'Jenil Ashkana',
  'konok-keldi':    'Konok Keldi',
  'korkom-aiym':    'Korkom Aiym',
  'shirin-balalyk': 'Shirin Balalyk',
  'uydo-ishtoo':    'Uydo Ishtoo',
  'green-omir':     'Green Omir',
  'sanarip-tv':     'Sanarip TV',
};
const setLabel = s => SET_NAMES[s] || s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export default function AdminFrontmen() {
  const { user } = useAuth();
  const canEdit = user?.role === 'owner' || user?.role === 'editor';

  const [frontmen, setFrontmen] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [editId,   setEditId]   = useState(null); // _id being edited, or 'new'
  const [form,     setForm]     = useState({});
  const [saving,   setSaving]   = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    adminGetFrontmen()
      .then(r => setFrontmen(r.data))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const grouped = Object.entries(BRAND_META).map(([key, meta]) => ({
    brandKey: key,
    meta,
    items: frontmen.filter(f => f.brand === key),
  }));

  function startNew(brandKey) {
    const color = PALETTE[frontmen.length % PALETTE.length];
    setForm({ name: '', brand: brandKey, instagram: '', sets: [], color });
    setEditId('new');
  }

  function startEdit(fm) {
    setForm({ name: fm.name, brand: fm.brand, instagram: fm.instagram || '', sets: [...fm.sets], color: fm.color });
    setEditId(fm._id);
  }

  function cancelEdit() { setEditId(null); setForm({}); }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editId === 'new') {
        await adminCreateFrontman(form);
      } else {
        await adminUpdateFrontman(editId, form);
      }
      await load();
      setEditId(null);
      setForm({});
    } finally { setSaving(false); }
  }

  async function del(id) {
    if (!window.confirm('Удалить фронтмена?')) return;
    await adminDeleteFrontman(id);
    load();
  }

  if (loading) return <div className="admin-empty">Загрузка...</div>;

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div className="admin-page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="admin-page-title">Фронтмены</h1>
          <p style={{ color: 'var(--slate)', fontSize: 13, margin: '2px 0 0' }}>
            Представители брендов — {frontmen.length} чел.
          </p>
        </div>
      </div>

      {grouped.map(({ brandKey, meta, items }) => (
        <div key={brandKey} style={{
          background: '#fff', borderRadius: 12, padding: '28px 32px',
          boxShadow: '0 1px 4px rgba(0,0,0,.07)', marginBottom: 20,
        }}>
          {/* Brand header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 36, fontWeight: 800, color: '#1c1c1c', letterSpacing: -1, lineHeight: 1 }}>
                {meta.label}
              </div>
              <div style={{ height: 3, width: 40, background: meta.accent, borderRadius: 2, marginTop: 6 }} />
            </div>
            {canEdit && (
              <button
                onClick={() => startNew(brandKey)}
                style={{
                  padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
                  background: meta.accent, color: '#fff', border: 'none',
                  fontWeight: 700, fontSize: 13,
                }}
              >
                + Фронтмен
              </button>
            )}
          </div>

          {/* Cards grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {items.map(fm => (
              <div key={fm._id} style={{
                borderRadius: 10, border: `2px solid ${fm.color}30`,
                background: `${fm.color}08`, padding: '14px 16px', position: 'relative',
              }}>
                {/* Color stripe */}
                <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: fm.color, borderRadius: '10px 0 0 10px' }} />
                <div style={{ paddingLeft: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#1c1c1c' }}>{fm.name}</div>
                  {fm.instagram && (
                    <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{fm.instagram}</div>
                  )}
                  {fm.sets.length > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {fm.sets.map(s => (
                        <span key={s} style={{
                          fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10,
                          background: fm.color + '22', color: fm.color,
                        }}>
                          {setLabel(s)}
                        </span>
                      ))}
                    </div>
                  )}
                  {canEdit && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button onClick={() => startEdit(fm)} style={{
                        fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid #e0e0e0',
                        background: '#fff', cursor: 'pointer', color: '#555', fontWeight: 600,
                      }}>Изменить</button>
                      <button onClick={() => del(fm._id)} style={{
                        fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid #fcc',
                        background: '#fff8f8', cursor: 'pointer', color: '#c00', fontWeight: 600,
                      }}>Удалить</button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {items.length === 0 && (
              <div style={{ fontSize: 13, color: '#ccc', padding: '20px 0' }}>Нет фронтменов</div>
            )}
          </div>
        </div>
      ))}

      {/* Edit / Create modal */}
      {editId && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 2000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
          onClick={e => { if (e.target === e.currentTarget) cancelEdit(); }}
        >
          <div style={{
            background: '#fff', borderRadius: 14, padding: '28px 32px',
            width: 380, maxWidth: '90vw', boxShadow: '0 8px 40px rgba(0,0,0,.18)',
          }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 20px' }}>
              {editId === 'new' ? 'Новый фронтмен' : 'Редактировать'}
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input type="color" value={form.color}
                  onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                  style={{ width: 36, height: 36, border: 'none', cursor: 'pointer', borderRadius: 6, padding: 0 }} />
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Имя"
                  style={{ flex: 1, fontSize: 14, border: '1px solid #e0e0e0', borderRadius: 8, padding: '8px 12px', outline: 'none' }} />
              </div>

              <input value={form.instagram} onChange={e => setForm(f => ({ ...f, instagram: e.target.value }))}
                placeholder="@instagram"
                style={{ fontSize: 13, border: '1px solid #e0e0e0', borderRadius: 8, padding: '8px 12px', outline: 'none' }} />

              {/* Brand */}
              <select value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                style={{ fontSize: 13, border: '1px solid #e0e0e0', borderRadius: 8, padding: '8px 12px', outline: 'none' }}>
                {Object.entries(BRAND_META).map(([k, m]) => (
                  <option key={k} value={k}>{m.label}</option>
                ))}
              </select>

              {/* Sets */}
              <div>
                <div style={{ fontSize: 11, color: '#888', fontWeight: 600, marginBottom: 6 }}>СЕТЫ</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {Object.keys(SET_NAMES).map(s => {
                    const active = form.sets.includes(s);
                    return (
                      <button key={s}
                        onClick={() => setForm(f => ({
                          ...f,
                          sets: active ? f.sets.filter(x => x !== s) : [...f.sets, s],
                        }))}
                        style={{
                          fontSize: 11, padding: '4px 10px', borderRadius: 12,
                          border: `1.5px solid ${active ? form.color : '#e0e0e0'}`,
                          background: active ? form.color : '#fff',
                          color: active ? '#fff' : '#555',
                          cursor: 'pointer', fontWeight: 600,
                        }}
                      >
                        {setLabel(s)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
              <button onClick={cancelEdit} style={{
                padding: '9px 20px', borderRadius: 8, border: '1px solid #e0e0e0',
                background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#555',
              }}>Отмена</button>
              <button onClick={save} disabled={saving || !form.name?.trim()} style={{
                padding: '9px 20px', borderRadius: 8, border: 'none',
                background: '#1c1c1c', color: '#fff', cursor: saving ? 'wait' : 'pointer',
                fontSize: 13, fontWeight: 700, opacity: saving ? 0.7 : 1,
              }}>
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
