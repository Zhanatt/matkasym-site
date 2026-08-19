import { useState, useEffect, Fragment } from 'react';
import { socialGetReport, socialGetPersonPosts } from '../../api';

// Кто сколько публикаций сделал и что за ним закреплено.
// Журнал показывает записи сплошным списком и на вопрос «сколько за неделю
// сделала Мадина» не отвечает — этот блок отвечает.

const PERIODS = [
  { days: 7,  label: 'Неделя' },
  { days: 30, label: 'Месяц' },
  { days: 0,  label: 'Всё время' },
];

const ROLE = { designer: 'дизайнер', owner: 'владелец', editor: 'редактор', viewer: 'сотрудник' };

const PLATFORM = {
  instagram: { label: 'Instagram', color: '#c13584' },
  facebook:  { label: 'Facebook',  color: '#3b5998' },
  telegram:  { label: 'Telegram',  color: '#229ED9' },
};

// '2026-08-19T...' → «19.08». Дата поста в списке нужна только для порядка,
// год и время там лишний шум.
function shortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// '2026-08-10' → «10.08, пн». Разбираем строку руками, а не new Date(s):
// строка вида '2026-08-10' читается как полночь UTC и в минусовых поясах
// показала бы предыдущий день.
function dayLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const wd = new Date(y, m - 1, d).toLocaleDateString('ru-RU', { weekday: 'short' });
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')} · ${wd}`;
}

// 1 публикация / 2 публикации / 5 публикаций
function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

