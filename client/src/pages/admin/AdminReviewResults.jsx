import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  adminGetAudits,
  adminGetActiveAudit,
  adminCreateAudit,
  adminCompleteAudit,
  adminDeleteAudit,
  adminGetReviewResults,
  adminGetReviewStats,
  adminGetFrontmenProgress,
  adminDeleteReview,
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
  not_tried: { label: 'Не пробовали', color: '#3b82f6', bg: '#eff6ff', icon: '?' },
  improve: { label: 'Модернизировать', color: '#f59e0b', bg: '#fffbeb', icon: '⚙' },
  discontinue: { label: 'Снять', color: '#ef4444', bg: '#fef2f2', icon: '✕' },
};

const formatDate = (d) => d ? new Date(d).toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';
const formatDateLong = (d) => d ? new Date(d).toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

export default function AdminReviewResults() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canEdit = user?.role === 'owner' || user?.role === 'editor';

  const [loading, setLoading] = useState(true);
  const [audits, setAudits] = useState([]);
  const [activeAudit, setActiveAudit] = useState(null);
  const [selectedAuditId, setSelectedAuditId] = useState(null);

  const [stats, setStats] = useState([]);
  const [reviews, setReviews] = useState([]);

  // Фильтры
  const [filterSet, setFilterSet] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Модалка создания аудита
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newAuditName, setNewAuditName] = useState('');
  const [newAuditDeadline, setNewAuditDeadline] = useState('');
  const [creating, setCreating] = useState(false);

  // Чеклист фронтменов
  const [showFrontmenChecklist, setShowFrontmenChecklist] = useState(false);
  const [frontmenProgress, setFrontmenProgress] = useState([]);

  // Модалка итогов завершённого аудита
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [summaryData, setSummaryData] = useState([]);
  const [summaryAuditName, setSummaryAuditName] = useState('');

  const loadAudits = useCallback(async () => {
    try {
      const [auditsRes, activeRes] = await Promise.all([
        adminGetAudits(),
        adminGetActiveAudit(),
      ]);
      setAudits(auditsRes.data);
      setActiveAudit(activeRes.data);
      if (activeRes.data) {
        setSelectedAuditId(activeRes.data._id);
      } else if (auditsRes.data.length > 0) {
        setSelectedAuditId(auditsRes.data[0]._id);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadData = useCallback(async () => {
    if (!selectedAuditId) return;
    setLoading(true);
    try {
      const [statsRes, reviewsRes] = await Promise.all([
        adminGetReviewStats(selectedAuditId),
        adminGetReviewResults({ auditId: selectedAuditId, set: filterSet || undefined, status: filterStatus || undefined }),
      ]);
      setStats(statsRes.data);
      setReviews(reviewsRes.data);
    } finally {
      setLoading(false);
    }
  }, [selectedAuditId, filterSet, filterStatus]);

  useEffect(() => {
    loadAudits().finally(() => setLoading(false));
  }, [loadAudits]);

  useEffect(() => {
    if (selectedAuditId) loadData();
  }, [loadData, selectedAuditId]);

  const loadFrontmenProgress = async () => {
    if (!selectedAuditId) return;
    try {
      const res = await adminGetFrontmenProgress(selectedAuditId);
      setFrontmenProgress(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const toggleFrontmenChecklist = () => {
    if (!showFrontmenChecklist) {
      loadFrontmenProgress();
    }
    setShowFrontmenChecklist(!showFrontmenChecklist);
  };

  const handleCreateAudit = async () => {
    if (!newAuditName.trim() || !newAuditDeadline) return;
    setCreating(true);
    try {
      await adminCreateAudit({ name: newAuditName, deadline: newAuditDeadline });
      setShowCreateModal(false);
      setNewAuditName('');
      setNewAuditDeadline('');
      await loadAudits();
    } catch (e) {
      alert(e.response?.data?.error || 'Ошибка создания аудита');
    } finally {
      setCreating(false);
    }
  };

  const handleCompleteAudit = async (id) => {
    if (!window.confirm('Завершить аудит? Фронтмены больше не смогут вносить изменения.')) return;
    try {
      const progressRes = await adminGetFrontmenProgress(id);
      setSummaryData(progressRes.data);
      setSummaryAuditName(activeAudit?.name || 'Аудит');

      await adminCompleteAudit(id);
      await loadAudits();
      loadData();

      setShowSummaryModal(true);
    } catch (e) {
      alert(e.response?.data?.error || 'Ошибка');
    }
  };

  const openAuditSummary = async (audit) => {
    try {
      const progressRes = await adminGetFrontmenProgress(audit._id);
      setSummaryData(progressRes.data);
      setSummaryAuditName(audit.name);
      setShowSummaryModal(true);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteAudit = async (id) => {
    if (!window.confirm('Удалить аудит и все его результаты? Это действие необратимо.')) return;
    try {
      await adminDeleteAudit(id);
      await loadAudits();
      if (selectedAuditId === id) {
        setSelectedAuditId(null);
        setStats([]);
        setReviews([]);
      }
    } catch (e) {
      alert(e.response?.data?.error || 'Ошибка');
    }
  };

  const handleDeleteReview = async (id) => {
    if (!window.confirm('Удалить этот отзыв?')) return;
    await adminDeleteReview(id);
    loadData();
  };

  const openVotesPage = (setName, status) => {
    const params = new URLSearchParams({
      auditId: selectedAuditId,
      set: setName,
      status: status
    });
    navigate(`/admin/review/votes?${params.toString()}`);
  };

  const getImageUrl = (r) => {
    const img = r.product?.images?.[0] || r.productSnapshot?.image;
    if (img) return img;
    const driveId = r.product?.driveImages?.[0];
    if (driveId) return `https://drive.google.com/thumbnail?id=${driveId}&sz=w100`;
    return '/placeholder.png';
  };

  const allSets = [...new Set(stats.map((s) => s._id).filter(Boolean))].sort();
  const selectedAudit = audits.find(a => a._id === selectedAuditId);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Заголовок */}
      <div className="admin-page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="admin-page-title">Результаты аудита</h1>
          <p style={{ color: 'var(--slate)', fontSize: 13, margin: '2px 0 0' }}>
            Управление аудитами и просмотр результатов
          </p>
        </div>
        {canEdit && !activeAudit && (
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 700,
              background: '#e10523',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            + Новый аудит
          </button>
        )}
      </div>

      {/* Активный аудит */}
      {activeAudit && (
        <div
          style={{
            background: '#f0f9ff',
            border: '2px solid #3b82f6',
            borderRadius: 12,
            padding: 20,
            marginBottom: 20,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#3b82f6', marginBottom: 4 }}>
              АКТИВНЫЙ АУДИТ
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1c1c1c' }}>
              {activeAudit.name}
            </div>
            <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
              Срок: {formatDateLong(activeAudit.deadline)}
            </div>
          </div>
          {canEdit && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button
                onClick={toggleFrontmenChecklist}
                style={{
                  padding: '10px 16px',
                  fontSize: 13,
                  fontWeight: 600,
                  background: showFrontmenChecklist ? '#1c1c1c' : '#fff',
                  color: showFrontmenChecklist ? '#fff' : '#555',
                  border: '1px solid #ddd',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                👥 Фронтмены {showFrontmenChecklist ? '▲' : '▼'}
              </button>
              <button
                onClick={() => handleCompleteAudit(activeAudit._id)}
                style={{
                  padding: '10px 20px',
                  fontSize: 13,
                  fontWeight: 600,
                  background: '#22c55e',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                ✓ Завершить аудит
              </button>
              <button
                onClick={() => handleDeleteAudit(activeAudit._id)}
                style={{
                  padding: '10px 16px',
                  fontSize: 13,
                  fontWeight: 600,
                  background: '#fff',
                  color: '#ef4444',
                  border: '1px solid #fcc',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                Удалить
              </button>
            </div>
          )}
        </div>
      )}

      {/* Чеклист фронтменов */}
      {showFrontmenChecklist && canEdit && (
        <div
          style={{
            background: '#fff',
            border: '1px solid #e5e5e5',
            borderRadius: 12,
            padding: 20,
            marginBottom: 20,
            boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: '#333' }}>
            Прогресс фронтменов
          </div>
          {frontmenProgress.length === 0 ? (
            <div style={{ color: '#888', fontSize: 13 }}>Загрузка...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {(() => {
                const CHANNEL_LABELS = {
                  'matkasym_home': '🏠 Matkasym Home',
                  'make_in': '🛠 Make In',
                  'matkasym_kz': '🇰🇿 Matkasym KZ',
                  'matkasym_horeca': '🍽 Matkasym HoReCa',
                  'matkasym_kyzmat': '🔧 Matkasym Kyzmat',
                };
                const grouped = {};
                frontmenProgress.forEach(fm => {
                  const ch = fm.channel || 'other';
                  if (!grouped[ch]) grouped[ch] = [];
                  grouped[ch].push(fm);
                });
                const order = ['matkasym_home', 'make_in', 'matkasym_kz', 'matkasym_horeca', 'matkasym_kyzmat', 'other'];
                return order.filter(ch => grouped[ch]).map(channel => (
                  <div key={channel}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#888', marginBottom: 8 }}>
                      {CHANNEL_LABELS[channel] || '📦 Другие'}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {grouped[channel].map(fm => (
                        <div
                          key={fm._id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '10px 14px',
                            background: fm.completed ? '#f0fdf4' : '#fafafa',
                            borderRadius: 8,
                            border: fm.completed ? '1px solid #bbf7d0' : '1px solid #eee',
                          }}
                        >
                          <div
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: '50%',
                              background: fm.completed ? '#22c55e' : '#e5e5e5',
                              color: fm.completed ? '#fff' : '#999',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 14,
                              fontWeight: 700,
                              flexShrink: 0,
                            }}
                          >
                            {fm.completed ? '✓' : ''}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: fm.color || '#888' }} />
                            <span style={{ fontWeight: 600, fontSize: 14 }}>{fm.name}</span>
                          </div>
                          <div style={{ width: 80 }}>
                            <div style={{ height: 6, background: '#e5e5e5', borderRadius: 3, overflow: 'hidden' }}>
                              <div
                                style={{
                                  width: `${fm.progress}%`,
                                  height: '100%',
                                  background: fm.completed ? '#22c55e' : fm.color || '#3b82f6',
                                  borderRadius: 3,
                                  transition: 'width 0.3s',
                                }}
                              />
                            </div>
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: fm.completed ? '#22c55e' : '#666', minWidth: 45, textAlign: 'right' }}>
                            {fm.progress}%
                          </div>
                          <div style={{ fontSize: 12, color: '#888', minWidth: 70, textAlign: 'right' }}>
                            {fm.reviewed}/{fm.total}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      )}

      {/* Выбор аудита */}
      {audits.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#888', marginBottom: 8 }}>
            История аудитов:
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {audits.map(a => (
              <div
                key={a._id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0,
                  background: selectedAuditId === a._id ? '#1c1c1c' : '#f5f5f5',
                  borderRadius: 20,
                  overflow: 'hidden',
                }}
              >
                <button
                  onClick={() => setSelectedAuditId(a._id)}
                  style={{
                    padding: '8px 12px 8px 16px',
                    fontSize: 13,
                    fontWeight: 600,
                    background: 'transparent',
                    color: selectedAuditId === a._id ? '#fff' : '#555',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {a.status === 'active' && <span style={{ color: '#22c55e' }}>●</span>}
                  {a.name}
                </button>
                {canEdit && a.status === 'completed' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); openAuditSummary(a); }}
                    title="Итоги аудита"
                    style={{
                      padding: '8px 6px 8px 6px',
                      fontSize: 12,
                      background: 'transparent',
                      color: selectedAuditId === a._id ? '#fff' : '#888',
                      border: 'none',
                      cursor: 'pointer',
                      lineHeight: 1,
                    }}
                  >
                    📊
                  </button>
                )}
                {canEdit && a.status !== 'active' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteAudit(a._id); }}
                    title="Удалить аудит"
                    style={{
                      padding: '8px 12px 8px 6px',
                      fontSize: 14,
                      background: 'transparent',
                      color: selectedAuditId === a._id ? '#ff6b6b' : '#999',
                      border: 'none',
                      cursor: 'pointer',
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Статистика по сетам */}
      {selectedAudit && (
        <div
          style={{
            background: '#fff',
            borderRadius: 12,
            padding: 24,
            marginBottom: 20,
            boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
              Статистика: {selectedAudit.name}
            </h2>
            <div style={{ fontSize: 12, color: '#888' }}>
              {selectedAudit.status === 'completed' ? (
                <span style={{ color: '#22c55e' }}>✓ Завершён {formatDate(selectedAudit.completedAt)}</span>
              ) : (
                <span>Срок: {formatDateLong(selectedAudit.deadline)}</span>
              )}
            </div>
          </div>

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
                      {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                        const count = statusMap[key] || 0;
                        return (
                          <div
                            key={key}
                            onClick={() => count > 0 && openVotesPage(s._id, key)}
                            style={{
                              flex: 1,
                              padding: '8px 4px',
                              background: cfg.bg,
                              borderRadius: 8,
                              textAlign: 'center',
                              cursor: count > 0 ? 'pointer' : 'default',
                              transition: 'transform 0.1s, box-shadow 0.1s',
                            }}
                            onMouseEnter={(e) => {
                              if (count > 0) {
                                e.currentTarget.style.transform = 'scale(1.02)';
                                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = 'scale(1)';
                              e.currentTarget.style.boxShadow = 'none';
                            }}
                          >
                            <div style={{ fontSize: 18, fontWeight: 700, color: cfg.color }}>
                              {count}
                            </div>
                            <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{cfg.label}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Фильтры */}
      {selectedAudit && (
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
            style={{ padding: '8px 12px', fontSize: 13, border: '1px solid #ddd', borderRadius: 8, background: '#fff', cursor: 'pointer' }}
          >
            <option value="">Все сеты</option>
            {allSets.map((s) => (
              <option key={s} value={s}>{setLabel(s)}</option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{ padding: '8px 12px', fontSize: 13, border: '1px solid #ddd', borderRadius: 8, background: '#fff', cursor: 'pointer' }}
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
      )}

      {/* Таблица результатов */}
      {selectedAudit && (
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
                              style={{ width: 44, height: 44, objectFit: 'contain', borderRadius: 6, background: '#f8f8f8' }}
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
                          <span style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px', background: '#f0f0f0', borderRadius: 6 }}>
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
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: r.frontman?.color || '#888' }} />
                            <span style={{ fontWeight: 500 }}>{r.frontman?.name || '—'}</span>
                          </div>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center', color: '#888', fontSize: 12 }}>
                          {formatDate(r.updatedAt)}
                        </td>
                        {canEdit && (
                          <td style={{ padding: '12px', textAlign: 'center' }}>
                            <button
                              onClick={() => handleDeleteReview(r._id)}
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
      )}

      {/* Нет аудитов */}
      {audits.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: 60, color: '#aaa' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
          <div style={{ fontSize: 16, marginBottom: 8 }}>Нет аудитов</div>
          <div style={{ fontSize: 13 }}>Создайте первый аудит, чтобы начать проверку товаров</div>
        </div>
      )}

      {/* Модалка создания аудита */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreateModal(false); }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              padding: 32,
              width: 400,
              maxWidth: '90vw',
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24, margin: '0 0 24px' }}>
              Новый аудит
            </h2>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#888', marginBottom: 6 }}>
                НАЗВАНИЕ
              </div>
              <input
                type="text"
                value={newAuditName}
                onChange={(e) => setNewAuditName(e.target.value)}
                placeholder="Аудит Q2 2026"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  fontSize: 14,
                  border: '1px solid #ddd',
                  borderRadius: 8,
                }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#888', marginBottom: 6 }}>
                ДЕДЛАЙН
              </div>
              <input
                type="date"
                value={newAuditDeadline}
                onChange={(e) => setNewAuditDeadline(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  fontSize: 14,
                  border: '1px solid #ddd',
                  borderRadius: 8,
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{
                  padding: '12px 24px',
                  fontSize: 14,
                  fontWeight: 600,
                  background: '#f5f5f5',
                  color: '#555',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                Отмена
              </button>
              <button
                onClick={handleCreateAudit}
                disabled={!newAuditName.trim() || !newAuditDeadline || creating}
                style={{
                  padding: '12px 24px',
                  fontSize: 14,
                  fontWeight: 700,
                  background: '#e10523',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  cursor: !newAuditName.trim() || !newAuditDeadline || creating ? 'not-allowed' : 'pointer',
                  opacity: !newAuditName.trim() || !newAuditDeadline || creating ? 0.5 : 1,
                }}
              >
                {creating ? 'Создание...' : 'Создать и уведомить'}
              </button>
            </div>

            <div style={{ marginTop: 16, fontSize: 12, color: '#888', textAlign: 'center' }}>
              Фронтмены получат уведомление в Telegram и Email
            </div>
          </div>
        </div>
      )}

      {/* Модалка итогов аудита */}
      {showSummaryModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowSummaryModal(false); }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              padding: 32,
              width: 480,
              maxWidth: '95vw',
              maxHeight: '85vh',
              overflow: 'auto',
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>
                Аудит завершён!
              </h2>
              <p style={{ color: '#666', fontSize: 14, margin: 0 }}>
                {summaryAuditName}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
              {(() => {
                const CHANNEL_LABELS = {
                  'matkasym_home': '🏠 Matkasym Home',
                  'make_in': '🛠 Make In',
                  'matkasym_kz': '🇰🇿 Matkasym KZ',
                  'matkasym_horeca': '🍽 Matkasym HoReCa',
                  'matkasym_kyzmat': '🔧 Matkasym Kyzmat',
                };
                const grouped = {};
                summaryData.forEach(fm => {
                  const ch = fm.channel || 'other';
                  if (!grouped[ch]) grouped[ch] = [];
                  grouped[ch].push(fm);
                });
                const order = ['matkasym_home', 'make_in', 'matkasym_kz', 'matkasym_horeca', 'matkasym_kyzmat', 'other'];
                return order.filter(ch => grouped[ch]).map(channel => (
                  <div key={channel}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 8 }}>
                      {CHANNEL_LABELS[channel] || '📦 Другие'}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {grouped[channel].map(fm => (
                        <div
                          key={fm._id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '10px 14px',
                            background: fm.completed ? '#f0fdf4' : '#fef2f2',
                            borderRadius: 10,
                            border: fm.completed ? '1px solid #bbf7d0' : '1px solid #fecaca',
                          }}
                        >
                          <div
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: '50%',
                              background: fm.completed ? '#22c55e' : '#ef4444',
                              color: '#fff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 12,
                              fontWeight: 700,
                              flexShrink: 0,
                            }}
                          >
                            {fm.completed ? '✓' : '!'}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: fm.color || '#888' }} />
                            <span style={{ fontWeight: 600, fontSize: 13 }}>{fm.name}</span>
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: fm.completed ? '#22c55e' : '#ef4444' }}>
                            {fm.progress}%
                          </div>
                          <div style={{ fontSize: 11, color: '#888', minWidth: 50, textAlign: 'right' }}>
                            {fm.reviewed}/{fm.total}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </div>

            <div style={{ textAlign: 'center' }}>
              <button
                onClick={() => setShowSummaryModal(false)}
                style={{
                  padding: '12px 32px',
                  fontSize: 14,
                  fontWeight: 700,
                  background: '#1c1c1c',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
