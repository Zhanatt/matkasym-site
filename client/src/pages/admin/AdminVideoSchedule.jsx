import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  adminGetVideoScheduleMy,
  adminCreateVideoSchedule,
  adminCompleteVideoSchedule,
  adminUncompleteVideoSchedule,
  adminDeleteVideoSchedule,
} from '../../api';

const SET_NAMES = {
  'achyk-asman': 'Achyk Asman',
  'baary-oorunda': 'Baary Oorunda',
  'den-sooluk': 'Den Sooluk',
  'jenil-ashkana': 'Jenil Ashkana',
  'konok-keldi': 'Konok Keldi',
  'korkom-aiym': 'Korkom Aiym',
  'kosh-keliniz': 'Kosh Keliniz',
  'sanarip-tv': 'Sanarip TV',
  'shirin-balalyk': 'Shirin Balalyk',
  'taza-kiym': 'Taza Kiym',
  'uydo-ishtoo': 'Uydo Ishtoo',
  'zhashyl-omur': 'Zhashyl Omur',
  '0-tashtandy-home': '0-Tashtandy (HOME)',
  '0-tashtandy': '0-Tashtandy',
  'bekem-fasad': 'Bekem Fasad',
  'bekem-tosmo': 'Bekem Tosmo',
  'bilim-kelechek': 'Bilim Kelechek',
  'kooz-koopsuzduk': 'Kooz Koopsuzduk',
  'mazza-seyil': 'Mazza Seyil',
  'uzak-koldon': 'Uzak Koldon',
  'onuguu-set': 'Onuguu Set',
  'dayar-tutuk': 'Dayar Tutuk',
  'poly-fabrikat': 'Poly Fabrikat',
};
const setLabel = s => SET_NAMES[s] || s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

function getWeekDates(offset = 0) {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1) + offset * 7;
  const monday = new Date(now.setDate(diff));
  monday.setHours(0, 0, 0, 0);

  const week = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    week.push(d);
  }
  return week;
}

// Локальная дата (не UTC!) — иначе для UTC+6 полночь уезжает на прошлый день
function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isSameDay(d1, d2) {
  return formatDate(new Date(d1)) === formatDate(new Date(d2));
}

// Сетка месяца: массив ячеек (Date | null), недели начинаются с Пн
function getMonthGrid(offset = 0) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const year = first.getFullYear(), month = first.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDow = (first.getDay() + 6) % 7; // Пн = 0
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return { first, cells };
}

const WEEKDAYS_MON = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const DRIVE_URL = 'https://drive.google.com/thumbnail?id=';

function ProductThumb({ product }) {
  const src = product.driveImages?.[0]
    ? `${DRIVE_URL}${product.driveImages[0]}&sz=w80`
    : product.images?.[0] || '/placeholder.png';
  return (
    <img
      src={src}
      alt=""
      style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, background: '#f5f5f5' }}
    />
  );
}

