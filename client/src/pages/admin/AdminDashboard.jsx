import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { adminStats, adminGetProducts, adminUploadStock, adminUploadPrices, adminUploadPhotos, adminImportNomenclature } from '../../api/index';
import { useAuth } from '../../context/AuthContext';

function StatCard({ label, value, sub, red, green, to, icon }) {
  const navigate = useNavigate();
  const style = {
    background: '#fff',
    border: '1px solid var(--gray-200)',
    borderRadius: 'var(--radius-lg)',
    padding: '20px 24px',
    cursor: to ? 'pointer' : 'default',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    transition: 'box-shadow .22s, transform .22s',
    textDecoration: 'none',
    color: 'inherit',
  };

  const inner = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <p className="admin-stat-card__label">{label}</p>
        {icon && <span style={{ fontSize: 20, opacity: .5 }}>{icon}</span>}
      </div>
      <p className="admin-stat-card__value" style={red ? { color: 'var(--red)' } : green ? { color: '#2d7a3a' } : {}}>
        {value ?? <span style={{ opacity: .3 }}>—</span>}
      </p>
      {sub && <p style={{ fontSize: 12, color: 'var(--slate)', marginTop: 2 }}>{sub}</p>}
    </>
  );

  if (to) {
    return (
      <Link to={to} className="admin-stat-card" style={style}>
        {inner}
      </Link>
    );
  }
  return <div className="admin-stat-card" style={style}>{inner}</div>;
}

