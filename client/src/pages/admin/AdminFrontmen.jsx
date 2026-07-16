import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useFrontmen } from '../../context/FrontmenContext';
import { adminGetUsers, adminGetBrands } from '../../api/index';

const BRAND_META = {
  'matkasym-home':   { label: 'HOME',   accent: '#DC1E24' },
  'matkasym-shaar':  { label: 'SHAAR',  accent: '#3463A3' },
  'matkasym-kyzmat': { label: 'KYZMAT', accent: '#267846' },
};

const PALETTE = ['#E74C3C','#3498DB','#2ECC71','#F39C12','#9B59B6','#1ABC9C','#E67E22','#34495E'];

const SALES_CHANNELS = {
  default: [
    { key: 'matkasym_home', label: 'matkasym_home', desc: 'Розница KG' },
    { key: 'make_in',       label: 'make_in',       desc: 'Оптовики' },
    { key: 'matkasym_kz',   label: 'Маткасым кейзет', desc: 'Казахстан' },
  ],
  'matkasym-shaar': [
    { key: 'matkasym_shaar',  label: 'matkasym_shaar',  desc: 'B2G (госзакупки)' },
    { key: 'matkasym_horeca', label: 'matkasym_horeca', desc: 'HoReCa' },
    { key: 'make_in',         label: 'make_in',         desc: 'Оптовики' },
  ],
  'matkasym-kyzmat': [
    { key: 'matkasym_kyzmat', label: 'matkasym_kyzmat', desc: 'Производство' },
  ],
};

const getChannelsForBrand = (brand) => SALES_CHANNELS[brand] || SALES_CHANNELS.default;

const SET_NAMES = {
  'achyk-asman':     'Achyk Asman',
  'baary-oorunda':   'Baary Oorunda',
  'den-sooluk':      'Den Sooluk',
  'jenil-ashkana':   'Jenil Ashkana',
  'konok-keldi':     'Konok Keldi',
  'korkom-aiym':     'Korkom Aiym',
  'kosh-keliniz':    'Kosh Keliniz',
  'sanarip-tv':      'Sanarip TV',
  'shirin-balalyk':  'Shirin Balalyk',
  'taza-kiym':       'Taza Kiym',
  'uydo-ishtoo':     'Uydo Ishtoo',
  'zhashyl-omur':    'Zhashyl Omur',
  '0-tashtandy-home': '0-Tashtandy (HOME)',
  '0-tashtandy':     '0-Tashtandy',
  'bekem-fasad':     'Bekem Fasad',
  'bekem-tosmo':     'Bekem Tosmo',
  'bilim-kelechek':  'Bilim Kelechek',
  'kooz-koopsuzduk': 'Kooz Koopsuzduk',
  'mazza-seyil':     'Mazza Seyil',
  'uzak-koldon':     'Uzak Koldon',
  'onuguu-set':      'Onuguu Set',
  'dayar-tutuk':     'Dayar Tutuk',
  'poly-fabrikat':   'Poly Fabrikat',
};
const setLabel = s => SET_NAMES[s] || s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const CHANNEL_LABELS = {
  'matkasym_home': '🏠 Home',
  'matkasym_shaar': '🏙 Shaar',
  'make_in': '🛠 Make In',
  'matkasym_kz': '🇰🇿 Маткасым кейзет',
  'matkasym_horeca': '🍽 HoReCa',
  'matkasym_kyzmat': '🔧 Kyzmat',
};

