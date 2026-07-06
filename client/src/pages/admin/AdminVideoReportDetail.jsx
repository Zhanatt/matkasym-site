import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { adminGetVideoScheduleFrontmanReport } from '../../api';

const BRAND_META = {
  'matkasym-home': { label: 'HOME', accent: '#DC1E24' },
  'matkasym-shaar': { label: 'SHAAR', accent: '#3463A3' },
  'matkasym-kyzmat': { label: 'KYZMAT', accent: '#267846' },
};

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
const setLabel = s => SET_NAMES[s] || (s || '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const WEEKDAYS_MON = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const DRIVE_URL = 'https://drive.google.com/thumbnail?id=';

// Локальная дата (не UTC!) — иначе для UTC+6 полночь уезжает на прошлый день
function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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

function dayTitle(key) {
  return new Date(key + 'T00:00:00').toLocaleDateString('ru-RU', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

function ProductThumb({ product, size = 40 }) {
  const src = product?.driveImages?.[0]
    ? `${DRIVE_URL}${product.driveImages[0]}&sz=w80`
    : product?.images?.[0] || '/placeholder.png';
  return (
    <img
      src={src}
      alt=""
      style={{ width: size, height: size, objectFit: 'cover', borderRadius: 6, background: '#f5f5f5', flexShrink: 0 }}
    />
  );
}

function ProductRow({ product, badge, badgeColor, badgeBg }) {
  if (!product) return null;
  return (
    <Link
      to={`/admin/products/${product._id}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
        background: '#fff', borderRadius: 12, border: '1px solid #f0f0ee',
        textDecoration: 'none', color: 'inherit',
      }}
    >
      <ProductThumb product={product} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {product.name}
        </div>
        <div style={{ fontSize: 11.5, color: '#999' }}>
          {setLabel(product.set)}{product.sku ? ` · ${product.sku}` : ''}
        </div>
      </div>
      {badge && (
        <span style={{
          fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 8,
          color: badgeColor, background: badgeBg, whiteSpace: 'nowrap', flexShrink: 0,
        }}>{badge}</span>
      )}
    </Link>
  );
}

export default function AdminVideoReportDetail() {
  const { frontmanId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState(null);
  const [openSets, setOpenSets] = useState({});

  useEffect(() => {
    setLoading(true);
    adminGetVideoScheduleFrontmanReport(frontmanId)
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.data?.error || 'Не удалось загрузить отчёт'))
      .finally(() => setLoading(false));
  }, [frontmanId]);

  const todayKey = formatDate(new Date());

  // Съёмки по дням: снятые — по дате выполнения, плановые — по плановой дате
  const { shotByDay, planByDay, scheduleByDate } = useMemo(() => {
    const shot = {}, plan = {}, byDate = {};
    (data?.schedules || []).forEach(s => {
      if (!s.product) return;
      const planKey = formatDate(new Date(s.plannedDate));
      if (!byDate[planKey]) byDate[planKey] = [];
      byDate[planKey].push(s);
      if (s.isCompleted) {
        const key = formatDate(new Date(s.completedAt || s.plannedDate));
        if (!shot[key]) shot[key] = [];
        shot[key].push(s);
      } else {
        if (!plan[planKey]) plan[planKey] = [];
        plan[planKey].push(s);
      }
    });
    return { shotByDay: shot, planByDay: plan, scheduleByDate: byDate };
  }, [data?.schedules]);

  const scheduledIds = useMemo(
    () => new Set((data?.schedules || []).map(s => s.product?._id).filter(Boolean)),
    [data?.schedules]
  );

  // Снято вне плана: есть видео, но нет записи в расписании
  const shotOutsidePlan = useMemo(
    () => (data?.products || []).filter(p => p.hasVideo && !scheduledIds.has(p._id)),
    [data?.products, scheduledIds]
  );

  // Не снято и не запланировано — по сетам
  const notShotBySets = useMemo(() => {
    const rest = (data?.products || []).filter(p => !p.hasVideo && !scheduledIds.has(p._id));
    const groups = {};
    rest.forEach(p => {
      if (!groups[p.set]) groups[p.set] = [];
      groups[p.set].push(p);
    });
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
  }, [data?.products, scheduledIds]);

  if (loading) return <div className="admin-empty">Загрузка...</div>;
  if (error) {
    return (
      <div className="admin-empty" style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <div>{error}</div>
      </div>
    );
  }

  const { frontman, user, stats } = data;
  const accent = frontman.color || '#3498db';
  const brandMeta = BRAND_META[frontman.brand];
  const initials = frontman.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const totalShot = stats.withVideo;
  const pendingPlanned = stats.scheduled - stats.completed;
  const notShotCount = notShotBySets.reduce((n, [, items]) => n + items.length, 0);
  const progress = stats.total > 0 ? Math.round((totalShot / stats.total) * 100) : 0;

  const shotDays = Object.keys(shotByDay).sort((a, b) => b.localeCompare(a));   // свежие сверху
  const planDays = Object.keys(planByDay).sort((a, b) => a.localeCompare(b));   // ближайшие сверху
  const overdueCount = planDays
    .filter(d => d < todayKey)
    .reduce((n, d) => n + planByDay[d].length, 0);

  const { first, cells } = getMonthGrid(monthOffset);
  const monthLabel = first.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });

  const dayItems = selectedDay ? (scheduleByDate[selectedDay] || []) : [];

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      {/* Назад */}
      <button
        onClick={() => navigate('/admin/video-report')}
        style={{ background: 'none', border: 'none', color: '#888', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '4px 0', marginBottom: 12 }}
      >← Отчёт по видео-съёмкам</button>

      {/* Шапка фронтмена */}
      <div style={{ background: '#fff', borderRadius: 16, padding: '20px 22px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%', background: accent, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 700, flexShrink: 0,
          }}>{initials}</div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: '#111' }}>{frontman.name}</span>
              {brandMeta && (
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, color: '#fff', background: brandMeta.accent, borderRadius: 6, padding: '3px 8px' }}>
                  {brandMeta.label}
                </span>
              )}
            </div>
            {user?.email && <div style={{ fontSize: 12.5, color: '#888', marginTop: 2 }}>{user.email}</div>}
            <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>
              Сеты: {(frontman.sets || []).map(setLabel).join(', ')}
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: accent }}>{progress}%</div>
        </div>
        <div style={{ height: 10, background: '#f0f0ee', borderRadius: 5, overflow: 'hidden', marginTop: 14 }}>
          <div style={{ width: `${progress}%`, height: '100%', background: accent, borderRadius: 5, transition: 'width .4s' }} />
        </div>
        <div style={{ fontSize: 12, color: '#999', marginTop: 6 }}>
          Снято {totalShot} из {stats.total} товаров
        </div>
      </div>

      {/* Статистика */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Всего товаров', value: stats.total, color: '#3498db' },
          { label: 'Снято', value: totalShot, color: '#27ae60' },
          { label: 'В плане', value: pendingPlanned, color: '#f39c12' },
          { label: 'Не запланировано', value: notShotCount, color: '#e74c3c' },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', borderLeft: `4px solid ${s.color}` }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Календарь */}
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #eee', padding: '16px 14px', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <button onClick={() => setMonthOffset(o => o - 1)} style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid #e5e5e5', background: '#fff', fontSize: 16, cursor: 'pointer', color: '#555' }}>‹</button>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#111', textTransform: 'capitalize' }}>{monthLabel}</span>
          <button onClick={() => setMonthOffset(o => o + 1)} style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid #e5e5e5', background: '#fff', fontSize: 16, cursor: 'pointer', color: '#555' }}>›</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 6 }}>
          {WEEKDAYS_MON.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#bbb', textTransform: 'uppercase' }}>{d}</div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
          {cells.map((date, i) => {
            if (!date) return <div key={`e${i}`} />;
            const key = formatDate(date);
            const items = scheduleByDate[key] || [];
            const has = items.length > 0;
            const allDone = has && items.every(s => s.isCompleted);
            const overdue = has && !allDone && key < todayKey;
            const isToday = key === todayKey;
            const isSelected = key === selectedDay;
            return (
              <button
                key={key}
                onClick={() => setSelectedDay(isSelected ? null : key)}
                style={{
                  aspectRatio: '1', width: '100%', borderRadius: '50%', cursor: has ? 'pointer' : 'default',
                  border: isSelected ? '2px solid #111' : isToday ? `2px solid ${accent}` : '2px solid transparent',
                  background: has ? (allDone ? '#d9f2df' : overdue ? '#fde8e8' : accent) : 'transparent',
                  color: has ? (allDone ? '#1e7e34' : overdue ? '#c0392b' : '#fff') : '#333',
                  fontSize: 14, fontWeight: isToday || has ? 800 : 500,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  lineHeight: 1.1, padding: 0, transition: 'all .15s',
                }}
              >
                {date.getDate()}
                {has && (
                  <span style={{ fontSize: 8.5, fontWeight: 700, opacity: 0.85 }}>
                    {allDone ? '✓' : `${items.filter(s => s.isCompleted).length}/${items.length}`}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 14, marginTop: 14, flexWrap: 'wrap', fontSize: 11.5, color: '#888' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#d9f2df', display: 'inline-block' }} /> всё снято
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: accent, display: 'inline-block' }} /> в плане
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#fde8e8', display: 'inline-block' }} /> просрочено
          </span>
        </div>

        {/* Выбранный день */}
        {selectedDay && (
          <div style={{ marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#111', textTransform: 'capitalize', marginBottom: 10 }}>
              {dayTitle(selectedDay)}
            </div>
            {dayItems.length === 0 ? (
              <div style={{ fontSize: 13, color: '#999' }}>На этот день ничего не запланировано</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {dayItems.map(s => (
                  <ProductRow
                    key={s._id}
                    product={s.product}
                    badge={s.isCompleted ? '✓ снято' : selectedDay < todayKey ? 'просрочено' : 'в плане'}
                    badgeColor={s.isCompleted ? '#2d7a3a' : selectedDay < todayKey ? '#c0392b' : '#b45309'}
                    badgeBg={s.isCompleted ? '#e8f5e9' : selectedDay < todayKey ? '#fde8e8' : '#fff8e1'}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── СНЯТО ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#111' }}>✅ Снято</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#2d7a3a', background: '#e8f5e9', borderRadius: 8, padding: '2px 8px' }}>{totalShot}</span>
        </div>

        {shotDays.length === 0 && shotOutsidePlan.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, fontSize: 13, color: '#999', textAlign: 'center' }}>
            Пока ничего не снято
          </div>
        ) : (
          <>
            {shotDays.map(day => (
              <div key={day} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: '#888', textTransform: 'capitalize', marginBottom: 8 }}>
                  {dayTitle(day)} · {shotByDay[day].length} шт.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {shotByDay[day].map(s => (
                    <ProductRow key={s._id} product={s.product} badge="✓ снято" badgeColor="#2d7a3a" badgeBg="#e8f5e9" />
                  ))}
                </div>
              </div>
            ))}
            {shotOutsidePlan.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: '#888', marginBottom: 8 }}>
                  Вне плана (дата неизвестна) · {shotOutsidePlan.length} шт.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {shotOutsidePlan.map(p => (
                    <ProductRow key={p._id} product={p} badge="✓ снято" badgeColor="#2d7a3a" badgeBg="#e8f5e9" />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── В ПЛАНЕ ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#111' }}>🗓 В плане</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#b45309', background: '#fff8e1', borderRadius: 8, padding: '2px 8px' }}>{pendingPlanned}</span>
          {overdueCount > 0 && (
            <span style={{ fontSize: 12, fontWeight: 700, color: '#c0392b', background: '#fde8e8', borderRadius: 8, padding: '2px 8px' }}>
              просрочено: {overdueCount}
            </span>
          )}
        </div>

        {planDays.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, fontSize: 13, color: '#999', textAlign: 'center' }}>
            Нет запланированных съёмок
          </div>
        ) : (
          planDays.map(day => {
            const overdue = day < todayKey;
            return (
              <div key={day} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: overdue ? '#c0392b' : '#888', textTransform: 'capitalize', marginBottom: 8 }}>
                  {dayTitle(day)} · {planByDay[day].length} шт.{overdue ? ' · просрочено' : ''}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {planByDay[day].map(s => (
                    <ProductRow
                      key={s._id}
                      product={s.product}
                      badge={overdue ? 'просрочено' : 'в плане'}
                      badgeColor={overdue ? '#c0392b' : '#b45309'}
                      badgeBg={overdue ? '#fde8e8' : '#fff8e1'}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── НЕ СНЯТО И НЕ ЗАПЛАНИРОВАНО ── */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#111' }}>⬜ Не снято и не запланировано</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#c0392b', background: '#fde8e8', borderRadius: 8, padding: '2px 8px' }}>{notShotCount}</span>
        </div>

        {notShotBySets.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, fontSize: 13, color: '#2d7a3a', textAlign: 'center', fontWeight: 600 }}>
            Все товары сняты или запланированы 🎉
          </div>
        ) : (
          notShotBySets.map(([set, items]) => {
            const open = !!openSets[set];
            return (
              <div key={set} style={{ background: '#fff', borderRadius: 12, border: '1px solid #f0f0ee', marginBottom: 8, overflow: 'hidden' }}>
                <button
                  onClick={() => setOpenSets(prev => ({ ...prev, [set]: !prev[set] }))}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: '#111' }}>{setLabel(set)}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#888' }}>{items.length} шт.</span>
                    <span style={{ fontSize: 12, color: '#bbb', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
                  </span>
                </button>
                {open && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0 10px 10px' }}>
                    {items.map(p => (
                      <ProductRow key={p._id} product={p} />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
