import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import {
  adminGetFacets,
  adminGetFrontmen, adminCreateFrontman, adminUpdateFrontman, adminDeleteFrontman,
} from '../../api';

// ── constants ──────────────────────────────────────────────────────────────────

const SET_NAMES = {
  'achyk-asman':     'Achyk Asman',
  'den-sooluk':      'Den Sooluk',
  'zhashyl-ömür':    'Zhashyl Ömür',
  'jenil-ashkana':   'Jenil Ashkana',
  'konok-keldi':     'Konok Keldi',
  'korkom-aiym':     'Korkom Aiym',
  'kosh-keliniz':    'Kosh Keliniz',
  'onoi-sakta':      'Onoi Sakta',
  'sanarip-tv':      'Sanarip TV',
  'shirin-balalyk':  'Shirin Balalyk',
  'taza-kiym':       'Taza Kiym',
  'uydo-ishtoo':     'Uydo Ishtoo',
  'mazza-seiyl':     'Mazza Seiyl',
  '0-tashtandy':     '0-TASHTANDY',
  'bekem-fasad':     'Bekem Fasad',
  'bilim-kelechek':  'Bilim Kelechek',
  'kooz-koopsuzduk': 'Kooz Koopsuzduk',
  'uzak-koldon':     'Uzak Koldon',
};

const EXCLUDE = new Set(['nelikvid', 'samples', 'small-batch', 'misc', 'equipment', 'other']);

const KYZMAT = [
  { name: 'Önügüü Set', subs: ['Лазер', 'Гибка', 'Сварка', 'Труборез', 'Покраска'] },
  { name: 'Dayar Tütük', subs: ['Трубопрокат'] },
];

const BRAND_META = {
  'matkasym-home':  { label: 'HOME',  accent: '#DC1E24' },
  'matkasym-shaar': { label: 'SHAAR', accent: '#3463A3' },
};

const PALETTE = ['#E74C3C','#3498DB','#2ECC71','#F39C12','#9B59B6','#1ABC9C','#E67E22','#34495E'];

