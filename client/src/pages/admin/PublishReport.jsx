import { useState, useEffect } from 'react';
import { socialGetReport } from '../../api';

// Кто сколько публикаций сделал, с разбивкой по дням.
// Журнал показывает записи сплошным списком и на вопрос «сколько за неделю
// сделала Мадина» не отвечает — этот блок отвечает.

const PERIODS = [
  { days: 7,   label: 'Неделя' },
  { days: 30,  label: 'Месяц' },
  { days: 0,   label: 'Всё время' },
];

const ROLE = { designer: 'дизайнер', owner: 'владелец', editor: 'редактор', viewer: 'сотрудник' };

// '2026-08-10' → «10.08, пн». Разбираем строку руками, а не new Date(s):
// строка вида '2026-08-10' читается как полночь UTC и в минусовых поясах
// показала бы предыдущий день.
function dayLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const wd = dt.toLocaleDateString('ru-RU', { weekday: 'short' });
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}, ${wd}`;
}

export default function PublishReport() {
  const [days,    setDays]    = useState(30);
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [open,    setOpen]    = useState(true);

  useEffect(() => {
    setLoading(true);
    socialGetReport(days)
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [days]);

  const people = data?.people || [];
  const byDay  = data?.byDay  || [];
  const max    = Math.max(1, ...people.map(p => p.publications));

  const th = {
    padding: '8px 10px', fontSize: 11, color: '#8b98a5', fontWeight: 700,
    textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '1.5px solid #eef0f3',
  };
  const td = {
    padding: '7px 10px', fontSize: 12, textAlign: 'right',
    fontVariantNumeric: 'tabular-nums', borderBottom: '1px solid #f4f6f8',
  };

  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 1px 6px rgba(0,0,0,.07)', marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button onClick={() => setOpen(o => !o)} style={{
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          fontSize: 15, fontWeight: 800, color: '#111',
        }}>
          {open ? '▾' : '▸'} 📊 Статистика
        </button>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {PERIODS.map(p => (
            <button key={p.days} onClick={() => setDays(p.days)} style={{
              padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: days === p.days ? '1.5px solid #3463A3' : '1.5px solid #e0e0e0',
              background: days === p.days ? '#eef2f7' : '#fff',
              color: days === p.days ? '#3463A3' : '#555',
            }}>{p.label}</button>
          ))}
        </div>
      </div>

      {!open ? null : loading ? (
        <div style={{ fontSize: 13, color: '#aaa', marginTop: 14 }}>Загрузка...</div>
      ) : !people.length ? (
        <div style={{ fontSize: 13, color: '#999', marginTop: 14 }}>За этот период публикаций не было.</div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: '#8b98a5', margin: '10px 0 16px' }}>
            <b style={{ color: '#111', fontSize: 14 }}>{data.totals.publications}</b> публикаций
            {' · '}{data.totals.posts} постов на площадках
            {' · '}{people.length} {people.length === 1 ? 'сотрудник' : 'сотрудников'}
          </div>

          {/* Кто сколько — полоски нагляднее колонки цифр */}
          {people.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
              <div style={{ width: 110, fontSize: 12, fontWeight: 700, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.name}
              </div>
              <div style={{ width: 66, fontSize: 10, color: '#aab3bd' }}>{ROLE[p.role] || p.role}</div>
              <div style={{ flex: 1, minWidth: 60, background: '#f2f4f7', borderRadius: 5, height: 14, overflow: 'hidden' }}>
                <div style={{ width: `${(p.publications / max) * 100}%`, height: '100%', background: '#3463A3', borderRadius: 5 }} />
              </div>
              <div style={{ width: 34, fontSize: 12, fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {p.publications}
              </div>
            </div>
          ))}

          {/* Сеты и товары — не выработка за период, а текущая зона ответственности */}
          {!!(data.designers || []).length && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#111', margin: '22px 0 2px' }}>
                Дизайнеры: зона ответственности
              </div>
              <div style={{ fontSize: 11, color: '#aab3bd', marginBottom: 8 }}>
                Сеты и товары — закреплённые сейчас, независимо от выбранного периода
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 380 }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, textAlign: 'left' }}>Дизайнер</th>
                      <th style={th}>Сетов</th>
                      <th style={th}>Товаров</th>
                      <th style={th}>Публикаций</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.designers.map(d => (
                      <tr key={d.id}>
                        <td style={{ ...td, textAlign: 'left', fontWeight: 700, color: '#111' }}>
                          {d.name}
                          {!d.sets && <span style={{ fontWeight: 400, color: '#c0392b', fontSize: 11 }}> · сеты не закреплены</span>}
                        </td>
                        <td style={td}>{d.sets || '—'}</td>
                        <td style={{ ...td, fontWeight: 700 }}>{d.products || '—'}</td>
                        <td style={{ ...td, color: d.publications ? '#3463A3' : '#dde2e7' }}>{d.publications || '—'}</td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{ ...td, textAlign: 'left', color: '#8b98a5' }}>Итого</td>
                      <td style={{ ...td, color: '#8b98a5' }}>{data.designers.reduce((s, d) => s + d.sets, 0)}</td>
                      <td style={{ ...td, color: '#8b98a5', fontWeight: 700 }}>{data.designers.reduce((s, d) => s + d.products, 0)}</td>
                      <td style={{ ...td, color: '#8b98a5' }}>{data.designers.reduce((s, d) => s + d.publications, 0)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div style={{ fontSize: 12, fontWeight: 700, color: '#111', margin: '22px 0 6px' }}>По дням</div>

          {/* Таблица шире экрана на телефоне — пусть скроллится сама, а не тянет страницу */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 380 }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left' }}>Дата</th>
                  {people.map(p => <th key={p.id} style={th}>{p.name}</th>)}
                  <th style={{ ...th, color: '#3463A3' }}>Итого</th>
                </tr>
              </thead>
              <tbody>
                {byDay.map(d => (
                  <tr key={d.date}>
                    <td style={{ ...td, textAlign: 'left', color: '#555', whiteSpace: 'nowrap' }}>{dayLabel(d.date)}</td>
                    {people.map(p => (
                      <td key={p.id} style={{ ...td, color: d.byPerson[p.id] ? '#111' : '#dde2e7' }}>
                        {d.byPerson[p.id] || '—'}
                      </td>
                    ))}
                    <td style={{ ...td, fontWeight: 700, color: '#3463A3' }}>{d.publications}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
