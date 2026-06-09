import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  adminGetReviewResults,
  adminGetReviewStats,
  adminDeleteReview,
  adminResetSetReviews,
} from '../../api/index';

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
  'zhashyl-ömür': 'Zhashyl Omur',
  'bekem-fasad': 'Bekem Fasad',
  'bilim-kelechek': 'Bilim Kelechek',
  'kooz-koopsuzduk': 'Kooz Koopsuzduk',
  'mazza-seiyl': 'Mazza Seiyl',
  'onoi-sakta': 'Onoi Sakta',
  'uzak-koldon': 'Uzak Koldon',
};
const setLabel = (s) => SET_NAMES[s] || s?.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || '—';

const STATUS_CONFIG = {
  keep: { label: 'Оставить', color: '#22c55e', bg: '#f0fdf4', icon: '✓' },
  improve: { label: 'Модернизировать', color: '#f59e0b', bg: '#fffbeb', icon: '⚙' },
  discontinue: { label: 'Снять', color: '#ef4444', bg: '#fef2f2', icon: '✕' },
};

export default function AdminReviewResults() {
  const { user } = useAuth();
  const canEdit = user?.role === 'owner' || user?.role === 'editor';

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState([]);
  const [reviews, setReviews] = useState([]);

  // Фильтры
  const [filterSet, setFilterSet] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, reviewsRes] = await Promise.all([
        adminGetReviewStats(),
        adminGetReviewResults({ set: filterSet || undefined, status: filterStatus || undefined }),
      ]);
      setStats(statsRes.data);
      setReviews(reviewsRes.data);
    } finally {
      setLoading(false);
    }
  }, [filterSet, filterStatus]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDelete = async (id) => {
    if (!window.confirm('Удалить этот отзыв?')) return;
    await adminDeleteReview(id);
    loadData();
  };

  const handleResetSet = async (setSlug) => {
    if (!window.confirm(`Сбросить все отзывы сета "${setLabel(setSlug)}"?\n\nЭто позволит начать новый цикл аудита.`)) return;
    await adminResetSetReviews(setSlug);
    loadData();
  };

  const getImageUrl = (r) => {
    const img = r.product?.images?.[0] || r.productSnapshot?.image;
    if (img) return img;
    const driveId = r.product?.driveImages?.[0];
    if (driveId) return `https://drive.google.com/thumbnail?id=${driveId}&sz=w100`;
    return '/placeholder.png';
  };

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: '2-digit' });
  };

  const allSets = [...new Set(stats.map((s) => s._id).filter(Boolean))].sort();

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Заголовок */}
      <div className="admin-page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="admin-page-title">Результаты аудита</h1>
          <p style={{ color: 'var(--slate)', fontSize: 13, margin: '2px 0 0' }}>
            Просмотр и управление результатами опроса фронтменов
          </p>
        </div>
      </div>

      {/* Статистика по сетам */}
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: 24,
          marginBottom: 20,
          boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Статистика по сетам</h2>

        {stats.length === 0 ? (
          <div style={{ color: '#aaa', fontSize: 14, padding: '20px 0' }}>
            Пока нет данных
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {stats.map((s) => {
              const statusMap = {};
              (s.statuses || []).forEach((st) => { statusMap[st.status] = st.count; });

              return (
                <div
                  key={s._id}
                  style={{
                    padding: 16,
                    border: '1px solid #eee',
                    borderRadius: 10,
                    background: '#fafafa',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{setLabel(s._id)}</div>
                    <div style={{ fontSize: 13, color: '#888' }}>{s.total} проверено</div>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                      <div
                        key={key}
                        style={{
                          flex: 1,
                          padding: '8px 4px',
                          background: cfg.bg,
                          borderRadius: 8,
                          textAlign: 'center',
                        }}
                      >
                        <div style={{ fontSize: 18, fontWeight: 700, color: cfg.color }}>
                          {statusMap[key] || 0}
                        </div>
                        <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{cfg.label}</div>
                      </div>
                    ))}
                  </div>

                  {canEdit && (
                    <button
                      onClick={() => handleResetSet(s._id)}
                      style={{
                        marginTop: 12,
                        width: '100%',
                        padding: '8px',
                        fontSize: 12,
                        fontWeight: 600,
                        background: '#fff',
                        border: '1px solid #ddd',
                        borderRadius: 8,
                        cursor: 'pointer',
                        color: '#888',
                      }}
                    >
                      Сбросить для нового аудита
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Фильтры */}
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: '16px 24px',
          marginBottom: 16,
          boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
          display: 'flex',
          gap: 16,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: '#888' }}>Фильтры:</div>

        <select
          value={filterSet}
          onChange={(e) => setFilterSet(e.target.value)}
          style={{
            padding: '8px 12px',
            fontSize: 13,
            border: '1px solid #ddd',
            borderRadius: 8,
            background: '#fff',
            cursor: 'pointer',
          }}
        >
          <option value="">Все сеты</option>
          {allSets.map((s) => (
            <option key={s} value={s}>{setLabel(s)}</option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{
            padding: '8px 12px',
            fontSize: 13,
            border: '1px solid #ddd',
            borderRadius: 8,
            background: '#fff',
            cursor: 'pointer',
          }}
        >
          <option value="">Все статусы</option>
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <option key={key} value={key}>{cfg.label}</option>
          ))}
        </select>

        <div style={{ marginLeft: 'auto', fontSize: 13, color: '#888' }}>
          Найдено: {reviews.length}
        </div>
      </div>

      {/* Таблица результатов */}
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
        }}
      >
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Загрузка...</div>
        ) : reviews.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#aaa' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
            <div>Нет результатов</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8f8f8', borderBottom: '1px solid #eee' }}>
                  <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: 600 }}>Товар</th>
                  <th style={{ padding: '14px 12px', textAlign: 'left', fontWeight: 600 }}>Сет</th>
                  <th style={{ padding: '14px 12px', textAlign: 'center', fontWeight: 600 }}>Статус</th>
                  <th style={{ padding: '14px 12px', textAlign: 'left', fontWeight: 600 }}>Комментарий</th>
                  <th style={{ padding: '14px 12px', textAlign: 'left', fontWeight: 600 }}>Фронтмен</th>
                  <th style={{ padding: '14px 12px', textAlign: 'center', fontWeight: 600 }}>Дата</th>
                  {canEdit && <th style={{ padding: '14px 12px', width: 60 }}></th>}
                </tr>
              </thead>
              <tbody>
                {reviews.map((r) => {
                  const cfg = STATUS_CONFIG[r.status] || {};
                  return (
                    <tr key={r._id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <img
                            src={getImageUrl(r)}
                            alt=""
                            style={{
                              width: 44,
                              height: 44,
                              objectFit: 'contain',
                              borderRadius: 6,
                              background: '#f8f8f8',
                            }}
                            onError={(e) => { e.target.src = '/placeholder.png'; }}
                          />
                          <div>
                            <div style={{ fontWeight: 600, marginBottom: 2 }}>
                              {r.productSnapshot?.fullName || r.productSnapshot?.name || '—'}
                            </div>
                            <div style={{ fontSize: 11, color: '#aaa' }}>
                              {r.productSnapshot?.sku || '—'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            padding: '4px 10px',
                            background: '#f0f0f0',
                            borderRadius: 6,
                          }}
                        >
                          {setLabel(r.productSnapshot?.set)}
                        </span>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '6px 12px',
                            background: cfg.bg,
                            color: cfg.color,
                            borderRadius: 20,
                            fontWeight: 600,
                            fontSize: 12,
                          }}
                        >
                          {cfg.icon} {cfg.label}
                        </span>
                      </td>
                      <td style={{ padding: '12px', maxWidth: 250 }}>
                        {r.comment ? (
                          <div
                            style={{
                              fontSize: 12,
                              color: '#555',
                              lineHeight: 1.4,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                            }}
                            title={r.comment}
                          >
                            {r.comment}
                          </div>
                        ) : (
                          <span style={{ color: '#ccc' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: r.frontman?.color || '#888',
                            }}
                          />
                          <span style={{ fontWeight: 500 }}>{r.frontman?.name || '—'}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center', color: '#888', fontSize: 12 }}>
                        {formatDate(r.updatedAt)}
                      </td>
                      {canEdit && (
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <button
                            onClick={() => handleDelete(r._id)}
                            style={{
                              padding: '4px 8px',
                              fontSize: 11,
                              background: '#fff',
                              border: '1px solid #fcc',
                              borderRadius: 6,
                              color: '#c00',
                              cursor: 'pointer',
                            }}
                          >
                            ✕
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