export default function PublishReport() {
  const [days,    setDays]    = useState(30);
  const [data,    setData]    = useState(null);
  const [leads,   setLeads]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [open,    setOpen]    = useState(true);
  // Раскрытый сотрудник в таблице отклика и его посты. Кэш по ключу
  // «человек+период»: при смене периода цифры другие, старые показывать нельзя.
  const [openPerson, setOpenPerson] = useState(null);
  const [personPosts, setPersonPosts] = useState({});
  const [personLoading, setPersonLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    socialGetReport(days)
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
    // Обращения тянем отдельным запросом: Битрикс отвечает секунды, и ждать его,
    // чтобы показать посты, незачем.
    setLeads(null);
    socialGetLeads(days).then(r => setLeads(r.data)).catch(() => setLeads(null));
  }, [days]);

  // Период сменился — цифры в раскрытом списке уже не те, закрываем.
  useEffect(() => { setOpenPerson(null); }, [days]);

  function togglePerson(uid) {
    if (openPerson === uid) { setOpenPerson(null); return; }
    setOpenPerson(uid);
    const key = `${uid}:${days}`;
    if (personPosts[key]) return;                 // уже загружали
    setPersonLoading(true);
    socialGetPersonPosts(uid, days)
      .then(r => setPersonPosts(prev => ({ ...prev, [key]: r.data.posts || [] })))
      .catch(() => setPersonPosts(prev => ({ ...prev, [key]: [] })))
      .finally(() => setPersonLoading(false));
  }

  const people = data?.people || [];
  const byDay  = data?.byDay  || [];
  const maxPub = Math.max(1, ...people.map(p => p.publications));
  const maxDay = Math.max(1, ...byDay.map(d => d.publications));

  // В таблице отклика — только те, у кого в периоде вообще были посты с цифрами
  const byReactions = people
    .filter(p => p.engagement?.measured)
    .sort((a, b) => b.engagement.reactions - a.engagement.reactions);
  const maxReact = Math.max(1, ...byReactions.map(p => p.engagement.reactions));
  const maxLeads = Math.max(1, ...(leads?.channels || []).map(c => c.leads + c.deals));

  const th = {
    padding: '9px 10px', fontSize: 11, color: '#8b98a5', fontWeight: 700,
    textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '1.5px solid #eef0f3',
  };
  const td = {
    padding: '10px', fontSize: 13, textAlign: 'right',
    fontVariantNumeric: 'tabular-nums', borderBottom: '1px solid #f4f6f8',
  };

  const tile = (value, label, hint) => (
    <div style={{ flex: '1 1 120px', background: '#f7f9fb', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: '#111', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#5c6873', marginTop: 3 }}>{label}</div>
      {hint && <div style={{ fontSize: 10, color: '#aab3bd', marginTop: 2 }}>{hint}</div>}
    </div>
  );

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
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '16px 0 22px' }}>
            {tile(data.totals.publications, 'публикаций', days ? `за ${days} дн.` : 'за всё время')}
            {tile(data.totals.posts, 'постов на площадках', 'одна публикация = несколько постов')}
            {tile(byDay.length, plural(byDay.length, 'день с публикациями', 'дня с публикациями', 'дней с публикациями'))}
          </div>

          {/* Одна таблица: и выработка, и зона ответственности. Разносить их
              по двум спискам значило заставлять сверять цифры глазами. */}
          <div style={{ fontSize: 13, fontWeight: 800, color: '#111', marginBottom: 2 }}>Кто сколько сделал</div>
          <div style={{ fontSize: 11, color: '#aab3bd', marginBottom: 8 }}>
            Публикации — за выбранный период. Сеты и товары — закреплённые сейчас.
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 420 }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left' }}>Сотрудник</th>
                  <th style={{ ...th, textAlign: 'left', width: '38%' }}>Публикаций</th>
                  <th style={th}>Сетов</th>
                  <th style={th}>Товаров</th>
                </tr>
              </thead>
              <tbody>
                {people.map(p => (
                  <tr key={p.id}>
                    <td style={{ ...td, textAlign: 'left' }}>
                      <div style={{ fontWeight: 700, color: '#111' }}>{p.name}</div>
                      <div style={{ fontSize: 10, color: '#aab3bd' }}>{ROLE[p.role] || p.role}</div>
                    </td>
                    <td style={{ ...td, textAlign: 'left' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 40, background: '#f2f4f7', borderRadius: 5, height: 14, overflow: 'hidden' }}>
                          <div style={{ width: `${(p.publications / maxPub) * 100}%`, height: '100%', background: '#3463A3', borderRadius: 5 }} />
                        </div>
                        <b style={{ width: 26, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{p.publications}</b>
                      </div>
                    </td>
                    <td style={{ ...td, color: p.sets ? '#111' : '#dde2e7' }}>{p.sets || '—'}</td>
                    <td style={{ ...td, color: p.products ? '#111' : '#dde2e7', fontWeight: p.products ? 700 : 400 }}>
                      {p.products ? p.products.toLocaleString('ru-RU') : '—'}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td style={{ ...td, textAlign: 'left', color: '#8b98a5', fontWeight: 700 }}>Итого</td>
                  <td style={{ ...td, textAlign: 'left', color: '#8b98a5', fontWeight: 700, paddingLeft: 10 }}>
                    {people.reduce((s, p) => s + p.publications, 0)}
                  </td>
                  <td style={{ ...td, color: '#8b98a5', fontWeight: 700 }}>{people.reduce((s, p) => s + p.sets, 0)}</td>
                  <td style={{ ...td, color: '#8b98a5', fontWeight: 700 }}>
                    {people.reduce((s, p) => s + p.products, 0).toLocaleString('ru-RU')}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Обращения — из Битрикса, по источнику. Стоят рядом с постами
              намеренно: «сделали 342 публикации» и «пришло 55 обращений» значат
              что-то только вместе. Прямой связи «пост → обращение» тут нет —
              метка поста остаётся внутри чата и в CRM не попадает. */}
          {leads && !leads.error && leads.channels?.length > 0 && (
            <>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#111', margin: '26px 0 2px' }}>
                Обращения из Битрикса
              </div>
              <div style={{ fontSize: 11, color: '#aab3bd', marginBottom: 8, lineHeight: 1.5 }}>
                Новые лиды и сделки за тот же период, по источнику обращения.
                Это канал целиком, а не конкретный пост: метку из подписи (#inst_matrix)
                Wazzup оставляет внутри чата, в поля CRM она не попадает.
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 380 }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, textAlign: 'left' }}>Канал</th>
                      <th style={{ ...th, textAlign: 'left', width: '40%' }}>Обращений</th>
                      <th style={th}>Лиды</th>
                      <th style={th}>Сделки</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.channels.map(c => {
                      const all = c.leads + c.deals;
                      return (
                        <tr key={c.key}>
                          <td style={{ ...td, textAlign: 'left', fontWeight: 700, color: '#111' }}>{c.label}</td>
                          <td style={{ ...td, textAlign: 'left' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ flex: 1, minWidth: 40, background: '#f2f4f7', borderRadius: 5, height: 14, overflow: 'hidden' }}>
                                <div style={{ width: `${(all / maxLeads) * 100}%`, height: '100%', background: '#1e7c3a', borderRadius: 5 }} />
                              </div>
                              <b style={{ width: 44, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                {all.toLocaleString('ru-RU')}
                              </b>
                            </div>
                          </td>
                          <td style={{ ...td, color: c.leads ? '#111' : '#dde2e7' }}>{c.leads || '—'}</td>
                          <td style={{ ...td, color: c.deals ? '#111' : '#dde2e7' }}>{c.deals ? c.deals.toLocaleString('ru-RU') : '—'}</td>
                        </tr>
                      );
                    })}
                    <tr>
                      <td style={{ ...td, textAlign: 'left', color: '#8b98a5', fontWeight: 700 }}>Итого</td>
                      <td style={{ ...td, textAlign: 'left', color: '#8b98a5', fontWeight: 700, paddingLeft: 10 }}>
                        {leads.totals.all.toLocaleString('ru-RU')}
                      </td>
                      <td style={{ ...td, color: '#8b98a5', fontWeight: 700 }}>{leads.totals.leads}</td>
                      <td style={{ ...td, color: '#8b98a5', fontWeight: 700 }}>{leads.totals.deals.toLocaleString('ru-RU')}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Обращения на номера из кнопки «Заказать». Привязка не идеальная —
              на эти номера пишут и мимо постов, — но это единственное, что
              отделяет пришедших с публикаций, пока метку не проставляет робот. */}
          {leads?.orderLines?.length > 0 && (
            <div style={{ marginTop: 14, padding: '12px 14px', background: '#f2f7f3', borderRadius: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#111', marginBottom: 2 }}>
                На номера из кнопки «Заказать»
              </div>
              <div style={{ fontSize: 11, color: '#7e8b95', marginBottom: 8 }}>
                Обращения на те номера WhatsApp, которые стоят в подписях постов.
              </div>
              <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
                {leads.orderLines.map(l => (
                  <div key={l.key}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#1e7c3a', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                      {(l.leads + l.deals).toLocaleString('ru-RU')}
                    </div>
                    <div style={{ fontSize: 11, color: '#5c6873' }}>{l.label}</div>
                    <div style={{ fontSize: 10, color: '#aab3bd' }}>+{l.phone}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Метка поста — то, ради чего она в подписи и стоит: обращение можно
              приписать площадке, а не догадываться по источнику. Ставит её робот
              в Битриксе, поэтому блок честно говорит, когда он ещё не настроен. */}
          {leads && !leads.error && leads.byTag && (
            <div style={{ marginTop: 14, padding: '12px 14px', background: '#f7f9fb', borderRadius: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#111', marginBottom: 8 }}>
                По метке из подписи поста
              </div>
              {leads.byTag.tags.some(t => t.leads + t.deals > 0) ? (
                <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
                  {leads.byTag.tags.map(t => (
                    <div key={t.key}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#111', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                        {(t.leads + t.deals).toLocaleString('ru-RU')}
                      </div>
                      <div style={{ fontSize: 11, color: '#5c6873' }}>{t.label}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: '#8b98a5', lineHeight: 1.5 }}>
                  Пока пусто. Метку в сделку ставит робот в Битриксе: поле «Метка поста» заведено,
                  осталось настроить триггер «Входящее сообщение» с условием на текст
                  (#inst_matrix, #tg_matrix, #fb_matrix). Как заработает — обращения появятся здесь
                  с привязкой к площадке, а не к каналу связи.
                </div>
              )}
            </div>
          )}

          {leads?.error && (
            <div style={{ fontSize: 11, color: '#b26a00', margin: '20px 0 0' }}>
              Обращения из Битрикса не получены: {leads.error}
            </div>
          )}

          {/* Отклик — отдельной таблицей от выработки: «сделал много постов» и
              «посты зашли» это два разных вопроса к дизайнеру, и в одной таблице
              на девять колонок их не прочитать. */}
          {data.totals.measured > 0 && (
            <>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#111', margin: '26px 0 2px' }}>
                Отклик на посты
              </div>
              <div style={{ fontSize: 11, color: '#aab3bd', marginBottom: 8, lineHeight: 1.5 }}>
                Реакции — лайки Instagram и все реакции Facebook вместе.
                Отклик — доля откликнувшихся от охвата, считается по Instagram: Facebook охват не отдаёт.
                {data.totals.noData > 0 && ` Постов без цифр: ${data.totals.noData} — удалены с площадки или статистику ещё не собирали.`}
                <b style={{ color: '#8b98a5' }}> Клик по сотруднику — его посты по отдельности.</b>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560 }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, textAlign: 'left' }}>Сотрудник</th>
                      <th style={{ ...th, textAlign: 'left', width: '26%' }}>Реакции</th>
                      <th style={th}>На пост</th>
                      <th style={th}>Комменты</th>
                      <th style={th}>Сохран.</th>
                      <th style={th}>Охват</th>
                      <th style={th}>Отклик</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byReactions.map(p => {
                      const e = p.engagement;
                      const isOpen = openPerson === p.id;
                      const posts  = personPosts[`${p.id}:${days}`];
                      return (
                        <Fragment key={p.id}>
                        <tr
                          onClick={() => togglePerson(p.id)}
                          style={{ cursor: 'pointer', background: isOpen ? '#f7f9fb' : 'transparent' }}
                        >
                          <td style={{ ...td, textAlign: 'left' }}>
                            <div style={{ fontWeight: 700, color: '#111' }}>
                              <span style={{ color: '#aab3bd', marginRight: 5, fontSize: 11 }}>{isOpen ? '▾' : '▸'}</span>
                              {p.name}
                            </div>
                            <div style={{ fontSize: 10, color: '#aab3bd', paddingLeft: 16 }}>
                              {e.measured} {plural(e.measured, 'пост посчитан', 'поста посчитано', 'постов посчитано')}
                            </div>
                          </td>
                          <td style={{ ...td, textAlign: 'left' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ flex: 1, minWidth: 40, background: '#f2f4f7', borderRadius: 5, height: 14, overflow: 'hidden' }}>
                                <div style={{ width: `${(e.reactions / maxReact) * 100}%`, height: '100%', background: '#e05263', borderRadius: 5 }} />
                              </div>
                              <b style={{ width: 30, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{e.reactions}</b>
                            </div>
                          </td>
                          <td style={{ ...td, fontWeight: 700 }}>{e.perPost === null ? '—' : e.perPost.toFixed(1)}</td>
                          <td style={{ ...td, color: e.comments ? '#111' : '#dde2e7' }}>{e.comments || '—'}</td>
                          <td style={{ ...td, color: e.saved ? '#111' : '#dde2e7' }}>{e.saved || '—'}</td>
                          <td style={{ ...td, color: e.reach ? '#5c6873' : '#dde2e7' }}>
                            {e.reach ? e.reach.toLocaleString('ru-RU') : '—'}
                          </td>
                          <td style={{ ...td, fontWeight: 700, color: e.responseRate === null ? '#dde2e7' : '#111' }}>
                            {e.responseRate === null ? '—' : `${(e.responseRate * 100).toFixed(1)}%`}
                          </td>
                        </tr>

                        {/* Посты этого человека — вложенной строкой, а не модалкой:
                            сравнивать «у кого зашло» удобнее, не теряя таблицу из виду. */}
                        {isOpen && (
                          <tr>
                            <td colSpan={7} style={{ padding: 0, background: '#f7f9fb', borderBottom: '1px solid #f4f6f8' }}>
                              {!posts ? (
                                <div style={{ padding: '14px 12px', fontSize: 12, color: '#aab3bd' }}>
                                  {personLoading ? 'Загрузка постов...' : 'Не удалось загрузить.'}
                                </div>
                              ) : !posts.length ? (
                                <div style={{ padding: '14px 12px', fontSize: 12, color: '#aab3bd' }}>
                                  Постов с цифрами за этот период нет.
                                </div>
                              ) : (
                                <div style={{ padding: '10px 12px 14px' }}>
                                  <div style={{ fontSize: 10, color: '#aab3bd', marginBottom: 8 }}>
                                    Сильные посты сверху. Строка — один пост на одной площадке.
                                  </div>
                                  {posts.map((post, i) => (
                                    <div
                                      key={`${post.id}-${post.platform}-${i}`}
                                      style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '7px 8px', borderRadius: 8,
                                        background: i % 2 ? 'transparent' : '#fff',
                                      }}
                                    >
                                      {post.image ? (
                                        <img src={post.image} alt="" style={{
                                          width: 36, height: 36, borderRadius: 6, objectFit: 'cover',
                                          flexShrink: 0, background: '#eef0f3',
                                        }} />
                                      ) : (
                                        <div style={{ width: 36, height: 36, borderRadius: 6, background: '#eef0f3', flexShrink: 0 }} />
                                      )}

                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{
                                          fontSize: 12, fontWeight: 600, color: '#111',
                                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                        }}>
                                          {post.url ? (
                                            <a href={post.url} target="_blank" rel="noreferrer"
                                               onClick={ev => ev.stopPropagation()}
                                               style={{ color: '#111', textDecoration: 'none' }}>
                                              {post.name}
                                            </a>
                                          ) : post.name}
                                        </div>
                                        <div style={{ fontSize: 10, color: '#aab3bd', display: 'flex', gap: 6, marginTop: 1 }}>
                                          <span style={{ color: PLATFORM[post.platform]?.color || '#aab3bd', fontWeight: 600 }}>
                                            {PLATFORM[post.platform]?.label || post.platform}
                                          </span>
                                          {post.postType === 'story' && <span>история</span>}
                                          <span>{shortDate(post.publishedAt || post.date)}</span>
                                          {post.number && <span>№{post.number}</span>}
                                        </div>
                                      </div>

                                      {!post.hasStats ? (
                                        <div style={{ fontSize: 10, color: '#c9d1d9', whiteSpace: 'nowrap' }}>
                                          цифр нет
                                        </div>
                                      ) : (
                                        <div style={{
                                          display: 'flex', gap: 12, fontSize: 11, color: '#5c6873',
                                          fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                                        }}>
                                          <span title="Реакции"><b style={{ color: '#e05263', fontSize: 12 }}>{post.reactions}</b> ❤</span>
                                          <span title="Комментарии" style={{ width: 34, textAlign: 'right' }}>{post.comments || '—'} 💬</span>
                                          <span title="Сохранения" style={{ width: 34, textAlign: 'right' }}>{post.saved || '—'} 🔖</span>
                                          <span title="Охват" style={{ width: 52, textAlign: 'right' }}>
                                            {post.reach ? post.reach.toLocaleString('ru-RU') : '—'}
                                          </span>
                                          <span title="Отклик" style={{ width: 42, textAlign: 'right', fontWeight: 700, color: '#111' }}>
                                            {post.responseRate === null ? '—' : `${(post.responseRate * 100).toFixed(1)}%`}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                        </Fragment>
                      );
                    })}
                    <tr>
                      <td style={{ ...td, textAlign: 'left', color: '#8b98a5', fontWeight: 700 }}>Итого</td>
                      <td style={{ ...td, textAlign: 'left', color: '#8b98a5', fontWeight: 700, paddingLeft: 10 }}>
                        {data.totals.reactions}
                      </td>
                      <td style={{ ...td, color: '#8b98a5', fontWeight: 700 }}>
                        {data.totals.measured ? (data.totals.reactions / data.totals.measured).toFixed(1) : '—'}
                      </td>
                      <td style={{ ...td, color: '#8b98a5', fontWeight: 700 }}>{data.totals.comments || '—'}</td>
                      <td style={{ ...td, color: '#8b98a5', fontWeight: 700 }}>{data.totals.saved || '—'}</td>
                      <td style={{ ...td, color: '#8b98a5', fontWeight: 700 }}>{data.totals.reach.toLocaleString('ru-RU')}</td>
                      <td style={{ ...td, color: '#8b98a5', fontWeight: 700 }}>
                        {data.totals.reach ? `${(data.totals.reactions / data.totals.reach * 100).toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* По дням — списком, а не матрицей «дата × сотрудник»: в матрице
              на шесть человек почти все клетки пустые, и читать её невозможно. */}
          <div style={{ fontSize: 13, fontWeight: 800, color: '#111', margin: '24px 0 10px' }}>По дням</div>

          {byDay.map(d => {
            const who = people
              .filter(p => d.byPerson[p.id])
              .sort((a, b) => d.byPerson[b.id] - d.byPerson[a.id]);
            return (
              <div key={d.date} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ width: 78, fontSize: 12, color: '#5c6873', fontWeight: 600, flexShrink: 0, paddingTop: 2 }}>
                  {dayLabel(d.date)}
                </div>
                <div style={{ width: 44, flexShrink: 0, paddingTop: 2 }}>
                  <div style={{ background: '#f2f4f7', borderRadius: 4, height: 12, overflow: 'hidden' }}>
                    <div style={{ width: `${(d.publications / maxDay) * 100}%`, height: '100%', background: '#8fb0dd' }} />
                  </div>
                </div>
                <b style={{ width: 24, fontSize: 12, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {d.publications}
                </b>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {who.map(p => (
                    <span key={p.id} style={{
                      background: '#f2f4f7', borderRadius: 6, padding: '1px 7px',
                      fontSize: 11, color: '#5c6873', whiteSpace: 'nowrap',
                    }}>
                      {p.name} <b style={{ color: '#111' }}>{d.byPerson[p.id]}</b>
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