export default function AdminFrontmen() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canEdit = user?.role === 'owner' || user?.role === 'editor';

  const { frontmen, loading: frontmenLoading, createFrontman, updateFrontman, deleteFrontman } = useFrontmen();
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [brandSets, setBrandSets] = useState({});
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    adminGetUsers()
      .then(res => {
        const filtered = res.data.filter(u => ['owner', 'editor', 'viewer'].includes(u.role));
        filtered.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'));
        setUsers(filtered);
      })
      .finally(() => setUsersLoading(false));
    adminGetBrands()
      .then(res => {
        const setsMap = {};
        (res.data || []).forEach(b => {
          setsMap[b.key] = (b.sets || []).map(s => s.key);
        });
        setBrandSets(setsMap);
      });
  }, []);

  const loading = frontmenLoading || usersLoading;

  const grouped = Object.entries(BRAND_META).map(([key, meta]) => ({
    brandKey: key,
    meta,
    items: frontmen.filter(f => f.brand === key).sort((a, b) => {
      const aIsMe = a.userId?._id === user?._id || a.userId === user?._id;
      const bIsMe = b.userId?._id === user?._id || b.userId === user?._id;
      if (aIsMe && !bIsMe) return -1;
      if (!aIsMe && bIsMe) return 1;
      return (a.name || '').localeCompare(b.name || '', 'ru');
    }),
  }));

  function startNew(brandKey) {
    const color = PALETTE[frontmen.length % PALETTE.length];
    setForm({ userId: '', name: '', brand: brandKey, instagram: '', sets: [], color, channel: '' });
    setEditId('new');
  }

  function startEdit(fm) {
    setForm({
      userId: fm.userId?._id || fm.userId || '',
      name: fm.name,
      brand: fm.brand,
      instagram: fm.instagram || '',
      sets: [...fm.sets],
      color: fm.color,
      channel: fm.channel || '',
    });
    setEditId(fm._id);
  }

  function cancelEdit() { setEditId(null); setForm({}); }

  function handleUserSelect(userId) {
    const selected = users.find(u => u._id === userId);
    setForm(f => ({
      ...f,
      userId,
      name: selected ? selected.name : f.name,
      instagram: selected?.instagram || f.instagram,
    }));
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = { ...form, userId: form.userId || null, channel: form.channel || null };
      if (editId === 'new') {
        await createFrontman(payload);
      } else {
        await updateFrontman(editId, payload);
      }
      setEditId(null);
      setForm({});
    } finally { setSaving(false); }
  }

  async function del(id) {
    if (!window.confirm('Удалить фронтмена?')) return;
    await deleteFrontman(id);
  }

  if (loading) return <div className="admin-empty">Загрузка...</div>;

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <div className="admin-page-header" style={{ marginBottom: 32 }}>
        <div>
          <h1 className="admin-page-title">Фронтмены</h1>
          <p style={{ color: 'var(--slate)', fontSize: 13, margin: '2px 0 0' }}>
            {frontmen.length} человек
          </p>
        </div>
      </div>

      {grouped.map(({ brandKey, meta, items }) => (
        <div key={brandKey} style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 4, height: 20, background: meta.accent, borderRadius: 2 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#888', letterSpacing: 0.5 }}>{meta.label}</span>
              <span style={{ fontSize: 12, color: '#bbb' }}>{items.length}</span>
            </div>
            {canEdit && (
              <button
                onClick={() => startNew(brandKey)}
                style={{
                  padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
                  background: 'transparent', color: meta.accent, border: `1px solid ${meta.accent}`,
                  fontWeight: 600, fontSize: 12,
                }}
              >
                + Добавить
              </button>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {items.map(fm => {
              const isMe = fm.userId?._id === user?._id || fm.userId === user?._id;
              const isExpanded = expandedId === fm._id;
              const initials = fm.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

              return (
                <div key={fm._id}>
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : fm._id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 14px',
                      background: isExpanded ? '#f8f8f8' : '#fff',
                      borderRadius: 10,
                      cursor: 'pointer',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = '#fafafa'; }}
                    onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = '#fff'; }}
                  >
                    <div style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: fm.color,
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 13,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}>
                      {initials}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: 14, color: '#1c1c1c' }}>{fm.name}</span>
                        {isMe && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, color: fm.color,
                            background: fm.color + '18', borderRadius: 4, padding: '1px 5px',
                          }}>ВЫ</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: '#999', marginTop: 1 }}>
                        {fm.sets.length} сет{fm.sets.length === 1 ? '' : fm.sets.length < 5 ? 'а' : 'ов'}
                        {fm.channel && <span style={{ marginLeft: 8 }}>{CHANNEL_LABELS[fm.channel] || fm.channel}</span>}
                      </div>
                    </div>

                    <div style={{ color: '#ccc', fontSize: 12 }}>
                      {isExpanded ? '▲' : '▼'}
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{
                      padding: '12px 14px 14px 62px',
                      background: '#f8f8f8',
                      borderRadius: '0 0 10px 10px',
                      marginTop: -4,
                    }}>
                      {fm.userId?.email && (
                        <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>
                          ✉️ {fm.userId.email}
                        </div>
                      )}
                      {fm.instagram && (
                        <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
                          📷 {fm.instagram}
                        </div>
                      )}

                      {fm.sets.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                          {fm.sets.map(s => (
                            <button key={s}
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate('/admin/sets', { state: { autoOpen: { brand: fm.brand, set: s } } });
                              }}
                              style={{
                                fontSize: 11, fontWeight: 500, padding: '5px 10px', borderRadius: 6,
                                background: '#fff', color: '#555',
                                border: '1px solid #e0e0e0', cursor: 'pointer',
                              }}
                            >
                              {setLabel(s)}
                            </button>
                          ))}
                        </div>
                      )}

                      {canEdit && (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={(e) => { e.stopPropagation(); startEdit(fm); }} style={{
                            fontSize: 11, padding: '5px 12px', borderRadius: 6, border: '1px solid #ddd',
                            background: '#fff', cursor: 'pointer', color: '#555', fontWeight: 500,
                          }}>Изменить</button>
                          <button onClick={(e) => { e.stopPropagation(); del(fm._id); }} style={{
                            fontSize: 11, padding: '5px 12px', borderRadius: 6, border: 'none',
                            background: '#fee', cursor: 'pointer', color: '#c00', fontWeight: 500,
                          }}>Удалить</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {items.length === 0 && (
              <div style={{ fontSize: 13, color: '#ccc', padding: '16px 14px' }}>Нет фронтменов</div>
            )}
          </div>
        </div>
      ))}

      {/* Edit / Create modal */}
      {editId && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.4)', zIndex: 2000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
          onClick={e => { if (e.target === e.currentTarget) cancelEdit(); }}
        >
          <div style={{
            background: '#fff', borderRadius: 14, padding: '24px 28px',
            width: 380, maxWidth: '90vw', boxShadow: '0 8px 40px rgba(0,0,0,.18)',
          }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 20px' }}>
              {editId === 'new' ? 'Новый фронтмен' : 'Редактировать'}
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontSize: 10, color: '#888', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' }}>Пользователь</div>
                <select
                  value={form.userId}
                  onChange={e => handleUserSelect(e.target.value)}
                  style={{ width: '100%', fontSize: 13, border: '1px solid #e5e5e5', borderRadius: 8, padding: '10px 12px', outline: 'none', background: '#fff' }}
                >
                  <option value="">— Не привязан —</option>
                  {users.map(u => (
                    <option key={u._id} value={u._id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input type="color" value={form.color}
                  onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                  style={{ width: 40, height: 40, border: 'none', cursor: 'pointer', borderRadius: 8, padding: 0 }} />
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Имя"
                  style={{ flex: 1, fontSize: 14, border: '1px solid #e5e5e5', borderRadius: 8, padding: '10px 12px', outline: 'none' }} />
              </div>

              <input value={form.instagram} onChange={e => setForm(f => ({ ...f, instagram: e.target.value }))}
                placeholder="@instagram"
                style={{ fontSize: 13, border: '1px solid #e5e5e5', borderRadius: 8, padding: '10px 12px', outline: 'none' }} />

              <div style={{ display: 'flex', gap: 10 }}>
                <select value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                  style={{ flex: 1, fontSize: 13, border: '1px solid #e5e5e5', borderRadius: 8, padding: '10px 12px', outline: 'none', background: '#fff' }}>
                  {Object.entries(BRAND_META).map(([k, m]) => (
                    <option key={k} value={k}>{m.label}</option>
                  ))}
                </select>

                <select
                  value={form.channel}
                  onChange={e => setForm(f => ({ ...f, channel: e.target.value }))}
                  style={{ flex: 1, fontSize: 13, border: '1px solid #e5e5e5', borderRadius: 8, padding: '10px 12px', outline: 'none', background: '#fff' }}
                >
                  <option value="">Канал</option>
                  {getChannelsForBrand(form.brand).map(ch => (
                    <option key={ch.key} value={ch.key}>{ch.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ fontSize: 10, color: '#888', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase' }}>Сеты</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(brandSets[form.brand] || []).map(s => {
                    const active = form.sets.includes(s);
                    return (
                      <button key={s}
                        onClick={() => setForm(f => ({
                          ...f,
                          sets: active ? f.sets.filter(x => x !== s) : [...f.sets, s],
                        }))}
                        style={{
                          fontSize: 11, padding: '5px 10px', borderRadius: 6,
                          border: active ? 'none' : '1px solid #e5e5e5',
                          background: active ? form.color : '#fff',
                          color: active ? '#fff' : '#666',
                          cursor: 'pointer', fontWeight: 500,
                        }}
                      >
                        {setLabel(s)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={cancelEdit} style={{
                padding: '10px 20px', borderRadius: 8, border: 'none',
                background: '#f5f5f5', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#555',
              }}>Отмена</button>
              <button onClick={save} disabled={saving || !form.name?.trim()} style={{
                padding: '10px 20px', borderRadius: 8, border: 'none',
                background: '#1c1c1c', color: '#fff', cursor: saving ? 'wait' : 'pointer',
                fontSize: 13, fontWeight: 700, opacity: saving ? 0.7 : 1,
              }}>
                {saving ? '...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