export default function AdminVideoSchedule() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [view, setView] = useState('today'); // today | plan | progress
  const [calView, setCalView] = useState('month'); // month | week
  const [monthOffset, setMonthOffset] = useState(0);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedSet, setSelectedSet] = useState('all');
  const [selectedDay, setSelectedDay] = useState(null); // 'YYYY-MM-DD' → модалка дня
  const [saving, setSaving] = useState(false);

  const load = (silent = false) => {
    if (!silent) setLoading(true);
    adminGetVideoScheduleMy()
      .then(res => setData(res.data))
      .catch(err => console.error(err))
      .finally(() => { if (!silent) setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);

  const scheduleByDate = useMemo(() => {
    if (!data?.schedules) return {};
    const map = {};
    data.schedules.forEach(s => {
      const key = formatDate(new Date(s.plannedDate));
      if (!map[key]) map[key] = [];
      map[key].push(s);
    });
    return map;
  }, [data?.schedules]);

  const scheduledProductIds = useMemo(() => {
    if (!data?.schedules) return new Set();
    return new Set(data.schedules.map(s => s.product._id));
  }, [data?.schedules]);

  const unscheduledProducts = useMemo(() => {
    if (!data?.products) return [];
    return data.products.filter(p => !scheduledProductIds.has(p._id));
  }, [data?.products, scheduledProductIds]);

  const filteredUnscheduled = useMemo(() => {
    if (selectedSet === 'all') return unscheduledProducts;
    return unscheduledProducts.filter(p => p.set === selectedSet);
  }, [unscheduledProducts, selectedSet]);

  const uniqueSets = useMemo(() => {
    if (!data?.products) return [];
    const sets = [...new Set(data.products.map(p => p.set))];
    return sets.sort();
  }, [data?.products]);

  // Все действия обновляют состояние мгновенно, сервер — в фоне.
  // При ошибке тихо перезагружаем данные (без полноэкранного спиннера).

  const handleSchedule = async (productId, date) => {
    setSaving(true);
    try {
      const res = await adminCreateVideoSchedule({ productId, plannedDate: date });
      setData(prev => ({
        ...prev,
        schedules: [...prev.schedules.filter(s => s._id !== res.data._id), res.data],
        stats: { ...prev.stats, scheduled: (prev.stats.scheduled || 0) + 1 },
      }));
    } catch (e) {
      alert(e.response?.data?.error || 'Не удалось запланировать');
      load(true);
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = (scheduleId) => {
    setData(prev => ({
      ...prev,
      schedules: prev.schedules.map(s => s._id === scheduleId ? { ...s, isCompleted: true } : s),
    }));
    adminCompleteVideoSchedule(scheduleId).catch(() => load(true));
  };

  const handleUncomplete = (scheduleId) => {
    setData(prev => ({
      ...prev,
      schedules: prev.schedules.map(s => s._id === scheduleId ? { ...s, isCompleted: false } : s),
    }));
    adminUncompleteVideoSchedule(scheduleId).catch(() => load(true));
  };

  const handleDelete = (scheduleId) => {
    setData(prev => ({
      ...prev,
      schedules: prev.schedules.filter(s => s._id !== scheduleId),
      stats: { ...prev.stats, scheduled: Math.max(0, (prev.stats.scheduled || 0) - 1) },
    }));
    adminDeleteVideoSchedule(scheduleId).catch(() => load(true));
  };

  if (loading) {
    return <div className="admin-empty">Загрузка...</div>;
  }

  if (!data?.frontman) {
    return (
      <div className="admin-empty" style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎬</div>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Вы не являетесь фронтменом</div>
        <div style={{ fontSize: 14, color: '#888' }}>
          Обратитесь к администратору для привязки к фронтмену
        </div>
      </div>
    );
  }

  const { frontman, stats } = data;

  const todayKey = formatDate(new Date());
  const todayItems = scheduleByDate[todayKey] || [];
  const todayDone = todayItems.filter(i => i.isCompleted).length;
  const tomorrowD = new Date(); tomorrowD.setDate(tomorrowD.getDate() + 1);
  const tomorrowItems = scheduleByDate[formatDate(tomorrowD)] || [];
  const accent = frontman.color || '#3498db';

  const TABS = [
    { k: 'today',    l: '📋 Сегодня' },
    { k: 'plan',     l: '➕ Планировать' },
    { k: 'progress', l: '📊 Прогресс' },
  ];

  return (
    <div className="video-schedule">
      <div className="schedule-header">
        <h1 className="schedule-title">Планирование съёмок</h1>
        <p className="schedule-subtitle">{frontman.name} — {frontman.brand}</p>
      </div>

      {/* Вкладки */}
      <div style={{ display: 'flex', background: '#f0f0ee', borderRadius: 12, padding: 4, gap: 4, marginBottom: 18 }}>
        {TABS.map(t => (
          <button key={t.k} onClick={() => setView(t.k)} style={{
            flex: 1, padding: '10px 4px', borderRadius: 9, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
            background: view === t.k ? '#fff' : 'transparent',
            color: view === t.k ? '#111' : '#777',
            boxShadow: view === t.k ? '0 1px 4px rgba(0,0,0,.08)' : 'none',
            transition: 'all .15s',
          }}>{t.l}</button>
        ))}
      </div>

      {/* ── СЕГОДНЯ ── */}
      {view === 'today' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#111', textTransform: 'capitalize' }}>
                {new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
              <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>Товары на съёмку сегодня</div>
            </div>
            {todayItems.length > 0 && (
              <div style={{ background: todayDone === todayItems.length ? '#e8f5e9' : '#fff8e1', borderRadius: 10, padding: '8px 14px', fontSize: 14, fontWeight: 800, color: todayDone === todayItems.length ? '#2d7a3a' : '#b45309' }}>
                {todayDone} / {todayItems.length} снято
              </div>
            )}
          </div>

          {todayItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', background: '#fff', borderRadius: 16, border: '1px solid #eee' }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>🎬</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#111', marginBottom: 6 }}>На сегодня ничего не запланировано</div>
              <div style={{ fontSize: 13, color: '#999', marginBottom: 20 }}>Выберите товары, которые будете рекламировать</div>
              <button onClick={() => { setView('plan'); setSelectedDay(todayKey); }} style={{
                padding: '12px 28px', borderRadius: 12, border: 'none', cursor: 'pointer',
                background: accent, color: '#fff', fontSize: 15, fontWeight: 700,
              }}>➕ Запланировать</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {todayItems.map(item => (
                <div key={item._id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                  background: item.isCompleted ? '#f0faf2' : '#fff', borderRadius: 14,
                  border: item.isCompleted ? '1.5px solid #bfe6c8' : '1px solid #eee',
                }}>
                  <ProductThumb product={item.product} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#111', textDecoration: item.isCompleted ? 'line-through' : 'none', opacity: item.isCompleted ? 0.6 : 1 }}>
                      {item.product.name}
                    </div>
                    <div style={{ fontSize: 12, color: '#999' }}>{setLabel(item.product.set)}</div>
                  </div>
                  <button
                    onClick={() => item.isCompleted ? handleUncomplete(item._id) : handleComplete(item._id)}
                    disabled={saving}
                    style={{
                      padding: '9px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
                      fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
                      background: item.isCompleted ? '#e8f5e9' : accent,
                      color: item.isCompleted ? '#2d7a3a' : '#fff',
                    }}>
                    {item.isCompleted ? '✓ Снято' : 'Снял ✓'}
                  </button>
                  <button onClick={() => handleDelete(item._id)} style={{ background: 'none', border: 'none', color: '#ccc', fontSize: 16, cursor: 'pointer', padding: 4 }}>✕</button>
                </div>
              ))}
              <button onClick={() => setSelectedDay(todayKey)} style={{
                padding: '12px', borderRadius: 12, border: `1.5px dashed ${accent}`, cursor: 'pointer',
                background: 'transparent', color: accent, fontSize: 14, fontWeight: 700, marginTop: 4,
              }}>➕ Добавить ещё товар</button>
            </div>
          )}

          {/* Завтра — превью */}
          {tomorrowItems.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                Завтра — {tomorrowItems.length} {tomorrowItems.length === 1 ? 'товар' : 'товара(ов)'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tomorrowItems.map(item => (
                  <div key={item._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#fafaf8', borderRadius: 10, opacity: 0.8 }}>
                    <ProductThumb product={item.product} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#555' }}>{item.product.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ПЛАНИРОВАТЬ ── */}
      {view === 'plan' && (() => {
        const { first, cells } = getMonthGrid(monthOffset);
        const displayDates = calView === 'month' ? cells : weekDates;
        const navLabel = calView === 'month'
          ? first.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
          : `${weekDates[0].toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} — ${weekDates[6].toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`;
        const navPrev = () => calView === 'month' ? setMonthOffset(o => o - 1) : setWeekOffset(o => o - 1);
        const navNext = () => calView === 'month' ? setMonthOffset(o => o + 1) : setWeekOffset(o => o + 1);

        const renderDayBtn = (date, idx) => {
          if (!date) return <div key={`e${idx}`} />;
          const key = formatDate(date);
          const items = scheduleByDate[key] || [];
          const has = items.length > 0;
          const allDone = has && items.every(i => i.isCompleted);
          const isToday = isSameDay(date, new Date());
          return (
            <button key={key} onClick={() => setSelectedDay(key)} style={{
              aspectRatio: '1', width: '100%', borderRadius: '50%', cursor: 'pointer',
              border: isToday ? `2px solid ${accent}` : '2px solid transparent',
              background: has ? (allDone ? '#d9f2df' : accent) : 'transparent',
              color: has ? (allDone ? '#1e7e34' : '#fff') : '#333',
              fontSize: 14, fontWeight: isToday || has ? 800 : 500,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              lineHeight: 1.1, padding: 0, transition: 'all .15s',
            }}>
              {date.getDate()}
              {has && <span style={{ fontSize: 8.5, fontWeight: 700, opacity: 0.85 }}>{allDone ? '✓' : items.length}</span>}
            </button>
          );
        };

        return (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #eee', padding: '16px 14px' }}>
            {/* Переключатель Месяц / Неделя */}
            <div style={{ display: 'flex', background: '#f0f0ee', borderRadius: 10, padding: 3, gap: 3, marginBottom: 14, maxWidth: 220 }}>
              {[{ k: 'month', l: 'Месяц' }, { k: 'week', l: 'Неделя' }].map(t => (
                <button key={t.k} onClick={() => setCalView(t.k)} style={{
                  flex: 1, padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: 700,
                  background: calView === t.k ? '#fff' : 'transparent',
                  color: calView === t.k ? '#111' : '#888',
                  boxShadow: calView === t.k ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
                }}>{t.l}</button>
              ))}
            </div>

            {/* Навигация */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <button onClick={navPrev} style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid #e5e5e5', background: '#fff', fontSize: 16, cursor: 'pointer', color: '#555' }}>‹</button>
              <span style={{ fontSize: 15, fontWeight: 800, color: '#111', textTransform: 'capitalize' }}>{navLabel}</span>
              <button onClick={navNext} style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid #e5e5e5', background: '#fff', fontSize: 16, cursor: 'pointer', color: '#555' }}>›</button>
            </div>

            {/* Шапка дней недели */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 6 }}>
              {WEEKDAYS_MON.map(d => (
                <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#bbb', textTransform: 'uppercase' }}>{d}</div>
              ))}
            </div>

            {/* Сетка дней */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
              {displayDates.map((date, i) => renderDayBtn(date, i))}
            </div>

            {/* Легенда */}
            <div style={{ display: 'flex', gap: 14, marginTop: 14, flexWrap: 'wrap', fontSize: 11.5, color: '#888' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: accent, display: 'inline-block' }} /> запланировано
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#d9f2df', display: 'inline-block' }} /> всё снято
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', border: `2px solid ${accent}`, display: 'inline-block', boxSizing: 'border-box' }} /> сегодня
              </span>
            </div>

            <div style={{ marginTop: 12, fontSize: 12.5, color: '#999', textAlign: 'center' }}>
              Нажмите на день, чтобы добавить или убрать товары
            </div>
          </div>
        );
      })()}

      {/* ── ПРОГРЕСС ── */}
      {view === 'progress' && (
        <div>
          <div className="schedule-stats">
            {[
              { label: 'Всего товаров', value: stats.total, color: '#3498db' },
              { label: 'С видео', value: stats.withVideo, color: '#27ae60' },
              { label: 'Запланировано', value: stats.scheduled, color: '#f39c12' },
              { label: 'Осталось', value: stats.total - stats.withVideo, color: '#e74c3c' },
            ].map(s => (
              <div key={s.label} className="stat-card" style={{ '--stat-color': s.color }}>
                <div className="stat-value">{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Общий прогресс по видео */}
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #eee', padding: 20, marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#111' }}>Прогресс по видео</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: '#27ae60' }}>
                {stats.total > 0 ? Math.round(stats.withVideo / stats.total * 100) : 0}%
              </span>
            </div>
            <div style={{ height: 12, background: '#f0f0ee', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{
                width: `${stats.total > 0 ? Math.round(stats.withVideo / stats.total * 100) : 0}%`,
                height: '100%', background: 'linear-gradient(90deg, #27ae60, #2ecc71)', borderRadius: 6,
                transition: 'width .4s',
              }} />
            </div>
            <div style={{ fontSize: 12, color: '#999', marginTop: 8 }}>
              {stats.withVideo} из {stats.total} товаров с видео · осталось {stats.total - stats.withVideo}
            </div>
          </div>
        </div>
      )}

      {/* Модалка дня: запланированное + выбор товаров */}
      {selectedDay && (() => {
        const dayItems = scheduleByDate[selectedDay] || [];
        const dayDate = new Date(selectedDay + 'T00:00:00');
        return (
          <div
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,.5)', zIndex: 9999,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14,
            }}
            onClick={() => setSelectedDay(null)}
          >
            <div
              style={{
                background: '#fff', borderRadius: 20, width: '100%', maxWidth: 520,
                maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Шапка */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 12px', borderBottom: '1px solid #f0f0f0' }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#111', textTransform: 'capitalize' }}>
                    {dayDate.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </div>
                  <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                    {dayItems.length > 0 ? `Запланировано: ${dayItems.length}` : 'Пока ничего не запланировано'}
                  </div>
                </div>
                <button onClick={() => setSelectedDay(null)} style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: '#f3f3f1', fontSize: 15, cursor: 'pointer', color: '#555' }}>✕</button>
              </div>

              <div style={{ overflow: 'auto', padding: '14px 18px 18px' }}>
                {/* Запланированные — можно убрать */}
                {dayItems.length > 0 && (
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {dayItems.map(item => (
                        <div key={item._id} style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                          background: item.isCompleted ? '#f0faf2' : '#f8f8f6', borderRadius: 12,
                        }}>
                          <ProductThumb product={item.product} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#111', textDecoration: item.isCompleted ? 'line-through' : 'none', opacity: item.isCompleted ? 0.6 : 1 }}>
                              {item.product.name}
                            </div>
                            <div style={{ fontSize: 11.5, color: '#999' }}>{setLabel(item.product.set)}{item.isCompleted ? ' · ✓ снято' : ''}</div>
                          </div>
                          <button
                            onClick={() => handleDelete(item._id)}
                            disabled={saving}
                            style={{ padding: '7px 12px', borderRadius: 9, border: 'none', background: '#fde8e8', color: '#c0392b', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                          >Убрать</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Добавить товары */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#111' }}>
                    Добавить товар <span style={{ color: '#aaa', fontWeight: 600 }}>({filteredUnscheduled.length})</span>
                  </div>
                  <select
                    value={selectedSet}
                    onChange={e => setSelectedSet(e.target.value)}
                    style={{ padding: '7px 10px', borderRadius: 9, border: '1.5px solid #e5e5e5', fontSize: 12.5, fontWeight: 600, background: '#fff', maxWidth: 160 }}
                  >
                    <option value="all">Все сеты</option>
                    {uniqueSets.map(s => <option key={s} value={s}>{setLabel(s)}</option>)}
                  </select>
                </div>

                {filteredUnscheduled.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 20, color: '#999', fontSize: 13, background: '#fafaf8', borderRadius: 12 }}>
                    Все товары уже запланированы 🎉
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {filteredUnscheduled.map(product => (
                      <div key={product._id} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                        background: product.hasVideo ? '#f4fbf6' : '#fff', borderRadius: 12,
                        border: '1px solid #f0f0ee',
                      }}>
                        <ProductThumb product={product} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.name}</div>
                          <div style={{ fontSize: 11.5, color: '#999' }}>
                            {setLabel(product.set)}{product.hasVideo ? ' · ✓ видео есть' : ''}
                          </div>
                        </div>
                        <button
                          onClick={() => handleSchedule(product._id, selectedDay)}
                          disabled={saving}
                          style={{
                            width: 36, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer',
                            background: accent, color: '#fff', fontSize: 18, fontWeight: 700, flexShrink: 0,
                            opacity: saving ? 0.5 : 1,
                          }}
                        >+</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
