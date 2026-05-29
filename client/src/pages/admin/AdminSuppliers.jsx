import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  adminGetSuppliers, adminCreateSupplier,
  adminUpdateSupplier, adminDeleteSupplier,
  adminGetProducts,
} from '../../api/index';

export default function AdminSuppliers() {
  const { user } = useAuth();
  const canEdit = user?.role === 'owner' || user?.role === 'editor';

  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    adminGetSuppliers()
      .then(r => setSuppliers(r.data))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!productSearch.trim()) {
      setProductResults([]);
      return;
    }
    const timer = setTimeout(() => {
      setSearchLoading(true);
      adminGetProducts({ search: productSearch, limit: 20 })
        .then(r => setProductResults(r.data.products || []))
        .finally(() => setSearchLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [productSearch]);

  function startNew() {
    setForm({ name: '', instagram: '', phone: '', notes: '', products: [] });
    setEditId('new');
    setProductSearch('');
    setProductResults([]);
  }

  function startEdit(s) {
    setForm({
      name: s.name,
      instagram: s.instagram || '',
      phone: s.phone || '',
      notes: s.notes || '',
      products: s.products || [],
    });
    setEditId(s._id);
    setProductSearch('');
    setProductResults([]);
  }

  function cancelEdit() {
    setEditId(null);
    setForm({});
  }

  function addProduct(p) {
    if (form.products.some(x => x._id === p._id)) return;
    setForm(f => ({ ...f, products: [...f.products, p] }));
    setProductSearch('');
    setProductResults([]);
  }

  function removeProduct(id) {
    setForm(f => ({ ...f, products: f.products.filter(x => x._id !== id) }));
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        products: form.products.map(p => p._id),
      };
      if (editId === 'new') {
        await adminCreateSupplier(payload);
      } else {
        await adminUpdateSupplier(editId, payload);
      }
      await load();
      setEditId(null);
      setForm({});
    } finally {
      setSaving(false);
    }
  }

  async function del(id) {
    if (!window.confirm('Удалить поставщика?')) return;
    await adminDeleteSupplier(id);
    load();
  }

  if (loading) return <div className="admin-empty">Загрузка...</div>;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="admin-page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="admin-page-title">Индивидуальные поставщики</h1>
          <p style={{ color: 'var(--slate)', fontSize: 13, margin: '2px 0 0' }}>
            Поставщики, которые работают с нашей продукцией — {suppliers.length} чел.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={startNew}
            style={{
              padding: '10px 20px', borderRadius: 8, cursor: 'pointer',
              background: '#1c1c1c', color: '#fff', border: 'none',
              fontWeight: 700, fontSize: 13,
            }}
          >
            + Добавить поставщика
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {suppliers.map(s => (
          <div key={s._id} style={{
            background: '#fff', borderRadius: 12, padding: '20px 24px',
            boxShadow: '0 1px 4px rgba(0,0,0,.07)',
            border: '1px solid #f0f0f0',
          }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#1c1c1c', marginBottom: 8 }}>
              {s.name}
            </div>

            {(s.instagram || s.phone) && (
              <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
                {s.instagram && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 16 }}>📷</span>
                    <a
                      href={`https://instagram.com/${s.instagram.replace('@', '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#e1306c', textDecoration: 'none', fontWeight: 600 }}
                    >
                      {s.instagram}
                    </a>
                  </div>
                )}
                {s.phone && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 16 }}>📞</span>
                    <a
                      href={`tel:${s.phone}`}
                      style={{ color: '#333', textDecoration: 'none', fontWeight: 500 }}
                    >
                      {s.phone}
                    </a>
                  </div>
                )}
              </div>
            )}

            {s.notes && (
              <div style={{ fontSize: 12, color: '#888', marginBottom: 12, fontStyle: 'italic' }}>
                {s.notes}
              </div>
            )}

            {s.products && s.products.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, color: '#888', fontWeight: 600, marginBottom: 8 }}>
                  КАТАЛОГ ТОВАРОВ ({s.products.length})
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {s.products.slice(0, 6).map(p => (
                    <div key={p._id} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      background: '#f8f8f8', borderRadius: 8, padding: '4px 10px',
                      fontSize: 12, color: '#555',
                    }}>
                      {p.images?.[0] && (
                        <img src={p.images[0]} alt="" style={{ width: 20, height: 20, borderRadius: 4, objectFit: 'cover' }} />
                      )}
                      <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name}
                      </span>
                    </div>
                  ))}
                  {s.products.length > 6 && (
                    <div style={{
                      background: '#e0e0e0', borderRadius: 8, padding: '4px 10px',
                      fontSize: 12, color: '#666', fontWeight: 600,
                    }}>
                      +{s.products.length - 6}
                    </div>
                  )}
                </div>
              </div>
            )}

            {canEdit && (
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button onClick={() => startEdit(s)} style={{
                  fontSize: 12, padding: '6px 14px', borderRadius: 6, border: '1px solid #e0e0e0',
                  background: '#fff', cursor: 'pointer', color: '#555', fontWeight: 600,
                }}>Изменить</button>
                <button onClick={() => del(s._id)} style={{
                  fontSize: 12, padding: '6px 14px', borderRadius: 6, border: '1px solid #fcc',
                  background: '#fff8f8', cursor: 'pointer', color: '#c00', fontWeight: 600,
                }}>Удалить</button>
              </div>
            )}
          </div>
        ))}

        {suppliers.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px 20px', color: '#ccc' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🤝</div>
            <div style={{ fontSize: 15 }}>Пока нет поставщиков</div>
          </div>
        )}
      </div>

      {editId && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 2000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20, overflowY: 'auto',
          }}
          onClick={e => { if (e.target === e.currentTarget) cancelEdit(); }}
        >
          <div style={{
            background: '#fff', borderRadius: 14, padding: '28px 32px',
            width: 480, maxWidth: '100%', maxHeight: 'calc(100vh - 40px)',
            boxShadow: '0 8px 40px rgba(0,0,0,.18)',
            overflowY: 'auto',
          }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 20px' }}>
              {editId === 'new' ? 'Новый поставщик' : 'Редактировать поставщика'}
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: '#888', fontWeight: 600, marginBottom: 6 }}>ИМЯ / НАЗВАНИЕ</div>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Имя поставщика"
                  style={{ width: '100%', fontSize: 14, border: '1px solid #e0e0e0', borderRadius: 8, padding: '10px 12px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#888', fontWeight: 600, marginBottom: 6 }}>INSTAGRAM</div>
                  <input
                    value={form.instagram}
                    onChange={e => setForm(f => ({ ...f, instagram: e.target.value }))}
                    placeholder="@username"
                    style={{ width: '100%', fontSize: 13, border: '1px solid #e0e0e0', borderRadius: 8, padding: '10px 12px', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#888', fontWeight: 600, marginBottom: 6 }}>ТЕЛЕФОН</div>
                  <input
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+996 XXX XXX XXX"
                    style={{ width: '100%', fontSize: 13, border: '1px solid #e0e0e0', borderRadius: 8, padding: '10px 12px', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: '#888', fontWeight: 600, marginBottom: 6 }}>ЗАМЕТКИ</div>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Дополнительная информация..."
                  rows={2}
                  style={{ width: '100%', fontSize: 13, border: '1px solid #e0e0e0', borderRadius: 8, padding: '10px 12px', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <div style={{ fontSize: 11, color: '#888', fontWeight: 600, marginBottom: 6 }}>
                  КАТАЛОГ ТОВАРОВ ({form.products?.length || 0})
                </div>

                {form.products && form.products.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                    {form.products.map(p => (
                      <div key={p._id} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        background: '#f0f7ff', border: '1px solid #cce0ff',
                        borderRadius: 8, padding: '6px 10px', fontSize: 13,
                      }}>
                        {p.images?.[0] && (
                          <img src={p.images[0]} alt="" style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'cover' }} />
                        )}
                        <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.name}
                        </span>
                        <button
                          onClick={() => removeProduct(p._id)}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: '#c00', fontSize: 16, padding: 0, lineHeight: 1,
                          }}
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ position: 'relative' }}>
                  <input
                    value={productSearch}
                    onChange={e => setProductSearch(e.target.value)}
                    placeholder="Поиск товара для добавления..."
                    style={{ width: '100%', fontSize: 13, border: '1px solid #e0e0e0', borderRadius: 8, padding: '10px 12px', outline: 'none', boxSizing: 'border-box' }}
                  />
                  {searchLoading && (
                    <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#888' }}>
                      ...
                    </div>
                  )}
                </div>

                {productResults.length > 0 && (
                  <div style={{
                    marginTop: 8, border: '1px solid #e0e0e0', borderRadius: 8,
                    maxHeight: 200, overflow: 'auto', background: '#fff',
                  }}>
                    {productResults.map(p => {
                      const already = form.products.some(x => x._id === p._id);
                      return (
                        <div
                          key={p._id}
                          onClick={() => !already && addProduct(p)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '10px 12px', cursor: already ? 'default' : 'pointer',
                            borderBottom: '1px solid #f0f0f0',
                            background: already ? '#f8f8f8' : '#fff',
                            opacity: already ? 0.5 : 1,
                          }}
                        >
                          {p.images?.[0] && (
                            <img src={p.images[0]} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover' }} />
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {p.name}
                            </div>
                            <div style={{ fontSize: 11, color: '#888' }}>
                              {p.brand} · {p.set}
                            </div>
                          </div>
                          {already && (
                            <span style={{ fontSize: 11, color: '#888' }}>Добавлен</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
              <button onClick={cancelEdit} style={{
                padding: '10px 22px', borderRadius: 8, border: '1px solid #e0e0e0',
                background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#555',
              }}>Отмена</button>
              <button onClick={save} disabled={saving || !form.name?.trim()} style={{
                padding: '10px 22px', borderRadius: 8, border: 'none',
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