function ProductAlertList({ products, navigate }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
      {products.map(p => (
        <div
          key={p._id}
          onClick={() => navigate(`/admin/products/${p._id}`)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.7)',
            cursor: 'pointer', fontSize: 13, gap: 12,
            border: '1px solid rgba(0,0,0,0.06)',
            transition: 'background .15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.95)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.7)'}
        >
          <span style={{ fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {p.fullName || p.name}
          </span>
          <span style={{ color: 'var(--slate)', fontSize: 12, flexShrink: 0 }}>
            {p.stock} шт. · {(p.price || 0).toLocaleString('ru')} сом
          </span>
          <span style={{ fontSize: 11, color: 'var(--slate)', flexShrink: 0 }}>→</span>
        </div>
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats,        setStats]        = useState(null);
  const [liquidItems,  setLiquidItems]  = useState([]);
  const [illiquidItems, setIlliquidItems] = useState([]);
  const [showAllLiquid, setShowAllLiquid] = useState(false);
  const [syncLoading,   setSyncLoading]   = useState(false);
  const [syncResult,    setSyncResult]    = useState(null);
  const [priceLoading,  setPriceLoading]  = useState(null);
  const [photoLoading,       setPhotoLoading]       = useState(false);
  const [nomenclatureLoading, setNomenclatureLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});

  useEffect(() => {
    adminStats().then(r => setStats(r.data)).catch(() => {});
    adminGetProducts({ productStatus: 'liquidation', limit: 100 })
      .then(r => setLiquidItems(r.data.products || []))
      .catch(() => {});
    adminGetProducts({ set: 'nelikvid', limit: 500 })
      .then(r => setIlliquidItems(r.data.products || []))
      .catch(() => {});
  }, []);

  const inStockPct = stats && stats.products > 0
    ? Math.round(((stats.products - stats.outOfStock) / stats.products) * 100)
    : null;

  const isOwner = user?.role === 'owner';
  const canEdit = ['owner', 'editor'].includes(user?.role);

  const setProgress = (key, val) => setUploadProgress(p => ({ ...p, [key]: val }));

  const handlePriceUpload = async (e, type) => {
    const file = e.target.files[0];
    if (!file) return;
    setPriceLoading(type);
    setProgress(type, 0);
    setSyncResult(null);
    try {
      const r = await adminUploadPrices(file, type, pct => setProgress(type, pct));
      setSyncResult({ ok: true, msg: `✅ ${type === 'retail' ? 'Розничные' : 'Оптовые'} цены обновлены — совпало: ${r.data.matched}, пропущено: ${r.data.skipped}` });
    } catch (err) {
      setSyncResult({ ok: false, error: err?.response?.data?.error || 'Ошибка загрузки' });
    } finally {
      setPriceLoading(null);
      setProgress(type, 0);
      e.target.value = '';
    }
  };

  const handleStockUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSyncLoading(true);
    setProgress('stock', 0);
    setSyncResult(null);
    try {
      const r = await adminUploadStock(file, pct => setProgress('stock', pct));
      setSyncResult({ ok: true, ...r.data });
      adminStats().then(r => setStats(r.data)).catch(() => {});
      if (r.data.excelBase64) {
        const binary = atob(r.data.excelBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `пропущенные_${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setSyncResult({ ok: false, error: err?.response?.data?.error || 'Ошибка загрузки' });
    } finally {
      setSyncLoading(false);
      setProgress('stock', 0);
      e.target.value = '';
    }
  };

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setPhotoLoading(true);
    setProgress('photos', 0);
    setSyncResult(null);
    try {
      const r = await adminUploadPhotos(files, pct => setProgress('photos', pct));
      setSyncResult({ ok: true, msg: `✅ Фото загружены — совпало: ${r.data.matched}, не найдено: ${r.data.notFound}, всего: ${r.data.total}` });
      if (r.data.excelBase64) {
        const binary = atob(r.data.excelBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `фото_не_найдены_${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setSyncResult({ ok: false, error: err?.response?.data?.error || 'Ошибка загрузки' });
    } finally {
      setPhotoLoading(false);
      setProgress('photos', 0);
      e.target.value = '';
    }
  };

  const handleNomenclatureImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setNomenclatureLoading(true);
    setSyncResult(null);
    try {
      const r = await adminImportNomenclature(file);
      setSyncResult({ ok: true, msg: `✅ Импорт завершён — добавлено: ${r.data.added}, уже есть: ${r.data.skipped}` });
      adminStats().then(r => setStats(r.data)).catch(() => {});
    } catch (err) {
      setSyncResult({ ok: false, error: err?.response?.data?.error || 'Ошибка импорта' });
    } finally {
      setNomenclatureLoading(false);
      e.target.value = '';
    }
  };

  const PREVIEW = 5;
  const liquidPreview = showAllLiquid ? liquidItems : liquidItems.slice(0, PREVIEW);

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Дашборд</h1>
          <p style={{ color: 'var(--slate)', fontSize: 13, margin: '2px 0 0' }}>
            Добро пожаловать, {user?.name}
          </p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="admin-stats">
        <StatCard
          label="Каталог всех товаров"
          value={stats?.products}
          sub={inStockPct !== null ? `${inStockPct}% в наличии` : undefined}
          icon="📦"
          to="/admin/all-catalog"
        />
        <StatCard
          label="Товары которых нет в наличии"
          value={stats?.outOfStock}
          sub={stats?.outOfStock > 0 ? 'Требуют внимания' : 'Всё есть'}
          red={stats?.outOfStock > 0}
          green={stats?.outOfStock === 0}
          icon="⚠️"
          to="/admin/out-of-stock"
        />
        <StatCard
          label="Каталог по сетам"
          value="→"
          sub="Линейки, сеты, каталог"
          icon="📋"
          to="/admin/sets"
        />
        <StatCard
          label="Фронтмены"
          value={stats?.frontmen ?? '→'}
          sub="Представители брендов"
          icon="👤"
          to="/admin/frontmen"
        />
        {isOwner && (
          <StatCard
            label="Пользователи"
            value={stats?.users}
            sub={stats?.usersOnline > 0
              ? `● ${stats.usersOnline} онлайн${stats?.pending > 0 ? ` · ${stats.pending} ожидают` : ''}`
              : stats?.pending > 0 ? `${stats.pending} ожидают подтверждения` : 'Нет активных'}
            icon="👥"
            to="/admin/users"
          />
        )}
      </div>

      {/* Quick actions */}
      <div style={{ marginBottom: 32 }}>
        <p style={{ fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--slate)', marginBottom: 12 }}>
          Быстрые действия
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {canEdit && (
            <Link to="/admin/products/new" className="btn btn-primary">
              + Добавить товар
            </Link>
          )}
          {canEdit && [
            { key: 'stock',     label: '📥 Остатки из 1С',   color: '#2d7a3a', bg: '#e8f5e9', disabled: syncLoading,             onChange: handleStockUpload,                         accept: '.xlsx' },
            { key: 'retail',    label: '💰 Розничные цены',  color: '#3b5bdb', bg: '#e8f0ff', disabled: !!priceLoading,           onChange: e => handlePriceUpload(e, 'retail'),        accept: '.xlsx' },
            { key: 'wholesale', label: '💰 Оптовые цены',    color: '#c47a00', bg: '#fff8e1', disabled: !!priceLoading,           onChange: e => handlePriceUpload(e, 'wholesale'),     accept: '.xlsx' },
            { key: 'photos',    label: '🖼 Фото',             color: '#7b2d8b', bg: '#f8e8ff', disabled: photoLoading,            onChange: handlePhotoUpload,                          accept: 'image/*', multiple: true },
            { key: 'nomenclature', label: '📥 Новые из 1С',  color: '#7c3aed', bg: '#f3e8ff', disabled: nomenclatureLoading,        onChange: handleNomenclatureImport,                   accept: '.xlsx' },
          ].map(({ key, label, color, bg, disabled, onChange, accept, multiple }) => {
            const pct = uploadProgress[key] || 0;
            const active = key === 'stock' ? syncLoading : key === 'photos' ? photoLoading : key === 'nomenclature' ? nomenclatureLoading : priceLoading === key;
            return (
              <label key={key} style={{ position: 'relative', overflow: 'hidden', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '9px 18px', borderRadius: 8, cursor: disabled ? 'wait' : 'pointer', border: `1.5px solid ${color}`, color, fontWeight: 700, fontSize: 14, minWidth: 160, background: '#fff', userSelect: 'none' }}>
                <input type="file" accept={accept} multiple={multiple} style={{ display: 'none' }} onChange={onChange} disabled={disabled} />
                {/* progress fill */}
                {active && (
                  <span style={{ position: 'absolute', inset: 0, background: bg, width: `${pct}%`, transition: 'width .2s', borderRadius: 6 }} />
                )}
                <span style={{ position: 'relative', zIndex: 1 }}>
                  {active ? `${pct < 100 ? `${pct}%` : '⏳ Обрабатываю...'}` : label}
                </span>
              </label>
            );
          })}
          <Link to="/admin/sets" className="btn btn-outline">
            📦 Каталог по сетам
          </Link>
          <Link to="/admin/map" className="btn btn-outline">
            🗺 Product Map
          </Link>
          {isOwner && (
            <Link to="/admin/users" className="btn btn-outline">
              👥 Пользователи
            </Link>
          )}
        </div>
      </div>

      {/* Результат загрузки остатков */}
      {syncResult && (
        <div style={{
          marginBottom: 20, padding: '12px 18px', borderRadius: 10,
          background: syncResult.ok ? '#f0faf2' : '#fff0f0',
          border: `1.5px solid ${syncResult.ok ? '#2d7a3a' : '#e74c3c'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: syncResult.ok ? '#2d7a3a' : '#c0392b' }}>
            {syncResult.ok
              ? (syncResult.msg || `✅ Остатки обновлены — совпало: ${syncResult.matched}, обнулено: ${syncResult.zeroed}, всего: ${syncResult.total}`)
              : `❌ ${syncResult.error}`}
          </span>
          <button onClick={() => setSyncResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, opacity: .5 }}>×</button>
        </div>
      )}

      {/* ── ЛИКВИДАЦИЯ ── */}
      {liquidItems.length > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, #fff0f0 0%, #ffe8e8 100%)',
          border: '2px solid #e74c3c',
          borderRadius: 14,
          padding: '18px 22px',
          marginBottom: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 28 }}>🔴</span>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16, color: '#c0392b', letterSpacing: 0.3 }}>
                  ЛИКВИДАЦИЯ — {liquidItems.length} {liquidItems.length === 1 ? 'товар' : liquidItems.length < 5 ? 'товара' : 'товаров'}
                </div>
                <div style={{ fontSize: 13, color: '#922b21', marginTop: 3, fontWeight: 600 }}>
                  🚨 Эти товары снимаются с производства — нужно СРОЧНО продать остатки на складе!
                </div>
              </div>
            </div>
            <Link
              to="/admin/products?productStatus=liquidation"
              style={{ fontSize: 12, fontWeight: 700, color: '#c0392b', textDecoration: 'none', flexShrink: 0, padding: '6px 14px', border: '1.5px solid #c0392b', borderRadius: 8, background: '#fff' }}
            >
              Все →
            </Link>
          </div>

          <ProductAlertList products={liquidPreview} navigate={navigate} />

          {liquidItems.length > PREVIEW && (
            <button
              onClick={() => setShowAllLiquid(v => !v)}
              style={{ marginTop: 10, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#c0392b' }}
            >
              {showAllLiquid ? 'Свернуть ▲' : `Показать все ${liquidItems.length} ▼`}
            </button>
          )}
        </div>
      )}

      {/* ── НЕЛИКВИДЫ ── */}
      {illiquidItems.length > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, #fffbf0 0%, #fff8e6 100%)',
          border: '2px solid #f0c060',
          borderRadius: 14,
          padding: '18px 22px',
          marginBottom: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 28 }}>📦</span>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16, color: '#c47a00', letterSpacing: 0.3 }}>
                  НЕЛИКВИДЫ — {illiquidItems.length} {illiquidItems.length === 1 ? 'товар' : illiquidItems.length < 5 ? 'товара' : 'товаров'}
                </div>
                <div style={{ fontSize: 13, color: '#7a5000', marginTop: 3, fontWeight: 600 }}>
                  ⏳ Товары уже много лежат на складе — нужно продать, пересмотреть цену или сделать акцию
                </div>
              </div>
            </div>
            <Link
              to="/admin/products?illiquid=true"
              style={{ fontSize: 12, fontWeight: 700, color: '#c47a00', textDecoration: 'none', flexShrink: 0, padding: '6px 14px', border: '1.5px solid #c47a00', borderRadius: 8, background: '#fff' }}
            >
              Все →
            </Link>
          </div>

          <ProductAlertList products={illiquidItems} navigate={navigate} />
        </div>
      )}

      {/* Pending users alert */}
      {isOwner && stats?.pending > 0 && (
        <Link to="/admin/users" style={{ textDecoration: 'none' }}>
          <div style={{
            background: '#fffbf0',
            border: '1.5px solid #f0c060',
            borderRadius: 12,
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            cursor: 'pointer',
            transition: 'box-shadow .2s',
          }}
          onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(240,192,96,.3)'}
          onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
          >
            <span style={{ fontSize: 24 }}>⏳</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#7a5000' }}>
                {stats.pending} {stats.pending === 1 ? 'пользователь ожидает' : 'пользователей ожидают'} подтверждения
              </div>
              <div style={{ fontSize: 12, color: '#c47a00', marginTop: 2 }}>
                Нажмите чтобы перейти к управлению →
              </div>
            </div>
          </div>
        </Link>
      )}
    </div>
  );
}
