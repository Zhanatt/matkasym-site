import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import JSZip from 'jszip';
import * as pdfjsLib from 'pdfjs-dist';
import { adminStats, adminGetProducts, adminUploadStock, adminUploadPrices, adminUploadPhotos, adminPreviewNomenclature, adminConfirmNomenclature } from '../../api/index';
import { useAuth } from '../../context/AuthContext';

// PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

// Базы 1С, из которых грузятся остатки (ключи — как в server/lib/stockBases.js)
const STOCK_BASES = [
  { key: 'makein',   label: 'Make-in'  },
  { key: 'matkasym', label: 'Matkasym' },
  { key: 'qtop',     label: 'Q-top'    },
];

function StatCard({ label, value, sub, red, green, to, icon }) {
  const navigate = useNavigate();
  const style = {
    background: 'var(--admin-surface)',
    border: '1px solid var(--admin-line)',
    borderRadius: 16,
    padding: '22px 24px',
    cursor: to ? 'pointer' : 'default',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    transition: 'box-shadow .22s, transform .22s, border-color .22s',
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
  const [liquidationItems, setLiquidationItems] = useState([]);
  const [showAllLiquidation, setShowAllLiquidation] = useState(false);
  const [syncLoading,   setSyncLoading]   = useState(false);
  const [syncResult,    setSyncResult]    = useState(null);
  const [stockBase,     setStockBase]     = useState('makein');
  const [priceLoading,  setPriceLoading]  = useState(null);
  const [photoLoading,       setPhotoLoading]       = useState(false);
  const [nomenclatureLoading, setNomenclatureLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});

  useEffect(() => {
    adminStats().then(r => setStats(r.data)).catch(() => {});
    adminGetProducts({ productStatus: 'liquidation', limit: 500 })
      .then(r => setLiquidationItems(r.data.products || []))
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
      const typeLabels = { retail: 'Розничные', wholesale: 'Оптовые', dealer: 'Дилерские' };
      setSyncResult({ ok: true, msg: `✅ ${typeLabels[type] || type} цены обновлены — совпало: ${r.data.matched}, пропущено: ${r.data.skipped}` });
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
      const r = await adminUploadStock(file, stockBase, pct => setProgress('stock', pct));
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

  // Extract images from PDF file - renders each page and extracts embedded images
  const extractPhotosFromPdf = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const results = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const ops = await page.getOperatorList();

      // Find image objects in the page
      for (let i = 0; i < ops.fnArray.length; i++) {
        if (ops.fnArray[i] === pdfjsLib.OPS.paintImageXObject ||
            ops.fnArray[i] === pdfjsLib.OPS.paintJpegXObject) {
          const imgName = ops.argsArray[i][0];
          try {
            const img = await page.objs.get(imgName);
            if (img && img.data) {
              // Convert image data to blob
              const canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext('2d');
              const imgData = ctx.createImageData(img.width, img.height);

              // Handle different image formats
              if (img.data.length === img.width * img.height * 4) {
                imgData.data.set(img.data);
              } else if (img.data.length === img.width * img.height * 3) {
                // RGB to RGBA
                for (let j = 0; j < img.width * img.height; j++) {
                  imgData.data[j * 4] = img.data[j * 3];
                  imgData.data[j * 4 + 1] = img.data[j * 3 + 1];
                  imgData.data[j * 4 + 2] = img.data[j * 3 + 2];
                  imgData.data[j * 4 + 3] = 255;
                }
              }

              ctx.putImageData(imgData, 0, 0);
              const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
              if (blob && blob.size > 5000) { // Skip tiny images
                results.push({
                  name: `pdf_page${pageNum}_img${results.length + 1}`,
                  blob,
                  ext: 'jpg'
                });
              }
            }
          } catch (e) {
            // Skip problematic images
          }
        }
      }
    }

    return results;
  };

  // Extract images from Excel file on client side
  const extractPhotosFromExcel = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    // Parse shared strings for product names
    let sharedStrings = [];
    const ssFile = zip.file(/xl\/sharedstrings\.xml/i)[0];
    if (ssFile) {
      const ssXml = await ssFile.async('string');
      const parser = new DOMParser();
      const doc = parser.parseFromString(ssXml, 'text/xml');
      const sis = doc.getElementsByTagName('si');
      for (const si of sis) {
        const texts = si.getElementsByTagName('t');
        sharedStrings.push(Array.from(texts).map(t => t.textContent || '').join(''));
      }
    }

    // Parse sheet to find product names by row (column S = 19)
    const sheetFile = zip.file('xl/worksheets/sheet1.xml');
    if (!sheetFile) throw new Error('Лист не найден');
    const sheetXml = await sheetFile.async('string');
    const sheetDoc = new DOMParser().parseFromString(sheetXml, 'text/xml');
    const rows = sheetDoc.getElementsByTagName('row');

    const productsByRow = new Map();
    for (const row of rows) {
      const rowNum = parseInt(row.getAttribute('r') || '0');
      if (rowNum < 80) continue;
      const cells = row.getElementsByTagName('c');
      let itemNum = null, prodName = null;
      for (const cell of cells) {
        const ref = cell.getAttribute('r') || '';
        const col = ref.replace(/[0-9]/g, '');
        const vElem = cell.getElementsByTagName('v')[0];
        const val = vElem?.textContent;
        if (col === 'C' && val) {
          const n = parseInt(val);
          if (!isNaN(n) && n > 0 && n < 10000) itemNum = n;
        }
        if (col === 'S' && val !== undefined) {
          if (cell.getAttribute('t') === 's' && sharedStrings[parseInt(val)]) {
            prodName = sharedStrings[parseInt(val)];
          } else {
            prodName = val;
          }
        }
      }
      if (itemNum && prodName && !prodName.startsWith('Цена:')) {
        productsByRow.set(rowNum, prodName.trim());
      }
    }

    // Parse drawing relationships
    const relsFile = zip.file('xl/drawings/_rels/drawing1.xml.rels');
    const drawingFile = zip.file('xl/drawings/drawing1.xml');
    if (!relsFile || !drawingFile) throw new Error('Нет встроенных изображений');

    const relsXml = await relsFile.async('string');
    const relsDoc = new DOMParser().parseFromString(relsXml, 'text/xml');
    const rels = relsDoc.getElementsByTagName('Relationship');
    const ridToFile = new Map();
    for (const rel of rels) {
      const rid = rel.getAttribute('Id');
      const target = rel.getAttribute('Target') || '';
      if (target.includes('media/')) ridToFile.set(rid, target.replace('../media/', ''));
    }

    // Parse drawing.xml to get image positions
    const drawingXml = await drawingFile.async('string');
    const drawingDoc = new DOMParser().parseFromString(drawingXml, 'text/xml');
    const anchors = drawingDoc.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing', 'twoCellAnchor');

    const result = [];
    const usedProducts = new Set();

    for (const anchor of anchors) {
      const fromElem = anchor.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing', 'from')[0];
      const rowElem = fromElem?.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing', 'row')[0];
      const row = parseInt(rowElem?.textContent || '-1');
      if (row < 80) continue;

      const blip = anchor.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'blip')[0];
      const rid = blip?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed');
      if (!rid || !ridToFile.has(rid)) continue;

      let bestName = null, bestDist = 100;
      for (const [prodRow, name] of productsByRow) {
        const dist = Math.abs(prodRow - row);
        if (dist < bestDist && dist <= 10 && !usedProducts.has(name)) {
          bestDist = dist;
          bestName = name;
        }
      }

      if (bestName) {
        const imgFile = zip.file(`xl/media/${ridToFile.get(rid)}`);
        if (imgFile) {
          usedProducts.add(bestName);
          const blob = await imgFile.async('blob');
          const ext = ridToFile.get(rid).split('.').pop() || 'png';
          result.push({ name: bestName, blob, ext });
        }
      }
    }
    return result;
  };

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setPhotoLoading(true);
    setProgress('photos', 0);
    setSyncResult(null);

    try {
      let filesToUpload = files;
      let sourceFile = '';

      // If single Excel file, extract photos on client
      if (files.length === 1 && (files[0].name.endsWith('.xlsx') || files[0].name.endsWith('.xls'))) {
        setSyncResult({ ok: true, msg: '📦 Извлекаем фото из Excel...' });
        sourceFile = files[0].name;
        const extracted = await extractPhotosFromExcel(files[0]);
        setSyncResult({ ok: true, msg: `📦 Извлечено ${extracted.length} фото, загружаем...` });
        filesToUpload = extracted.map(({ name, blob, ext }) => {
          const file = new File([blob], `${name}.${ext}`, { type: `image/${ext}` });
          return file;
        });
      }

      // Extract images from PDF
      if (files.length === 1 && files[0].name.endsWith('.pdf')) {
        setSyncResult({ ok: true, msg: '📦 Извлекаем фото из PDF...' });
        sourceFile = files[0].name;
        const extracted = await extractPhotosFromPdf(files[0]);
        if (extracted.length === 0) {
          setSyncResult({ ok: false, error: '❌ Не удалось извлечь фото из PDF. Попробуйте Excel файл.' });
          setPhotoLoading(false);
          e.target.value = '';
          return;
        }
        setSyncResult({ ok: true, msg: `📦 Извлечено ${extracted.length} фото, загружаем...` });
        filesToUpload = extracted.map(({ name, blob, ext }) => {
          const file = new File([blob], `${name}.${ext}`, { type: `image/${ext}` });
          return file;
        });
      }

      // Upload in batches of 10 to avoid memory issues
      const BATCH_SIZE = 10;
      let matched = 0, notFound = 0, total = filesToUpload.length;

      for (let i = 0; i < filesToUpload.length; i += BATCH_SIZE) {
        const batch = filesToUpload.slice(i, i + BATCH_SIZE);
        const r = await adminUploadPhotos(batch, () => {}, sourceFile);
        matched += r.data.matched || 0;
        notFound += r.data.notFound || 0;
        setProgress('photos', Math.round(((i + batch.length) / total) * 100));
      }

      setSyncResult({ ok: true, msg: `✅ Фото загружены — совпало: ${matched}, не найдено: ${notFound}, всего: ${total}` });
    } catch (err) {
      setSyncResult({ ok: false, error: err?.response?.data?.error || err.message || 'Ошибка загрузки' });
    } finally {
      setPhotoLoading(false);
      setProgress('photos', 0);
      e.target.value = '';
    }
  };

  const handleNomenclatureUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setNomenclatureLoading(true);
    setSyncResult(null);
    try {
      const r = await adminPreviewNomenclature(file);
      const items = r.data.items || [];
      if (items.length === 0) {
        setSyncResult({ ok: true, msg: '✅ Новых товаров не найдено — все уже в базе' });
      } else {
        const r2 = await adminConfirmNomenclature(items);
        setSyncResult({ ok: true, msg: `✅ Добавлено ${r2.data.added} товаров из 1С` });
        adminStats().then(r => setStats(r.data)).catch(() => {});
      }
    } catch (err) {
      setSyncResult({ ok: false, error: err?.response?.data?.error || 'Ошибка импорта' });
    } finally {
      setNomenclatureLoading(false);
      e.target.value = '';
    }
  };

  const PREVIEW = 6;
  const liquidationPreview = showAllLiquidation ? liquidationItems : liquidationItems.slice(0, PREVIEW);

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
          {/* Выбор базы 1С для остатков — базы независимы, каждая правит только свой остаток */}
          {canEdit && (
            <select
              value={stockBase}
              onChange={e => setStockBase(e.target.value)}
              disabled={syncLoading}
              title="Из какой базы 1С выгружены остатки"
              style={{
                padding: '9px 12px', borderRadius: 8, border: '1.5px solid #2d7a3a',
                color: '#2d7a3a', fontWeight: 700, fontSize: 14, background: '#fff',
                cursor: syncLoading ? 'wait' : 'pointer', outline: 'none',
              }}
            >
              {STOCK_BASES.map(b => <option key={b.key} value={b.key}>База: {b.label}</option>)}
            </select>
          )}
          {canEdit && [
            { key: 'stock',     label: `📥 Остатки ${STOCK_BASES.find(b => b.key === stockBase)?.label}`, color: '#2d7a3a', bg: '#e8f5e9', disabled: syncLoading, onChange: handleStockUpload, accept: '.xlsx' },
            { key: 'retail',    label: '💰 Розничные цены',  color: '#3b5bdb', bg: '#e8f0ff', disabled: !!priceLoading,           onChange: e => handlePriceUpload(e, 'retail'),        accept: '.xlsx' },
            { key: 'wholesale', label: '💰 Оптовые цены',    color: '#c47a00', bg: '#fff8e1', disabled: !!priceLoading,           onChange: e => handlePriceUpload(e, 'wholesale'),     accept: '.xlsx' },
            { key: 'dealer',    label: '💰 Дилерские цены',  color: '#0d9488', bg: '#e6fffa', disabled: !!priceLoading,           onChange: e => handlePriceUpload(e, 'dealer'),        accept: '.xlsx' },
            { key: 'photos',    label: '🖼 Фото',             color: '#7b2d8b', bg: '#f8e8ff', disabled: photoLoading,            onChange: handlePhotoUpload,                          accept: 'image/*,.xlsx,.xls,.pdf', multiple: true },
            { key: 'nomenclature', label: '📥 Новые из 1С',  color: '#7c3aed', bg: '#f3e8ff', disabled: nomenclatureLoading,        onChange: handleNomenclatureUpload,                   accept: '.xlsx' },
          ].map(({ key, label, color, bg, disabled, onChange, accept, multiple }) => {
            const pct = uploadProgress[key] || 0;
            const active = key === 'stock' ? syncLoading : key === 'photos' ? photoLoading : key === 'nomenclature' ? nomenclatureLoading : priceLoading === key;
            return (
              <label key={key} style={{ position: 'relative', overflow: 'hidden', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '9px 18px', borderRadius: 8, cursor: disabled ? 'wait' : 'pointer', border: `1.5px solid ${color}`, color, fontWeight: 700, fontSize: 14, minWidth: 160, background: '#fff', userSelect: 'none' }}>
                <input type="file" accept={accept} multiple={multiple} style={{ display: 'none' }} onChange={onChange} disabled={disabled} />
                {/* progress fill */}
                {active && (
                  <span style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: bg, width: `${pct}%`, transition: 'width .2s', borderRadius: 6 }} />
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
              ? (syncResult.msg || <>
                  ✅ Остатки базы <b>{syncResult.baseLabel}</b> обновлены — совпало: {syncResult.matched}, обнулено: {syncResult.zeroed}
                  {syncResult.buffersUpdated > 0 && `, буфер обновлён у ${syncResult.buffersUpdated}`}
                  {syncResult.warehouses?.length > 0 && (
                    <div style={{ fontSize: 12, fontWeight: 500, opacity: .75, marginTop: 4 }}>
                      Склады: {syncResult.warehouses.join(' + ')}
                    </div>
                  )}
                </>)
              : `❌ ${syncResult.error}`}
          </span>
          <button onClick={() => setSyncResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, opacity: .5 }}>×</button>
        </div>
      )}

      {/* ── ЛИКВИДАЦИЯ ── */}
      {liquidationItems.length > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
          border: '1px solid #f59e0b',
          borderRadius: 16,
          padding: '18px 22px',
          marginBottom: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 24 }}>🏷️</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: '#92400e', letterSpacing: 0.2 }}>
                  ЛИКВИДАЦИЯ — {liquidationItems.length} {liquidationItems.length === 1 ? 'товар' : liquidationItems.length < 5 ? 'товара' : 'товаров'}
                </div>
                <div style={{ fontSize: 13, color: '#78350f', marginTop: 3, fontWeight: 600 }}>
                  🔥 Нужно распродать: сняты с производства, залежались или требуют акции
                </div>
              </div>
            </div>
            <Link
              to="/admin/all-catalog?productStatus=liquidation"
              style={{ fontSize: 12, fontWeight: 700, color: '#92400e', textDecoration: 'none', flexShrink: 0, padding: '6px 14px', border: '1.5px solid #92400e', borderRadius: 8, background: '#fff' }}
            >
              Все →
            </Link>
          </div>

          <ProductAlertList products={liquidationPreview} navigate={navigate} />

          {liquidationItems.length > PREVIEW && (
            <button
              onClick={() => setShowAllLiquidation(v => !v)}
              style={{ marginTop: 10, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#92400e' }}
            >
              {showAllLiquidation ? 'Свернуть ▲' : `Показать все ${liquidationItems.length} ▼`}
            </button>
          )}
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
