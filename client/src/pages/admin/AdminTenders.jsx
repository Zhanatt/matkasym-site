import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminGetTenders, adminAssignTender, adminGetUsers, adminUpdateProduct } from '../../api';

const STATUS_META = {
  improvement:    { label: 'На улучшении',  color: '#F39C12', bg: '#fff8e1' },
  in_development: { label: 'В разработке',  color: '#3463A3', bg: '#e8f0fb' },
};

const BRAND_LABELS = {
  'matkasym-home':   'HOME',
  'matkasym-shaar':  'SHAAR',
  'matkasym-kyzmat': 'KYZMAT',
};

const SEL = {
  padding: '6px 10px', borderRadius: 7, border: '1.5px solid #e0e0e0',
  fontSize: 12, background: '#fff', cursor: 'pointer', outline: 'none', color: '#333',
};

function avatar(name = '') {
  return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function TZBlock({ product }) {
  const [open, setOpen] = useState(false);
  const { productStatus, developmentTZ, improvementTZ, developmentStage } = product;

  const hasTZ = productStatus === 'in_development'
    ? (developmentTZ?.description || developmentTZ?.files?.length)
    : (improvementTZ?.problem || improvementTZ?.solution || improvementTZ?.files?.length);

  if (!hasTZ) return (
    <div style={{ fontSize: 12, color: '#bbb', fontStyle: 'italic', marginTop: 6 }}>ТЗ не заполнено</div>
  );

  return (
    <div style={{ marginTop: 6 }}>
      <button onClick={() => setOpen(v => !v)} style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        fontSize: 12, color: '#3463A3', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
      }}>
        <span>{open ? '▾' : '▸'}</span> ТЗ {open ? 'скрыть' : 'показать'}
      </button>
      {open && (
        <div style={{ marginTop: 8, padding: '10px 12px', background: '#f8f9fb', borderRadius: 8, fontSize: 12, lineHeight: 1.6 }}>
          {productStatus === 'in_development' ? (
            <>
              {developmentStage && <div style={{ marginBottom: 4 }}><b>Этап:</b> {developmentStage}</div>}
              {developmentTZ?.description && <div style={{ whiteSpace: 'pre-wrap' }}><b>Описание:</b><br />{developmentTZ.description}</div>}
            </>
          ) : (
            <>
              {improvementTZ?.problem  && <div style={{ marginBottom: 4, whiteSpace: 'pre-wrap' }}><b>Проблема:</b><br />{improvementTZ.problem}</div>}
              {improvementTZ?.solution && <div style={{ whiteSpace: 'pre-wrap' }}><b>Решение:</b><br />{improvementTZ.solution}</div>}
            </>
          )}
          {((productStatus === 'in_development' ? developmentTZ : improvementTZ)?.files || []).map((f, i) => (
            <div key={i} style={{ marginTop: 4 }}>
              <a href={f.url} target="_blank" rel="noreferrer" style={{ color: '#3463A3', fontSize: 11 }}>📎 {f.name}</a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AssigneeBlock({ product, users, onAssigned }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { tenderAssignee } = product;
  const assigned = tenderAssignee?.userId;

  const assign = async (userId) => {
    setLoading(true);
    try {
      await adminAssignTender(product._id, userId || null);
      onAssigned(product._id, userId);
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f0f0f0', position: 'relative' }}>
      {assigned ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#3463A3', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
            {avatar(tenderAssignee.userName)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{tenderAssignee.userName}</div>
            <div style={{ fontSize: 11, color: '#aaa' }}>{tenderAssignee.userEmail}</div>
          </div>
          <button onClick={() => setOpen(v => !v)} disabled={loading} style={{ ...SEL, fontSize: 11, padding: '4px 8px' }}>
            Сменить
          </button>
          <button onClick={() => assign(null)} disabled={loading} style={{
            background: 'none', border: '1.5px solid #f5c6cb', borderRadius: 7, cursor: 'pointer',
            fontSize: 11, color: '#c00', padding: '4px 8px',
          }}>
            Снять
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 12, color: '#aaa', flex: 1 }}>Ответственный не назначен</div>
          <button onClick={() => setOpen(v => !v)} disabled={loading} style={{
            background: '#3463A3', color: '#fff', border: 'none', borderRadius: 7,
            cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: '5px 12px',
          }}>
            + Назначить
          </button>
        </div>
      )}

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', zIndex: 100, marginTop: 4,
          background: '#fff', border: '1px solid #e0e0e0', borderRadius: 10,
          boxShadow: '0 4px 20px rgba(0,0,0,.12)', minWidth: 220, maxHeight: 260, overflowY: 'auto',
        }}>
          <div style={{ padding: '6px 12px', fontSize: 11, color: '#aaa', fontWeight: 600, borderBottom: '1px solid #f0f0f0', textTransform: 'uppercase' }}>Выберите пользователя</div>
          {users.map(u => (
            <div key={u._id} onClick={() => assign(u._id)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f9f9f9' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f5f8ff'}
              onMouseLeave={e => e.currentTarget.style.background = ''}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#3463A3', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                {avatar(u.name)}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{u.name}</div>
                <div style={{ fontSize: 11, color: '#aaa' }}>{u.email}</div>
              </div>
            </div>
          ))}
          {users.length === 0 && <div style={{ padding: '12px', fontSize: 12, color: '#aaa', textAlign: 'center' }}>Нет пользователей</div>}
        </div>
      )}
    </div>
  );
}

export default function AdminTenders() {
  const navigate = useNavigate();
  const [tenders,   setTenders]   = useState([]);
  const [users,     setUsers]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState('all');   // all | improvement | in_development
  const [search,    setSearch]    = useState('');
  const [searchVal, setSearchVal] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const params = {};
    if (filter !== 'all') params.status = filter;
    if (search) params.search = search;
    adminGetTenders(params)
      .then(r => setTenders(r.data))
      .catch(() => setTenders([]))
      .finally(() => setLoading(false));
  }, [filter, search]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    adminGetUsers().then(r => {
      const admins = (r.data || []).filter(u => ['owner','editor','viewer'].includes(u.role));
      setUsers(admins);
    }).catch(() => {});
  }, []);

  const handleComplete = async (productId) => {
    try {
      await adminUpdateProduct(productId, { productStatus: 'for_sale' });
      setTenders(prev => prev.filter(p => p._id !== productId));
    } catch {}
  };

  const handleAssigned = (productId, userId) => {
    setTenders(prev => prev.map(p => {
      if (p._id !== productId) return p;
      if (!userId) return { ...p, tenderAssignee: { userId: null, userName: '', userEmail: '', assignedAt: null } };
      const user = users.find(u => u._id === userId);
      return { ...p, tenderAssignee: { userId, userName: user?.name || '', userEmail: user?.email || '', assignedAt: new Date() } };
    }));
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchVal);
  };

  const grouped = {
    improvement:    tenders.filter(t => t.productStatus === 'improvement'),
    in_development: tenders.filter(t => t.productStatus === 'in_development'),
  };

  const stats = {
    all:            tenders.length,
    improvement:    grouped.improvement.length,
    in_development: grouped.in_development.length,
    assigned:       tenders.filter(t => t.tenderAssignee?.userId).length,
    unassigned:     tenders.filter(t => !t.tenderAssignee?.userId).length,
  };

  const displayList = filter === 'all' ? tenders : tenders.filter(t => t.productStatus === filter);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', paddingBottom: 18, borderBottom: '1px solid #eee', marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#111' }}>🎯 Тендеры</div>
          <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>Товары на улучшении и в разработке</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ background: '#fff8e1', borderRadius: 8, padding: '6px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#aaa', fontWeight: 600 }}>УЛУЧШЕНИЕ</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#F39C12' }}>{stats.improvement}</div>
          </div>
          <div style={{ background: '#e8f0fb', borderRadius: 8, padding: '6px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#aaa', fontWeight: 600 }}>РАЗРАБОТКА</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#3463A3' }}>{stats.in_development}</div>
          </div>
          <div style={{ background: '#e8f5e9', borderRadius: 8, padding: '6px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#aaa', fontWeight: 600 }}>НАЗНАЧЕНО</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#1e7e34' }}>{stats.assigned}</div>
          </div>
          <div style={{ background: '#fce4ec', borderRadius: 8, padding: '6px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#aaa', fontWeight: 600 }}>СВОБОДНО</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#c62828' }}>{stats.unassigned}</div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20, alignItems: 'center' }}>
        <div style={{ display: 'flex', background: '#f5f5f5', borderRadius: 8, padding: 3, gap: 0 }}>
          {[
            { k: 'all',            l: `Все (${stats.all})` },
            { k: 'improvement',    l: `На улучшении (${stats.improvement})` },
            { k: 'in_development', l: `В разработке (${stats.in_development})` },
          ].map(opt => (
            <button key={opt.k} onClick={() => setFilter(opt.k)} style={{
              padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
              background: filter === opt.k ? '#111' : 'transparent',
              color:      filter === opt.k ? '#fff' : '#666',
            }}>{opt.l}</button>
          ))}
        </div>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 6 }}>
          <input
            value={searchVal}
            onChange={e => setSearchVal(e.target.value)}
            placeholder="Поиск товара…"
            style={{ ...SEL, width: 200 }}
          />
          <button type="submit" style={{ ...SEL, background: '#111', color: '#fff', border: 'none', fontWeight: 600 }}>
            Найти
          </button>
          {search && (
            <button type="button" onClick={() => { setSearch(''); setSearchVal(''); }} style={{ ...SEL, color: '#888' }}>
              ✕
            </button>
          )}
        </form>
      </div>

      {loading && <div style={{ textAlign: 'center', color: '#aaa', paddingTop: 60, fontSize: 14 }}>Загрузка…</div>}

      {!loading && displayList.length === 0 && (
        <div style={{ textAlign: 'center', color: '#bbb', paddingTop: 60, fontSize: 14 }}>
          Тендеров нет
        </div>
      )}

      {!loading && displayList.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
          {displayList.map((product, i) => {
            const sm = STATUS_META[product.productStatus] || STATUS_META.improvement;
            const img = product.driveImages?.[0]
              ? `https://drive.google.com/thumbnail?id=${product.driveImages[0]}&sz=w120`
              : product.images?.[0] || null;

            return (
              <div key={product._id} style={{ background: '#fff', border: '1px solid #eee', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', boxShadow: '0 2px 8px rgba(0,0,0,.04)' }}>
                {/* Top row */}
                <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                  {img && (
                    <img src={img} alt="" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover', flexShrink: 0, background: '#f5f5f5' }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: sm.bg, color: sm.color }}>
                        {sm.label}
                      </span>
                      {product.set && (
                        <span style={{ fontSize: 10, color: '#aaa', padding: '2px 8px', borderRadius: 20, border: '1px solid #eee' }}>
                          {product.set}
                        </span>
                      )}
                    </div>
                    <div
                      onClick={() => navigate(`/admin/products/${product._id}`)}
                      style={{ fontSize: 14, fontWeight: 700, color: '#111', cursor: 'pointer', lineHeight: 1.3 }}
                      title={product.fullName}
                    >
                      {product.fullName || product.name}
                    </div>
                    {product.sku && <div style={{ fontSize: 11, color: '#bbb', marginTop: 2 }}>SKU: {product.sku}</div>}
                  </div>
                </div>

                {/* TZ */}
                <TZBlock product={product} />

                {/* Assignee */}
                <AssigneeBlock product={product} users={users} onAssigned={handleAssigned} />

                {/* Complete button */}
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f0f0f0' }}>
                  <button onClick={() => handleComplete(product._id)} style={{
                    width: '100%', padding: '8px 0', borderRadius: 8, border: 'none',
                    background: '#e8f5e9', color: '#1e7e34', fontWeight: 700, fontSize: 13,
                    cursor: 'pointer', letterSpacing: 0.2,
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = '#c8e6c9'}
                    onMouseLeave={e => e.currentTarget.style.background = '#e8f5e9'}>
                    ✓ Завершить
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
