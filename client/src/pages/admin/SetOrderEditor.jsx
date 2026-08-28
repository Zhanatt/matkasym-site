import { useState } from 'react';
import { adminSaveSetLayout } from '../../api';

// Порядок категорий в сете. Раньше он лежал захардкоженным объектом в коде и
// каждая перестановка стоила правки с деплоем — теперь владелец двигает сам.
//
// Двигаем стрелками, а не перетаскиванием: список открывается в модалке поверх
// прокручиваемого каталога, и родное HTML5-перетаскивание там воюет со скроллом
// страницы. Стрелка попадает с первого раза и работает с клавиатуры.
export default function SetOrderEditor({ brand, set, categories, onSave, onClose }) {
  // Категории приходят в том порядке, в каком сейчас нарисованы на странице,
  // — значит редактор открывается ровно на том, что человек видит.
  const [list, setList]   = useState(categories);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
  };

  const save = async () => {
    setSaving(true); setError('');
    try {
      const r = await adminSaveSetLayout(brand, set, list);
      onSave(r.data.categories || list);
      onClose();
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Не удалось сохранить');
      setSaving(false);
    }
  };

  const btn = (on) => ({
    width: 30, height: 28, borderRadius: 7, cursor: on ? 'pointer' : 'default',
    border: '1.5px solid ' + (on ? '#d3d9e0' : '#eef0f3'),
    background: '#fff', color: on ? '#3463A3' : '#dde2e7',
    fontSize: 13, lineHeight: 1, padding: 0,
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
        background: 'rgba(17,20,24,.45)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 14, width: 'min(460px, 100%)',
          maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 12px 40px rgba(0,0,0,.25)',
        }}
      >
        <div style={{ padding: '16px 18px 10px' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#111' }}>Порядок категорий</div>
          <div style={{ fontSize: 11, color: '#aab3bd', marginTop: 3, lineHeight: 1.5 }}>
            Сверху вниз — как они пойдут на странице сета и в PDF.
            «Прочее» и «Нет в наличии» всегда идут последними.
          </div>
        </div>

        <div style={{ overflowY: 'auto', padding: '0 18px', flex: 1 }}>
          {list.map((cat, i) => (
            <div key={cat} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 0', borderBottom: '1px solid #f4f6f8',
            }}>
              <span style={{
                width: 22, fontSize: 11, color: '#aab3bd',
                fontVariantNumeric: 'tabular-nums',
              }}>{i + 1}</span>
              <span style={{ flex: 1, fontSize: 13, color: '#111', fontWeight: 600 }}>{cat}</span>
              <button style={btn(i > 0)}            onClick={() => move(i, -1)} disabled={i === 0}>▲</button>
              <button style={btn(i < list.length - 1)} onClick={() => move(i, 1)} disabled={i === list.length - 1}>▼</button>
            </div>
          ))}
          {!list.length && (
            <div style={{ fontSize: 13, color: '#aab3bd', padding: '10px 0' }}>
              В этом сете пока нет категорий с товарами.
            </div>
          )}
        </div>

        {error && (
          <div style={{ padding: '8px 18px 0', fontSize: 12, color: '#c0392b' }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '12px 18px 16px' }}>
          <button onClick={onClose} style={{
            padding: '8px 14px', borderRadius: 9, border: '1.5px solid #e0e0e0',
            background: '#fff', color: '#555', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>Отмена</button>
          <button onClick={save} disabled={saving || !list.length} style={{
            padding: '8px 16px', borderRadius: 9, border: 'none',
            background: saving ? '#9bb3d4' : '#3463A3', color: '#fff',
            fontSize: 13, fontWeight: 700, cursor: saving ? 'default' : 'pointer',
          }}>{saving ? 'Сохраняю...' : 'Сохранить'}</button>
        </div>
      </div>
    </div>
  );
}
