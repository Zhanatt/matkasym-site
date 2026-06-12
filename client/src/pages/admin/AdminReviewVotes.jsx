import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { adminGetReviewGrouped } from '../../api/index';

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

const formatDate = (d) => d ? new Date(d).toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';

export default function AdminReviewVotes() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const auditId = searchParams.get('auditId');
  const setSlug = searchParams.get('set');
  const status = searchParams.get('status');

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);

  useEffect(() => {
    if (!auditId || !setSlug || !status) return;
    setLoading(true);
    adminGetReviewGrouped({ auditId, set: setSlug, status })
      .then(res => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [auditId, setSlug, status]);

  const getImageUrl = (item) => {
    const img = item.product?.images?.[0] || item.productSnapshot?.image;
    if (img) return img;
    const driveId = item.product?.driveImages?.[0];
    if (driveId) return `https://drive.google.com/thumbnail?id=${driveId}&sz=w100`;
    return '/placeholder.png';
  };

  const statusCfg = STATUS_CONFIG[status] || {};

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 600,
            background: '#f5f5f5',
            color: '#555',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            marginBottom: 16,
          }}
        >
          ← Назад
        </button>

        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px' }}>
          {setLabel(setSlug)} — {statusCfg.label}
        </h1>
        <p style={{ color: '#888', fontSize: 14, margin: 0 }}>
          Товары со статусом «{statusCfg.label}» и голоса всех фронтменов
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#888' }}>Загрузка...</div>
      ) : data.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#aaa' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
          <div>Нет товаров</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {data.map((item, idx) => (
            <div
              key={item.productId || idx}
              style={{
                border: '1px solid #eee',
                borderRadius: 12,
                overflow: 'hidden',
                background: '#fff',
                boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 20, borderBottom: '1px solid #f0f0f0' }}>
                <img
                  src={getImageUrl(item)}
                  alt=""
                  style={{ width: 64, height: 64, objectFit: 'contain', borderRadius: 8, background: '#f8f8f8' }}
                  onError={(e) => { e.target.src = '/placeholder.png'; }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
                    {item.productSnapshot?.fullName || item.productSnapshot?.name || '—'}
                  </div>
                  <div style={{ fontSize: 12, color: '#888' }}>
                    {item.productSnapshot?.sku || '—'}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#555' }}>
                    {item.votes.length} голос{item.votes.length === 1 ? '' : item.votes.length < 5 ? 'а' : 'ов'}
                  </div>
                </div>
              </div>

              <div style={{ padding: '16px 20px', background: '#fafafa' }}>
                {item.votes.map((vote, vIdx) => {
                  const vcfg = STATUS_CONFIG[vote.status] || {};
                  return (
                    <div
                      key={vIdx}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 16,
                        padding: '12px 0',
                        borderBottom: vIdx < item.votes.length - 1 ? '1px solid #eee' : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 130 }}>
                        <div style={{ width: 12, height: 12, borderRadius: '50%', background: vote.frontman?.color || '#888', flexShrink: 0 }} />
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{vote.frontman?.name || '—'}</span>
                      </div>

                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '5px 12px',
                          background: vcfg.bg,
                          color: vcfg.color,
                          borderRadius: 16,
                          fontWeight: 600,
                          fontSize: 12,
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}
                      >
                        {vcfg.icon} {vcfg.label}
                      </span>

                      <div style={{ flex: 1, fontSize: 13, color: '#555', lineHeight: 1.5 }}>
                        {vote.comment || <span style={{ color: '#ccc' }}>Без комментария</span>}
                      </div>

                      <div style={{ fontSize: 12, color: '#aaa', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {formatDate(vote.updatedAt)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