function toTitle(slug) {
  return SET_NAMES[slug] || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── BrandSection ──────────────────────────────────────────────────────────────

function BrandSection({ brandKey, sets, accent }) {
  const [frontmen, setFrontmen] = useState([]);
  const [editing, setEditing]   = useState(false);
  const [draft, setDraft]       = useState([]);   // local edit copy
  const [saving, setSaving]     = useState(false);
  const containerRef = useRef();
  const setRefs      = useRef({});
  const fmRefs       = useRef({});
  const [lines, setLines] = useState([]);
  const linesSig     = useRef('');

  // load frontmen
  const loadFrontmen = useCallback(() => {
    adminGetFrontmen(brandKey).then(r => setFrontmen(r.data));
  }, [brandKey]);

  useEffect(() => { loadFrontmen(); }, [loadFrontmen]);

  // derive assignment map: setSlug → frontman._id
  const assignMap = {};
  frontmen.forEach(fm => fm.sets.forEach(s => { assignMap[s] = fm._id; }));

  // ── SVG lines (only update when positions actually change) ─
  useLayoutEffect(() => {
    if (!containerRef.current || editing) {
      if (linesSig.current !== '__clear__') {
        linesSig.current = '__clear__';
        setLines([]);
      }
      return;
    }
    const base = containerRef.current.getBoundingClientRect();
    const newLines = [];

    sets.forEach(slug => {
      const fmId = assignMap[slug];
      if (!fmId) return;
      const se = setRefs.current[slug];
      const fe = fmRefs.current[fmId];
      if (!se || !fe) return;
      const sr = se.getBoundingClientRect();
      const fr = fe.getBoundingClientRect();
      const x1 = Math.round(sr.right  - base.left);
      const y1 = Math.round(sr.top    + sr.height / 2 - base.top);
      const x2 = Math.round(fr.left   - base.left);
      const y2 = Math.round(fr.top    + fr.height / 2 - base.top);
      const fm = frontmen.find(f => f._id === fmId);
      newLines.push({ x1, y1, x2, y2, color: fm?.color || '#aaa', key: slug });
    });

    const sig = JSON.stringify(newLines);
    if (sig !== linesSig.current) {
      linesSig.current = sig;
      setLines(newLines);
    }
  });

  // ── edit helpers ──────────────────────────────────────────
  function startEdit() {
    setDraft(frontmen.map(f => ({ ...f, sets: [...f.sets] })));
    setEditing(true);
  }
  function cancelEdit() { setEditing(false); }

  async function saveEdit() {
    setSaving(true);
    try {
      await Promise.all(draft.map(f =>
        adminUpdateFrontman(f._id, { name: f.name, sets: f.sets, instagram: f.instagram, color: f.color })
      ));
      await loadFrontmen();
      setEditing(false);
    } finally { setSaving(false); }
  }

  async function addFrontman() {
    const color = PALETTE[draft.length % PALETTE.length];
    const res = await adminCreateFrontman({ name: `Фронтмен ${draft.length + 1}`, brand: brandKey, sets: [], color });
    setDraft(d => [...d, { ...res.data, sets: [] }]);
  }

  async function deleteFrontman(id) {
    await adminDeleteFrontman(id);
    setDraft(d => d.filter(f => f._id !== id));
  }

  function setDraftName(id, val) {
    setDraft(d => d.map(f => f._id === id ? { ...f, name: val } : f));
  }
  function setDraftInsta(id, val) {
    setDraft(d => d.map(f => f._id === id ? { ...f, instagram: val } : f));
  }
  function setDraftColor(id, val) {
    setDraft(d => d.map(f => f._id === id ? { ...f, color: val } : f));
  }
  function assignSetTo(slug, fmId) {
    setDraft(d => d.map(f => ({
      ...f,
      sets: fmId === f._id
        ? (f.sets.includes(slug) ? f.sets : [...f.sets, slug])
        : f.sets.filter(s => s !== slug),
    })));
  }

  // for edit mode, derive live assignment from draft
  const draftAssign = {};
  (editing ? draft : frontmen).forEach(fm => fm.sets.forEach(s => { draftAssign[s] = fm._id; }));
  const activeFrontmen = editing ? draft : frontmen;

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: '32px 36px', boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 46, fontWeight: 800, letterSpacing: -1, color: '#1c1c1c', lineHeight: 1 }}>
            {BRAND_META[brandKey].label}
          </div>
          <div style={{ height: 3, width: 55, background: accent, borderRadius: 2, margin: '10px 0 8px' }} />
          <div style={{ fontSize: 13, color: '#6b8997' }}>
            Линейки <span style={{ fontWeight: 700, color: accent }}>сетов</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          {editing ? (
            <>
              <button onClick={addFrontman} style={btnStyle('#f0f4ff','#3463A3')}>+ Фронтмен</button>
              <button onClick={cancelEdit} style={btnStyle('#f5f5f5','#555')}>Отмена</button>
              <button onClick={saveEdit} disabled={saving} style={btnStyle(accent,'#fff',true)}>
                {saving ? '…' : 'Сохранить'}
              </button>
            </>
          ) : (
            <button onClick={startEdit} style={btnStyle('#f5f5f5','#333')}>✏️ Изменить</button>
          )}
        </div>
      </div>

      {/* Two-column + SVG lines */}
      <div ref={containerRef} style={{ position: 'relative' }}>
        {/* SVG overlay */}
        {!editing && (
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
            {lines.map(l => (
              <path key={l.key}
                d={`M ${l.x1} ${l.y1} C ${l.x1 + 40} ${l.y1}, ${l.x2 - 40} ${l.y2}, ${l.x2} ${l.y2}`}
                stroke={l.color} strokeWidth={1.5} fill="none" strokeOpacity={0.5} strokeDasharray="4 3"
              />
            ))}
          </svg>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 32, alignItems: 'start' }}>

          {/* Sets column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {sets.map((slug, i) => {
              const fmId  = editing ? draftAssign[slug] : assignMap[slug];
              const fm    = activeFrontmen.find(f => f._id === fmId);
              const color = fm?.color || '#ddd';
              const even  = i % 2 === 0;
              return (
                <div
                  key={slug}
                  ref={el => { setRefs.current[slug] = el; }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                    background: even ? '#f8f9fb' : '#fff', borderRadius: 6,
                    borderLeft: `3px solid ${fm ? color : 'transparent'}`,
                  }}
                >
                  <span style={{ width: 22, textAlign: 'right', fontWeight: 700, fontSize: 13, color: accent, flexShrink: 0 }}>
                    {i + 1}
                  </span>
                  <span style={{ color: '#bbb', fontSize: 14 }}>|</span>
                  <span style={{ fontSize: 14, color: '#1c1c1c', flex: 1 }}>{toTitle(slug)}</span>

                  {editing && (
                    <select
                      value={fmId || ''}
                      onChange={e => assignSetTo(slug, e.target.value || null)}
                      style={{ fontSize: 12, border: '1px solid #e0e0e0', borderRadius: 4, padding: '2px 6px', color: '#444', background: '#fff' }}
                    >
                      <option value="">— не назначен</option>
                      {draft.map(f => <option key={f._id} value={f._id}>{f.name}</option>)}
                    </select>
                  )}
                </div>
              );
            })}
          </div>

          {/* Frontmen column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {activeFrontmen.map(fm => (
              <div
                key={fm._id}
                ref={el => { fmRefs.current[fm._id] = el; }}
                style={{ borderRadius: 8, border: `2px solid ${fm.color}20`, background: `${fm.color}08`,
                  padding: '12px 14px', position: 'relative' }}
              >
                {/* Color dot */}
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: fm.color,
                  position: 'absolute', left: -6, top: '50%', transform: 'translateY(-50%)',
                  boxShadow: `0 0 0 2px white` }} />

                {editing ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="color" value={fm.color} onChange={e => setDraftColor(fm._id, e.target.value)}
                        style={{ width: 24, height: 24, border: 'none', cursor: 'pointer', borderRadius: 4, padding: 0 }} />
                      <input value={fm.name} onChange={e => setDraftName(fm._id, e.target.value)}
                        style={{ flex: 1, fontSize: 13, fontWeight: 700, border: '1px solid #e0e0e0',
                          borderRadius: 4, padding: '4px 8px' }} />
                      <button onClick={() => deleteFrontman(fm._id)}
                        style={{ color: '#c00', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>✕</button>
                    </div>
                    <input value={fm.instagram || ''} onChange={e => setDraftInsta(fm._id, e.target.value)}
                      placeholder="@instagram"
                      style={{ fontSize: 11, border: '1px solid #e8e8e8', borderRadius: 4, padding: '3px 8px', color: '#888' }} />
                  </div>
                ) : (
                  <>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#1c1c1c' }}>{fm.name}</div>
                    {fm.instagram && (
                      <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{fm.instagram}</div>
                    )}
                    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {fm.sets.map(s => (
                        <div key={s} style={{ fontSize: 11, color: fm.color, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 4, height: 4, borderRadius: '50%', background: fm.color, flexShrink: 0, display: 'inline-block' }} />
                          {toTitle(s)}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}

            {!editing && frontmen.length === 0 && (
              <div style={{ fontSize: 12, color: '#bbb', textAlign: 'center', padding: '20px 0' }}>
                Нет фронтменов
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── KYZMAT (static, no frontmen) ──────────────────────────────────────────────

function KyzmatSection() {
  const accent = '#267846';
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: '32px 36px', boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 46, fontWeight: 800, letterSpacing: -1, color: '#1c1c1c', lineHeight: 1 }}>KYZMAT</div>
        <div style={{ height: 3, width: 55, background: accent, borderRadius: 2, margin: '10px 0 8px' }} />
        <div style={{ fontSize: 13, color: '#6b8997' }}>
          Линейки <span style={{ fontWeight: 700, color: accent }}>сетов</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {KYZMAT.map((set, i) => (
          <div key={set.name}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: '#eef3ef', borderRadius: 6 }}>
              <span style={{ width: 22, textAlign: 'right', fontWeight: 700, fontSize: 13, color: accent, flexShrink: 0 }}>{i + 1}</span>
              <span style={{ color: '#bbb', fontSize: 14 }}>|</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#1c1c1c' }}>{set.name}</span>
            </div>
            <div style={{ paddingLeft: 46, marginTop: 3, marginBottom: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {set.subs.map(sub => (
                <div key={sub} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                  <div style={{ width: 3, height: 16, background: accent, borderRadius: 2 }} />
                  <span style={{ color: '#aaa', fontSize: 12 }}>—</span>
                  <span style={{ fontSize: 12, color: '#555' }}>{sub}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── helper ────────────────────────────────────────────────────────────────────

function btnStyle(bg, color, bold) {
  return {
    padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
    background: bg, color, fontWeight: bold ? 700 : 500, fontSize: 13,
  };
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function AdminSets() {
  const [sets, setSets] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all(
      Object.keys(BRAND_META).map(k =>
        adminGetFacets({ brand: k }).then(r => [k, r.data.sets.filter(s => !EXCLUDE.has(s))])
      )
    ).then(res => {
      setSets(Object.fromEntries(res));
      setLoading(false);
    });
  }, []);

  return (
    <div style={{ maxWidth: 780, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#111' }}>Схема сетов</div>
        <div style={{ fontSize: 13, color: '#aaa', marginTop: 2 }}>Линейки по брендам и их фронтмены</div>
      </div>

      {loading ? (
        <div style={{ color: '#aaa', fontSize: 14 }}>Загрузка…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {Object.entries(BRAND_META).map(([key, meta]) => (
            <BrandSection key={key} brandKey={key} sets={sets[key] || []} accent={meta.accent} />
          ))}
          <KyzmatSection />
        </div>
      )}
    </div>
  );
}
