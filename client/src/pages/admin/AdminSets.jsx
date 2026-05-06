import { useState, useEffect } from 'react';
import { adminGetFacets } from '../../api';

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

const BRANDS = [
  { key: 'matkasym-home',  label: 'HOME',  color: '#DC1E24' },
  { key: 'matkasym-shaar', label: 'SHAAR', color: '#3463A3' },
];

function toTitle(slug) {
  return SET_NAMES[slug] || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function SetRow({ index, name, accent }) {
  const even = index % 2 === 0;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 16px',
      background: even ? '#f8f9fb' : '#fff',
      borderRadius: 6,
    }}>
      <span style={{ width: 24, textAlign: 'right', fontWeight: 700, fontSize: 14, color: accent, flexShrink: 0 }}>
        {index + 1}
      </span>
      <span style={{ color: '#999', fontSize: 15 }}>|</span>
      <span style={{ fontSize: 15, color: '#1c1c1c' }}>{name}</span>
    </div>
  );
}

function BrandSection({ label, sets, color, loading }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: '36px 40px', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: -1, color: '#1c1c1c', lineHeight: 1 }}>
          {label}
        </div>
        <div style={{ height: 3, width: 60, background: color, borderRadius: 2, margin: '10px 0 10px' }} />
        <div style={{ fontSize: 13, color: '#6b8997' }}>
          Линейки <span style={{ fontWeight: 700, color }}>сетов</span>
        </div>
      </div>

      {/* List */}
      {loading
        ? <div style={{ color: '#aaa', fontSize: 14 }}>Загрузка…</div>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {sets.map((s, i) => <SetRow key={s} index={i} name={toTitle(s)} accent={color} />)}
          </div>
        )
      }
    </div>
  );
}

function KyzmatSection() {
  const color = '#267846';
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: '36px 40px', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: -1, color: '#1c1c1c', lineHeight: 1 }}>
          KYZMAT
        </div>
        <div style={{ height: 3, width: 60, background: color, borderRadius: 2, margin: '10px 0 10px' }} />
        <div style={{ fontSize: 13, color: '#6b8997' }}>
          Линейки <span style={{ fontWeight: 700, color }}>сетов</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {KYZMAT.map((set, i) => (
          <div key={set.name}>
            {/* Set header row */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 16px',
              background: '#eef3ef',
              borderRadius: 6,
            }}>
              <span style={{ width: 24, textAlign: 'right', fontWeight: 700, fontSize: 14, color, flexShrink: 0 }}>
                {i + 1}
              </span>
              <span style={{ color: '#999', fontSize: 15 }}>|</span>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#1c1c1c' }}>{set.name}</span>
            </div>

            {/* Sub-items */}
            <div style={{ paddingLeft: 52, marginTop: 3, marginBottom: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {set.subs.map(sub => (
                <div key={sub} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
                  <div style={{ width: 3, height: 18, background: color, borderRadius: 2, flexShrink: 0 }} />
                  <span style={{ color: '#888', fontSize: 13 }}>—</span>
                  <span style={{ fontSize: 13, color: '#444' }}>{sub}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminSets() {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all(
      BRANDS.map(b => adminGetFacets({ brand: b.key }).then(r => [b.key, r.data.sets.filter(s => !EXCLUDE.has(s))]))
    ).then(results => {
      setData(Object.fromEntries(results));
      setLoading(false);
    });
  }, []);

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      {/* Page title */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#111' }}>Схема сетов</div>
        <div style={{ fontSize: 13, color: '#aaa', marginTop: 2 }}>Линейки продуктов по брендам</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {BRANDS.map(b => (
          <BrandSection
            key={b.key}
            label={b.label}
            sets={data[b.key] || []}
            color={b.color}
            loading={loading}
          />
        ))}
        <KyzmatSection />
      </div>
    </div>
  );
}
