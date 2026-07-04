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

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

function isSameDay(d1, d2) {
  return formatDate(new Date(d1)) === formatDate(new Date(d2));
}

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
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedSet, setSelectedSet] = useState('all');
  const [showPicker, setShowPicker] = useState(null);
  const [pickerDate, setPickerDate] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    adminGetVideoScheduleMy()
      .then(res => setData(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
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

  const handleSchedule = async (productId, date) => {
    setSaving(true);
    try {
      await adminCreateVideoSchedule({ productId, plannedDate: date });
      load();
    } finally {
      setSaving(false);
      setShowPicker(null);
    }
  };

  const handleComplete = async (scheduleId) => {
    setSaving(true);
    try {
      await adminCompleteVideoSchedule(scheduleId);
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleUncomplete = async (scheduleId) => {
    setSaving(true);
    try {
      await adminUncompleteVideoSchedule(scheduleId);
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (scheduleId) => {
    if (!window.confirm('Удалить из расписания?')) return;
    setSaving(true);
    try {
      await adminDeleteVideoSchedule(scheduleId);
      load();
    } finally {
      setSaving(false);
    }
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
              <button onClick={() => setView('plan')} style={{
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
              <button onClick={() => setView('plan')} style={{
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
      {view === 'plan' && (
        <div>
          {/* Week calendar */}
          <div className="schedule-calendar">
            <div className="calendar-nav">
              <button onClick={() => setWeekOffset(w => w - 1)} className="nav-btn">← Пред</button>
              <span className="calendar-range">
                {weekDates[0].toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                {' — '}
                {weekDates[6].toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
              <button onClick={() => setWeekOffset(w => w + 1)} className="nav-btn">След →</button>
            </div>

            <div className="calendar-grid">
              {weekDates.map(date => {
                const key = formatDate(date);
                const items = scheduleByDate[key] || [];
                const isToday = isSameDay(date, new Date());
                return (
                  <div key={key} className={`calendar-day ${isToday ? 'is-today' : ''}`}>
                    <div className="day-header">
                      <span className="day-name">{WEEKDAYS[date.getDay()]}</span>
                      <span className="day-num">{date.getDate()}</span>
                    </div>
                    <div className="day-items">
                      {items.map(item => (
                        <div key={item._id} className={`schedule-item ${item.isCompleted ? 'completed' : ''}`}>
                          <label className="item-checkbox">
                            <input
                              type="checkbox"
                              checked={item.isCompleted}
                              onChange={() => item.isCompleted ? handleUncomplete(item._id) : handleComplete(item._id)}
                              disabled={saving}
                            />
                            <span className="checkmark"></span>
                          </label>
                          <ProductThumb product={item.product} />
                          <span className="item-name">{item.product.name}</span>
                          <button onClick={() => handleDelete(item._id)} className="item-delete">✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Unscheduled products */}
          <div className="unscheduled-section">
            <div className="unscheduled-header">
              <h2 className="section-title">
                Товары без расписания <span className="count">({filteredUnscheduled.length})</span>
              </h2>
              <select
                value={selectedSet}
                onChange={e => setSelectedSet(e.target.value)}
                className="set-select"
              >
                <option value="all">Все сеты</option>
                {uniqueSets.map(s => (
                  <option key={s} value={s}>{setLabel(s)}</option>
                ))}
              </select>
            </div>

            {filteredUnscheduled.length === 0 ? (
              <div className="empty-state">Все товары запланированы</div>
            ) : (
              <div className="products-list">
                {filteredUnscheduled.map(product => (
                  <div key={product._id} className={`product-card ${product.hasVideo ? 'has-video' : ''}`}>
                    <ProductThumb product={product} />
                    <div className="product-info">
                      <div className="product-name">{product.name}</div>
                      <div className="product-set">{setLabel(product.set)}</div>
                      {product.hasVideo && <span className="video-badge">✓ Видео</span>}
                    </div>
                    <button
                      onClick={() => {
                        setShowPicker(product._id);
                        setPickerDate(formatDate(new Date()));
                      }}
                      className="add-btn"
                      style={{ '--btn-color': accent }}
                    >
                      +
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

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

      {/* Date picker modal */}
      {showPicker && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowPicker(null)}>
          <div className="modal-content">
            <h3 className="modal-title">Выберите дату съёмки</h3>
            <p className="modal-product">{filteredUnscheduled.find(p => p._id === showPicker)?.name}</p>
            <input
              type="date"
              value={pickerDate}
              onChange={e => setPickerDate(e.target.value)}
              className="date-input"
            />
            <div className="modal-actions">
              <button onClick={() => setShowPicker(null)} className="btn-cancel">Отмена</button>
              <button
                onClick={() => handleSchedule(showPicker, pickerDate)}
                disabled={saving || !pickerDate}
                className="btn-confirm"
                style={{ '--btn-color': frontman.color || '#3498db' }}
              >
                {saving ? '...' : 'Запланировать'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
