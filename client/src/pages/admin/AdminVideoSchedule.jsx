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
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="admin-page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="admin-page-title">Планирование съёмок</h1>
          <p style={{ color: 'var(--slate)', fontSize: 13, margin: '2px 0 0' }}>
            {frontman.name} — {frontman.brand}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Всего товаров', value: stats.total, color: '#3498db' },
          { label: 'С видео', value: stats.withVideo, color: '#27ae60' },
          { label: 'Запланировано', value: stats.scheduled, color: '#f39c12' },
          { label: 'Осталось', value: stats.total - stats.withVideo, color: '#e74c3c' },
        ].map(s => (
          <div key={s.label} style={{
            background: '#fff',
            borderRadius: 12,
            padding: '16px 20px',
            borderLeft: `4px solid ${s.color}`,
          }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Week calendar */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <button
            onClick={() => setWeekOffset(w => w - 1)}
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #e0e0e0', background: '#fff', cursor: 'pointer' }}
          >
            ← Пред
          </button>
          <span style={{ fontWeight: 600 }}>
            {weekDates[0].toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
            {' — '}
            {weekDates[6].toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
          <button
            onClick={() => setWeekOffset(w => w + 1)}
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #e0e0e0', background: '#fff', cursor: 'pointer' }}
          >
            След →
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
          {weekDates.map(date => {
            const key = formatDate(date);
            const items = scheduleByDate[key] || [];
            const isToday = isSameDay(date, new Date());

            return (
              <div
                key={key}
                style={{
                  border: isToday ? '2px solid #3498db' : '1px solid #e8e8e8',
                  borderRadius: 10,
                  padding: 10,
                  minHeight: 120,
                  background: isToday ? '#f0f8ff' : '#fafafa',
                }}
              >
                <div style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: isToday ? '#3498db' : '#888',
                  marginBottom: 8,
                  textAlign: 'center',
                }}>
                  {WEEKDAYS[date.getDay()]} {date.getDate()}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {items.map(item => (
                    <div
                      key={item._id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: 6,
                        borderRadius: 6,
                        background: item.isCompleted ? '#e8f8f0' : '#fff',
                        border: `1px solid ${item.isCompleted ? '#27ae60' : '#e0e0e0'}`,
                        fontSize: 11,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={item.isCompleted}
                        onChange={() => item.isCompleted ? handleUncomplete(item._id) : handleComplete(item._id)}
                        disabled={saving}
                        style={{ cursor: 'pointer' }}
                      />
                      <ProductThumb product={item.product} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontWeight: 500,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          textDecoration: item.isCompleted ? 'line-through' : 'none',
                          color: item.isCompleted ? '#888' : '#333',
                        }}>
                          {item.product.name}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDelete(item._id)}
                        style={{
                          padding: 2,
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          opacity: 0.5,
                          fontSize: 10,
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Unscheduled products */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: 16 }}>Товары без расписания</span>
            <span style={{ color: '#888', marginLeft: 8, fontSize: 13 }}>({filteredUnscheduled.length})</span>
          </div>
          <select
            value={selectedSet}
            onChange={e => setSelectedSet(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid #e0e0e0',
              fontSize: 13,
            }}
          >
            <option value="all">Все сеты</option>
            {uniqueSets.map(s => (
              <option key={s} value={s}>{setLabel(s)}</option>
            ))}
          </select>
        </div>

        {filteredUnscheduled.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>
            Все товары запланированы
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {filteredUnscheduled.map(product => (
              <div
                key={product._id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: 10,
                  borderRadius: 8,
                  border: '1px solid #e8e8e8',
                  background: product.hasVideo ? '#f0fff4' : '#fff',
                }}
              >
                <ProductThumb product={product} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13,
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {product.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#888' }}>{setLabel(product.set)}</div>
                  {product.hasVideo && (
                    <span style={{
                      fontSize: 10,
                      color: '#27ae60',
                      fontWeight: 600,
                    }}>
                      ✓ Есть видео
                    </span>
                  )}
                </div>
                <button
                  onClick={() => {
                    setShowPicker(product._id);
                    setPickerDate(formatDate(new Date()));
                  }}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: 'none',
                    background: frontman.color || '#3498db',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  +
                </button>

                {showPicker === product._id && (
                  <div
                    style={{
                      position: 'fixed',
                      inset: 0,
                      background: 'rgba(0,0,0,0.4)',
                      zIndex: 2000,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    onClick={e => e.target === e.currentTarget && setShowPicker(null)}
                  >
                    <div style={{
                      background: '#fff',
                      borderRadius: 12,
                      padding: 24,
                      minWidth: 280,
                    }}>
                      <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Выберите дату съёмки</h3>
                      <div style={{ marginBottom: 8, fontSize: 14 }}>{product.name}</div>
                      <input
                        type="date"
                        value={pickerDate}
                        onChange={e => setPickerDate(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: 8,
                          border: '1px solid #e0e0e0',
                          fontSize: 14,
                          marginBottom: 16,
                        }}
                      />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => setShowPicker(null)}
                          style={{
                            flex: 1,
                            padding: '10px',
                            borderRadius: 8,
                            border: 'none',
                            background: '#f5f5f5',
                            cursor: 'pointer',
                            fontWeight: 600,
                          }}
                        >
                          Отмена
                        </button>
                        <button
                          onClick={() => handleSchedule(product._id, pickerDate)}
                          disabled={saving || !pickerDate}
                          style={{
                            flex: 1,
                            padding: '10px',
                            borderRadius: 8,
                            border: 'none',
                            background: frontman.color || '#3498db',
                            color: '#fff',
                            cursor: saving ? 'wait' : 'pointer',
                            fontWeight: 600,
                          }}
                        >
                          {saving ? '...' : 'Запланировать'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
