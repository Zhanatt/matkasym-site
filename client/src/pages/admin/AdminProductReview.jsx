import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  adminGetMySets,
  adminGetAllSetProducts,
  adminSubmitReview,
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
const setLabel = (s) => SET_NAMES[s] || s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const STATUS_CONFIG = {
  keep: { label: 'Оставить', color: '#22c55e', bg: '#f0fdf4', icon: '✓' },
  improve: { label: 'Улучшить', color: '#f59e0b', bg: '#fffbeb', icon: '⚙' },
  discontinue: { label: 'Снять', color: '#ef4444', bg: '#fef2f2', icon: '✕' },
};

const PRODUCT_STATUS_LABELS = {
  for_sale: 'В продаже',
  planned: 'Запланирован',
  in_development: 'В разработке',
  improvement: 'На доработке',
  discontinued: 'Снят',
  liquidation: 'Неликвид',
  on_pause: 'На паузе',
  test_sale: 'Тест. продажа',
};

const STOCK_STATUS_LABELS = {
  in_stock: 'В наличии',
  out_of_stock: 'Нет в наличии',
  expected: 'Ожидается',
};

const formatDate = (d) => new Date(d).toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' });
const formatDeadline = (d) => {
  const deadline = new Date(d);
  const now = new Date();
  const diff = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { text: `Просрочен на ${Math.abs(diff)} дн.`, color: '#ef4444' };
  if (diff === 0) return { text: 'Сегодня!', color: '#f59e0b' };
  if (diff <= 3) return { text: `${diff} дн. осталось`, color: '#f59e0b' };
  return { text: formatDate(d), color: '#666' };
};

