import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminGetVideoScheduleReport } from '../../api';

const BRAND_META = {
  'matkasym-home': { label: 'HOME', accent: '#DC1E24' },
  'matkasym-shaar': { label: 'SHAAR', accent: '#3463A3' },
  'matkasym-kyzmat': { label: 'KYZMAT', accent: '#267846' },
};

export default function AdminVideoReport() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState([]);

  useEffect(() => {
    adminGetVideoScheduleReport()
      .then(res => setReport(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="admin-empty">Загрузка...</div>;
  }

  const grouped = Object.entries(BRAND_META).map(([key, meta]) => ({
    brandKey: key,
    meta,
    items: report.filter(r => r.frontman.brand === key),
  }));

  const totals = report.reduce(
    (acc, r) => ({
      total: acc.total + r.stats.total,
      withVideo: acc.withVideo + r.stats.withVideo,
      scheduled: acc.scheduled + r.stats.scheduled,
      completed: acc.completed + r.stats.completed,
    }),
    { total: 0, withVideo: 0, scheduled: 0, completed: 0 }
  );

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div className="admin-page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="admin-page-title">Отчёт по видео-съёмкам</h1>
          <p style={{ color: 'var(--slate)', fontSize: 13, margin: '2px 0 0' }}>
            {report.length} фронтменов
          </p>
        </div>
      </div>

      {/* Total stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 32 }}>
        {[
          { label: 'Всего товаров', value: totals.total, color: '#3498db' },
          { label: 'Снято', value: totals.completed, color: '#27ae60' },
          { label: 'В плане', value: totals.scheduled - totals.completed, color: '#f39c12' },
          { label: 'Осталось', value: totals.total - totals.completed, color: '#e74c3c' },
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

      {grouped.map(({ brandKey, meta, items }) => {
        if (items.length === 0) return null;

        return (
          <div key={brandKey} style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 4, height: 20, background: meta.accent, borderRadius: 2 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#888', letterSpacing: 0.5 }}>
                {meta.label}
              </span>
              <span style={{ fontSize: 12, color: '#bbb' }}>{items.length}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map(({ frontman, user, stats }) => {
                const progress = stats.total > 0 ? Math.round((stats.withVideo / stats.total) * 100) : 0;
                const initials = frontman.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

                return (
                  <div
                    key={frontman._id}
                    onClick={() => navigate(`/admin/video-report/${frontman._id}`)}
                    style={{
                      background: '#fff',
                      borderRadius: 12,
                      padding: '16px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 16,
                      cursor: 'pointer',
                      transition: 'box-shadow .15s, transform .15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
                  >
                    <div style={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      background: frontman.color || '#888',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 14,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}>
                      {initials}
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
                        {frontman.name}
                      </div>
                      {user && (
                        <div style={{ fontSize: 12, color: '#888' }}>{user.email}</div>
                      )}

                      {/* Progress bar */}
                      <div style={{
                        height: 6,
                        background: '#e8e8e8',
                        borderRadius: 3,
                        marginTop: 8,
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          height: '100%',
                          width: `${progress}%`,
                          background: frontman.color || '#27ae60',
                          borderRadius: 3,
                          transition: 'width 0.3s',
                        }} />
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 20, textAlign: 'center' }}>
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#27ae60' }}>
                          {stats.withVideo}
                        </div>
                        <div style={{ fontSize: 10, color: '#888' }}>снято</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#e74c3c' }}>
                          {stats.remaining}
                        </div>
                        <div style={{ fontSize: 10, color: '#888' }}>осталось</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#888' }}>
                          {stats.total}
                        </div>
                        <div style={{ fontSize: 10, color: '#888' }}>всего</div>
                      </div>
                    </div>

                    <div style={{
                      fontSize: 20,
                      fontWeight: 700,
                      color: frontman.color || '#27ae60',
                      minWidth: 50,
                      textAlign: 'right',
                    }}>
                      {progress}%
                    </div>

                    <div style={{ color: '#ccc', fontSize: 18, fontWeight: 700 }}>›</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {report.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: '#888' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
          <div style={{ fontSize: 16 }}>Нет данных для отчёта</div>
        </div>
      )}
    </div>
  );
}
