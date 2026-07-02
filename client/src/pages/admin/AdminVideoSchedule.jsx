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

  return (
    <div className="video-schedule">
      <div className="schedule-header">
        <h1 className="schedule-title">Планирование съёмок</h1>
        <p className="schedule-subtitle">{frontman.name} — {frontman.brand}</p>
      </div>

      {/* Stats - горизонтальный скролл на мобильных */}
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

      {/* Week calendar */}
      <div className="schedule-calendar">
        <div className="calendar-nav">
          <button onClick={() => setWeekOffset(w => w - 1)} className="nav-btn">
            ← Пред
          </button>
          <span className="calendar-range">
            {weekDates[0].toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
            {' — '}
            {weekDates[6].toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
          <button onClick={() => setWeekOffset(w => w + 1)} className="nav-btn">
            След →
          </button>
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
                  style={{ '--btn-color': frontman.color || '#3498db' }}
                >
                  +
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

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