export default function AdminProductReview() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [frontman, setFrontman] = useState(null);
  const [sets, setSets] = useState([]);
  const [activeAudit, setActiveAudit] = useState(null);
  const [overdueAudits, setOverdueAudits] = useState([]);

  // Режим опроса
  const [activeSet, setActiveSet] = useState(null);
  const [currentAuditId, setCurrentAuditId] = useState(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [auditStatus, setAuditStatus] = useState(null);
  const [products, setProducts] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Комментарий
  const [pendingStatus, setPendingStatus] = useState(null);
  const [comment, setComment] = useState('');

  // Детали товара
  const [showDetails, setShowDetails] = useState(false);

  const loadSets = useCallback(async () => {
    try {
      const res = await adminGetMySets();
      setSets(res.data.sets || []);
      setFrontman(res.data.frontman);
      setActiveAudit(res.data.activeAudit);
      setOverdueAudits(res.data.overdueAudits || []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    loadSets().finally(() => setLoading(false));
  }, [loadSets]);

  const openSet = useCallback(async (setSlug, auditId = null) => {
    setLoading(true);
    try {
      const aid = auditId || activeAudit?._id;
      console.log('openSet: aid=', aid, 'activeAudit=', activeAudit);
      const res = await adminGetAllSetProducts(setSlug, aid);
      console.log('openSet response:', res.data);

      if (!res.data.audit?._id) {
        alert('Ошибка: сервер не вернул audit ID. Возможно нет активного аудита.');
        setLoading(false);
        return;
      }

      const prods = res.data.products || [];
      setProducts(prods);
      setIsCompleted(res.data.isCompleted);
      setActiveSet(setSlug);
      setCurrentAuditId(res.data.audit._id);
      setAuditStatus(res.data.audit.status);

      const firstUnreviewed = prods.findIndex(p => !p.review);
      setCurrentIndex(firstUnreviewed >= 0 ? firstUnreviewed : 0);

      setPendingStatus(null);
      setComment('');
      setShowDetails(false);
    } catch (e) {
      console.error('openSet error:', e);
      alert(e.response?.data?.error || e.message || 'Ошибка загрузки сета');
    } finally {
      setLoading(false);
    }
  }, [activeAudit]);

  const goToProduct = (index) => {
    setCurrentIndex(index);
    setPendingStatus(null);
    setComment('');
    setShowDetails(false);
  };

  const submitStatus = async (status) => {
    if (status === 'improve' || status === 'discontinue') {
      const existingReview = products[currentIndex]?.review;
      if (existingReview?.status === status && existingReview?.comment) {
        setComment(existingReview.comment);
      }
      setPendingStatus(status);
      return;
    }
    await doSubmit(status, '');
  };

  const doSubmit = async (status, commentText) => {
    const product = products[currentIndex];
    if (!product) return;

    if (!currentAuditId) {
      alert('Ошибка: нет активного аудита (currentAuditId is null)');
      return;
    }

    setSubmitting(true);
    try {
      const response = await adminSubmitReview({
        productId: product._id,
        status,
        comment: commentText,
        auditId: currentAuditId,
      });

      if (!response.data.ok) {
        throw new Error(response.data.error || 'Ошибка сохранения');
      }

      setProducts(prev => prev.map((p, i) =>
        i === currentIndex
          ? { ...p, review: { status, comment: commentText } }
          : p
      ));

      setPendingStatus(null);
      setComment('');
      setShowDetails(false);

      const nextUnreviewed = products.findIndex((p, i) => i > currentIndex && !p.review);
      if (nextUnreviewed >= 0) {
        setCurrentIndex(nextUnreviewed);
      } else {
        const anyUnreviewed = products.findIndex((p, i) => i !== currentIndex && !p.review);
        if (anyUnreviewed >= 0) {
          setCurrentIndex(anyUnreviewed);
        } else {
          setIsCompleted(true);
          loadSets();
        }
      }
    } catch (e) {
      console.error('Review submit error:', e);
      alert(e.response?.data?.error || e.message || 'Ошибка сохранения отзыва');
    } finally {
      setSubmitting(false);
    }
  };

  const cancelComment = () => {
    setPendingStatus(null);
    setComment('');
  };

  const backToSets = async () => {
    setLoading(true);
    setActiveSet(null);
    setProducts([]);
    setCurrentIndex(0);
    setIsCompleted(false);
    setCurrentAuditId(null);
    setAuditStatus(null);
    setPendingStatus(null);
    setComment('');
    await loadSets();
    setLoading(false);
  };

  const currentProduct = products[currentIndex];
  const reviewedCount = products.filter(p => p.review).length;
  const progress = products.length > 0 ? (reviewedCount / products.length) * 100 : 0;

  const getImageUrl = (p) => {
    if (p.images?.[0]) return p.images[0];
    if (p.driveImages?.[0]) return `https://drive.google.com/thumbnail?id=${p.driveImages[0]}&sz=w600`;
    return '/logos/no-photo.png';
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <div style={{ color: '#888', fontSize: 15 }}>Загрузка...</div>
      </div>
    );
  }

  if (!frontman) {
    return (
      <div style={{ maxWidth: 600, margin: '80px auto', textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Нет доступа</h2>
        <p style={{ color: '#666', fontSize: 14 }}>
          Вы не являетесь фронтменом. Обратитесь к администратору для назначения.
        </p>
      </div>
    );
  }

  // Экран выбора сета
  if (!activeSet) {
    const deadlineInfo = activeAudit?.deadline ? formatDeadline(activeAudit.deadline) : null;

    return (
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '20px 16px' }}>
        {/* Предупреждение о просроченных аудитах */}
        {overdueAudits.length > 0 && (
          <div
            style={{
              background: '#fef2f2',
              border: '2px solid #ef4444',
              borderRadius: 12,
              padding: 16,
              marginBottom: 20,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: '#ef4444', marginBottom: 8 }}>
              ⚠️ У вас есть незавершённые аудиты:
            </div>
            {overdueAudits.map(a => (
              <div key={a._id} style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>
                • {a.name} (срок: {formatDate(a.deadline)})
              </div>
            ))}
          </div>
        )}

        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 6, letterSpacing: -0.5 }}>
            Аудит ассортимента
          </h1>
          <p style={{ color: '#666', fontSize: 14, margin: 0 }}>
            {frontman.name}, выберите сет для проверки
          </p>
        </div>

        {/* Активный аудит */}
        {activeAudit ? (
          <div
            style={{
              background: '#f0f9ff',
              border: '2px solid #3b82f6',
              borderRadius: 12,
              padding: 20,
              marginBottom: 24,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#3b82f6', marginBottom: 4 }}>
                  АКТИВНЫЙ АУДИТ
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#1c1c1c' }}>
                  {activeAudit.name}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: '#888' }}>Срок:</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: deadlineInfo?.color }}>
                  {deadlineInfo?.text}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div
            style={{
              background: '#f8f8f8',
              borderRadius: 12,
              padding: 40,
              textAlign: 'center',
              marginBottom: 24,
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 15, color: '#888' }}>
              Нет активного аудита
            </div>
            <div style={{ fontSize: 13, color: '#aaa', marginTop: 4 }}>
              Дождитесь объявления нового аудита администратором
            </div>
          </div>
        )}

        {/* Список сетов */}
        {activeAudit && (
          <div style={{ display: 'grid', gap: 12 }}>
            {sets.map((s) => {
              const done = s.reviewed >= s.total && s.total > 0;
              const pct = s.total > 0 ? Math.round((s.reviewed / s.total) * 100) : 0;

              return (
                <button
                  key={s.slug}
                  onClick={() => openSet(s.slug)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '20px 24px',
                    background: done ? '#f0fdf4' : '#fff',
                    border: `2px solid ${done ? '#22c55e' : frontman.color || '#333'}`,
                    borderRadius: 12,
                    cursor: 'pointer',
                    transition: 'transform 0.15s, box-shadow 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#1c1c1c' }}>
                      {setLabel(s.slug)}
                    </div>
                    <div style={{ fontSize: 13, color: done ? '#22c55e' : '#888', marginTop: 4 }}>
                      {s.reviewed} из {s.total} проверено
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ width: 100, height: 6, background: done ? '#bbf7d0' : '#eee', borderRadius: 3 }}>
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          background: done ? '#22c55e' : frontman.color || '#333',
                          borderRadius: 3,
                          transition: 'width 0.3s',
                        }}
                      />
                    </div>

                    {done ? (
                      <span style={{
                        fontSize: 20,
                        color: '#22c55e',
                        background: '#dcfce7',
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>✓</span>
                    ) : (
                      <span style={{ fontSize: 14, fontWeight: 600, color: frontman.color || '#333' }}>
                        {s.total - s.reviewed} →
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {sets.length === 0 && activeAudit && (
          <div style={{ textAlign: 'center', padding: 60, color: '#aaa' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
            <div>У вас нет назначенных сетов</div>
          </div>
        )}
      </div>
    );
  }

  // Режим просмотра (сет завершён или аудит завершён)
  const isReadOnly = isCompleted || auditStatus === 'completed';

  // Экран опроса / просмотра
  return (
    <div style={{ maxWidth: 500, margin: '0 auto', padding: '16px' }}>
      {/* Шапка */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button
          onClick={backToSets}
          style={{
            padding: '8px 12px',
            fontSize: 13,
            fontWeight: 600,
            background: '#f5f5f5',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            color: '#555',
          }}
        >
          ← Назад
        </button>
        <div style={{ fontSize: 14, fontWeight: 600, color: isCompleted ? '#22c55e' : frontman.color || '#333' }}>
          {setLabel(activeSet)} {isCompleted && '✓'}
        </div>
        <div style={{ fontSize: 13, color: '#888' }}>
          {reviewedCount} / {products.length}
        </div>
      </div>

      {/* Прогресс */}
      <div style={{ height: 4, background: '#eee', borderRadius: 2, marginBottom: 12 }}>
        <div
          style={{
            width: `${progress}%`,
            height: '100%',
            background: isCompleted ? '#22c55e' : frontman.color || '#333',
            borderRadius: 2,
            transition: 'width 0.3s',
          }}
        />
      </div>

      {/* Миниатюры навигации */}
      <div style={{
        display: 'flex',
        gap: 6,
        marginBottom: 16,
        overflowX: 'auto',
        paddingBottom: 8,
        WebkitOverflowScrolling: 'touch',
      }}>
        {products.map((p, i) => {
          const review = p.review;
          const isCurrent = i === currentIndex;
          const cfg = review ? STATUS_CONFIG[review.status] : null;

          return (
            <button
              key={p._id}
              onClick={() => goToProduct(i)}
              style={{
                width: 40,
                height: 40,
                minWidth: 40,
                borderRadius: 8,
                border: isCurrent ? '2px solid #333' : '2px solid transparent',
                background: cfg ? cfg.bg : '#f5f5f5',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                color: cfg ? cfg.color : '#ccc',
                fontWeight: 700,
                transition: 'transform 0.1s',
                transform: isCurrent ? 'scale(1.1)' : 'scale(1)',
              }}
            >
              {cfg ? cfg.icon : (i + 1)}
            </button>
          );
        })}
      </div>

      {/* Карточка товара */}
      {currentProduct && (
        <>
          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              overflow: 'hidden',
              boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
            }}
          >
            {/* Фото */}
            <div
              style={{
                aspectRatio: '1',
                background: '#f8f8f8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <img
                src={getImageUrl(currentProduct)}
                alt={currentProduct.name}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                onError={(e) => { e.target.src = '/placeholder.png'; }}
              />

              {currentProduct.review && (
                <div
                  style={{
                    position: 'absolute',
                    top: 12,
                    right: 12,
                    padding: '6px 12px',
                    borderRadius: 20,
                    background: STATUS_CONFIG[currentProduct.review.status].bg,
                    color: STATUS_CONFIG[currentProduct.review.status].color,
                    fontSize: 12,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  {STATUS_CONFIG[currentProduct.review.status].icon} {STATUS_CONFIG[currentProduct.review.status].label}
                </div>
              )}
            </div>

            {/* Инфо */}
            <div style={{ padding: '20px 24px' }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6, lineHeight: 1.3 }}>
                {currentProduct.fullName || currentProduct.name}
              </h2>

              {currentProduct.sku && (
                <div style={{ fontSize: 12, color: '#aaa', marginBottom: 12 }}>
                  SKU: {currentProduct.sku}
                </div>
              )}

              {/* Цены */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 1, padding: '10px 12px', background: '#f8f8f8', borderRadius: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#333' }}>
                    {currentProduct.price?.toLocaleString('ru')}
                  </div>
                  <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>розница</div>
                </div>
                <div style={{ flex: 1, padding: '10px 12px', background: '#f8f8f8', borderRadius: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#333' }}>
                    {currentProduct.priceWholesale?.toLocaleString('ru') || '—'}
                  </div>
                  <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>опт</div>
                </div>
              </div>

              {/* Остаток и статус */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <div style={{ flex: 1, padding: '10px 12px', background: '#f8f8f8', borderRadius: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: currentProduct.stock > 0 ? '#22c55e' : '#ef4444' }}>
                    {currentProduct.stock}
                  </div>
                  <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>на складе</div>
                </div>
                <div style={{ flex: 1, padding: '10px 12px', background: '#f8f8f8', borderRadius: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#333' }}>
                    {PRODUCT_STATUS_LABELS[currentProduct.productStatus] || currentProduct.productStatus}
                  </div>
                  <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>статус</div>
                </div>
              </div>

              {/* Комментарий к отзыву */}
              {currentProduct.review?.comment && (
                <div
                  style={{
                    padding: '12px 16px',
                    background: STATUS_CONFIG[currentProduct.review.status].bg,
                    borderRadius: 10,
                    marginBottom: 12,
                    fontSize: 13,
                    color: '#555',
                    borderLeft: `3px solid ${STATUS_CONFIG[currentProduct.review.status].color}`,
                  }}
                >
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Ваш комментарий:</div>
                  {currentProduct.review.comment}
                </div>
              )}

              <button
                onClick={() => setShowDetails(!showDetails)}
                style={{
                  width: '100%',
                  padding: '10px',
                  fontSize: 13,
                  fontWeight: 600,
                  background: 'transparent',
                  border: '1px solid #e5e5e5',
                  borderRadius: 8,
                  cursor: 'pointer',
                  color: '#666',
                  marginBottom: 8,
                }}
              >
                {showDetails ? 'Скрыть детали ↑' : 'Подробнее ↓'}
              </button>

              {showDetails && (
                <div style={{ padding: '16px', background: '#fafafa', borderRadius: 10, marginBottom: 8, fontSize: 13 }}>
                  <div style={{ marginBottom: 8 }}>
                    <strong>Статус склада:</strong> {STOCK_STATUS_LABELS[currentProduct.stockStatus] || currentProduct.stockStatus}
                  </div>
                  {currentProduct.specs?.length > 0 && (
                    <div>
                      <strong>Характеристики:</strong>
                      <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                        {currentProduct.specs.map((s, i) => (
                          <li key={i}>{s.key}: {s.value}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Кнопки действий */}
          {!isReadOnly && !pendingStatus && (
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              {Object.entries(STATUS_CONFIG).map(([status, cfg]) => {
                const isSelected = currentProduct.review?.status === status;
                return (
                  <button
                    key={status}
                    onClick={() => submitStatus(status)}
                    disabled={submitting}
                    style={{
                      flex: 1,
                      padding: '16px 8px',
                      fontSize: 13,
                      fontWeight: 700,
                      background: isSelected ? cfg.color : cfg.bg,
                      color: isSelected ? '#fff' : cfg.color,
                      border: `2px solid ${cfg.color}`,
                      borderRadius: 12,
                      cursor: submitting ? 'wait' : 'pointer',
                      opacity: submitting ? 0.6 : 1,
                      transition: 'all 0.15s',
                    }}
                  >
                    {cfg.icon} {cfg.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Форма комментария */}
          {!isReadOnly && pendingStatus && (
            <div
              style={{
                marginTop: 20,
                padding: 20,
                background: STATUS_CONFIG[pendingStatus].bg,
                border: `2px solid ${STATUS_CONFIG[pendingStatus].color}`,
                borderRadius: 14,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: STATUS_CONFIG[pendingStatus].color, marginBottom: 12 }}>
                {pendingStatus === 'improve' ? 'Что нужно улучшить?' : 'Причина снятия с производства'}
              </div>

              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={pendingStatus === 'improve' ? 'Опишите: упаковку, конструкцию, цвет...' : 'Укажите причину: низкий спрос, устарел...'}
                autoFocus
                style={{
                  width: '100%',
                  minHeight: 80,
                  padding: 14,
                  fontSize: 14,
                  border: '1px solid #ddd',
                  borderRadius: 10,
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  marginBottom: 12,
                }}
              />

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={cancelComment}
                  style={{ flex: 1, padding: '12px', fontSize: 14, fontWeight: 600, background: '#fff', color: '#666', border: '1px solid #ddd', borderRadius: 10, cursor: 'pointer' }}
                >
                  Отмена
                </button>
                <button
                  onClick={() => doSubmit(pendingStatus, comment)}
                  disabled={!comment.trim() || submitting}
                  style={{
                    flex: 2,
                    padding: '12px',
                    fontSize: 14,
                    fontWeight: 700,
                    background: STATUS_CONFIG[pendingStatus].color,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 10,
                    cursor: !comment.trim() || submitting ? 'not-allowed' : 'pointer',
                    opacity: !comment.trim() || submitting ? 0.5 : 1,
                  }}
                >
                  {submitting ? 'Сохранение...' : 'Подтвердить'}
                </button>
              </div>
            </div>
          )}

          {/* Режим просмотра */}
          {isReadOnly && (
            <div
              style={{
                marginTop: 20,
                padding: 20,
                background: '#f0fdf4',
                border: '2px solid #22c55e',
                borderRadius: 14,
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 8 }}>✓</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#22c55e' }}>
                {auditStatus === 'completed' ? 'Аудит завершён' : 'Сет завершён'}
              </div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                Просмотр результатов. Редактирование недоступно.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
