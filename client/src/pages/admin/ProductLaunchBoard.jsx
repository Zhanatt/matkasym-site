import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  adminGetProductLaunches,
  adminCreateProductLaunch,
  adminUpdateProductLaunch,
  adminDeleteProductLaunch,
  adminCreateLaunchOrderRequest,
  adminGetProducts,
} from '../../api';
import { useAuth } from '../../context/AuthContext';
import { cloudinaryOpt } from '../../utils/drive';

const CLOUD  = 'dnbg21ef8';
const PRESET = 'Matkasym';
const NO_PHOTO = '/logos/no-photo.png';

// Этапы запуска товара. Порядок = движение слева направо.
const STAGES = [
  { key: 'content',   label: 'Контент',         icon: '📸', dot: '#DC1E24', bg: '#fef2f2', line: '#fecaca',
    hint: 'Зайнагуль: фото, ссылка на источник, описание' },
  { key: 'design',    label: 'Дизайн',          icon: '🎨', dot: '#7c3aed', bg: '#faf5ff', line: '#e9d5ff',
    hint: 'Дизайнеры делают карточку товара и креативы' },
  { key: 'published', label: 'Опубликовано',    icon: '📣', dot: '#2563eb', bg: '#eff6ff', line: '#bfdbfe',
    hint: 'Пост вышел — идёт тестовая продажа' },
  { key: 'feedback',  label: 'Обратная связь',  icon: '📊', dot: '#22c55e', bg: '#f0fdf4', line: '#bbf7d0',
    hint: 'Отклик и заявки клиентов — есть спрос, заказываем партию' },
];
const DONE = { key: 'done', label: 'Итог', icon: '✓', dot: '#94a3b8', bg: '#f8fafc', line: '#e2e8f0', hint: 'Заказали партию или спроса нет' };
const ALL_STAGES = [...STAGES, DONE];
const ST = Object.fromEntries(ALL_STAGES.map(s => [s.key, s]));
const idxOf = k => ALL_STAGES.findIndex(s => s.key === k);

const METRICS = [
  { key: 'inquiries', label: 'Новые обращения', icon: '💬' },
  { key: 'reactions', label: 'Реакции',         icon: '❤️' },
  { key: 'comments',  label: 'Комментарии',     icon: '🗨' },
  { key: 'requests',  label: 'Заявки клиентов', icon: '🛒' },
];

const fmtDay = d => d ? new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';
const num = v => (v === null || v === undefined || v === '') ? '—' : v;

const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10,
  border: '1.5px solid #e5e7eb', fontSize: 14, outline: 'none', fontFamily: 'inherit',
};
const labelStyle = { display: 'block', fontSize: 12.5, fontWeight: 700, color: '#374151', marginBottom: 6 };

async function uploadToCloudinary(file, folder = 'matkasym/product-launch') {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', PRESET);
  fd.append('folder', folder);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, { method: 'POST', body: fd });
  const data = await res.json();
  if (!data.secure_url) throw new Error(data.error?.message || 'Не удалось загрузить файл');
  return data.secure_url;
}

export default function ProductLaunchBoard({ onCountChange }) {
  const { user } = useAuth();
  const isContentMgr = ['owner', 'editor'].includes(user?.role) || !!user?.canManageContent;
  const isDesigner   = user?.role === 'designer';

  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail]   = useState(null);
  const [showDone, setShowDone] = useState(false);
  const [picker, setPicker]   = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    adminGetProductLaunches()
      .then(r => {
        const list = r.data.launches || [];
        setItems(list);
        onCountChange?.(r.data.activeCount ?? list.filter(x => x.stage !== 'done').length);
      })
      .catch(() => { setItems([]); onCountChange?.(0); })
      .finally(() => setLoading(false));
  }, [onCountChange]);

  useEffect(() => { load(); }, [load]);

  // Обновление карточки: держим открытую модалку в синхроне с сервером
  const patch = async (launch, data) => {
    const res = await adminUpdateProductLaunch(launch._id, data);
    setDetail(d => (d && d._id === launch._id) ? res.data : d);
    setItems(list => list.map(x => x._id === launch._id ? res.data : x));
    load();
    return res.data;
  };

  const move = async (launch, stage) => {
    try { await patch(launch, { stage }); }
    catch (e) { alert(e?.response?.data?.error || 'Не удалось перенести карточку'); }
  };

  const remove = async (id) => {
    if (!window.confirm('Убрать товар с доски тестовых продаж?')) return;
    try {
      await adminDeleteProductLaunch(id);
      setDetail(null);
      load();
    } catch (e) { alert(e?.response?.data?.error || 'Не удалось удалить'); }
  };

  const doneItems = useMemo(() => items.filter(x => x.stage === 'done'), [items]);
  const columns = showDone ? ALL_STAGES : STAGES;

  return (
    <div>
      {/* Пояснение процесса */}
      <div style={{
        background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12,
        padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#475569',
      }}>
        🧪 <b>Тестовая продажа — первый этап.</b> Зайнагуль находит товар в интернете и собирает контент →
        дизайнеры делают карточку и креативы → выходит пост, продаём по фото → собираем заявки клиентов.
        Есть спрос — из карточки создаётся <b>заявка на заказ</b> первой партии.
      </div>

      {/* Шкала этапов */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {STAGES.map((s, i) => {
          const n = items.filter(x => x.stage === s.key).length;
          return (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20,
                background: s.bg, border: `1px solid ${s.line}`, fontSize: 12.5, fontWeight: 700, color: '#334155',
              }}>
                <span>{s.icon}</span>{s.label}
                <span style={{ background: s.dot, color: '#fff', borderRadius: 20, padding: '0 7px', fontSize: 11.5 }}>{n}</span>
              </div>
              {i < STAGES.length - 1 && <span style={{ color: '#cbd5e1', fontSize: 13 }}>→</span>}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        {isContentMgr && (
          <button onClick={() => setPicker(true)}
            style={{ flex: '1 1 220px', padding: '14px', fontSize: 15, fontWeight: 700, color: '#fff',
              background: 'linear-gradient(135deg, #DC1E24 0%, #b3161b 100%)', border: 'none',
              borderRadius: 12, cursor: 'pointer', boxShadow: '0 6px 18px rgba(220,30,36,.22)' }}>
            ＋ Новый товар на тест
          </button>
        )}
        <button onClick={() => setShowDone(v => !v)}
          style={{ flex: '0 1 auto', padding: '14px 18px', fontSize: 14, fontWeight: 700, color: '#475569',
            background: showDone ? '#e2e8f0' : '#f1f5f9', border: 'none', borderRadius: 12, cursor: 'pointer' }}>
          ✓ Завершённые ({doneItems.length})
        </button>
      </div>

      {loading ? (
        <div style={{ color: '#aaa', textAlign: 'center', padding: 40 }}>Загрузка…</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 50, background: '#f9f9f9', borderRadius: 16, color: '#888' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🧪</div>
          <div style={{ fontSize: 15 }}>Нет товаров на тесте</div>
          <div style={{ fontSize: 13, color: '#aaa', marginTop: 6 }}>
            Нашли товар в интернете — заведите его здесь, с этого начинается процесс
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(260px, 1fr))`, gap: 14, alignItems: 'start' }}>
          {columns.map(col => {
            const colItems = items.filter(x => (x.stage || 'content') === col.key);
            return (
              <div key={col.key} style={{ background: col.bg, border: `1px solid ${col.line}`, borderRadius: 14, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, padding: '0 2px' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.dot }} />
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: '#111', textTransform: 'uppercase', letterSpacing: .3 }}>
                    {col.icon} {col.label}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: col.dot, borderRadius: 20, padding: '1px 8px' }}>
                    {colItems.length}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10, padding: '0 2px' }}>{col.hint}</div>

                {colItems.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '22px 10px', color: '#b0b8c1', fontSize: 12.5 }}>Пусто</div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {colItems.map(l => (
                    <LaunchCard
                      key={l._id} launch={l} col={col}
                      canMove={isContentMgr || (isDesigner && l.stage === 'design')}
                      onOpen={() => setDetail(l)}
                      onMove={(stage) => move(l, stage)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {detail && createPortal(
        <LaunchDetail
          launch={detail}
          isContentMgr={isContentMgr}
          isDesigner={isDesigner}
          onClose={() => setDetail(null)}
          onPatch={(data) => patch(detail, data)}
          onDelete={() => remove(detail._id)}
          onOrdered={async (quantity) => {
            const r = await adminCreateLaunchOrderRequest(detail._id, { quantity });
            setDetail(null);
            load();
            alert(`Заявка на заказ №${r.data.request.number} создана — она во вкладке «Заявки на заказ».`);
          }}
        />, document.body)}

      {picker && createPortal(
        <NewLaunchForm
          onClose={() => setPicker(false)}
          onCreate={async (data) => {
            await adminCreateProductLaunch(data);
            setPicker(false);
            load();
          }}
        />, document.body)}
    </div>
  );
}

// ── Карточка на доске ────────────────────────────────────────────────────────
function LaunchCard({ launch: l, col, canMove, onOpen, onMove }) {
  const i = idxOf(l.stage);
  const prev = i > 0 ? ALL_STAGES[i - 1] : null;
  const next = i < ALL_STAGES.length - 1 ? ALL_STAGES[i + 1] : null;
  const img = l.image || l.product?.images?.[0] || NO_PHOTO;
  const c = l.content || {};
  const ready = [!!c.photos?.length, !!c.sourceUrl, !!c.description];

  return (
    <div onClick={onOpen}
      style={{ background: '#fff', border: `1.5px solid ${col.line}`, borderRadius: 12, padding: 12,
        cursor: 'pointer', transition: 'box-shadow .15s, border-color .15s' }}
      onMouseOver={e => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,.08)'; e.currentTarget.style.borderColor = col.dot; }}
      onMouseOut={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = col.line; }}>

      <div style={{ display: 'flex', gap: 12 }}>
        <img src={cloudinaryOpt(img, 160)} alt="" loading="lazy" onError={e => { e.target.src = NO_PHOTO; }}
          style={{ width: 64, height: 64, borderRadius: 10, objectFit: 'cover', background: '#f1f5f9', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10.5, color: '#b0b8c1' }}>№{l.number}</div>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: '#111', margin: '2px 0 3px' }}>
            {l.name || l.productName}
          </div>
          <div style={{ fontSize: 11.5, color: '#94a3b8' }}>
            {l.sku || l.product?.sku || 'ещё нет в каталоге'}
          </div>
        </div>
      </div>

      {/* Этап «Контент» — видно, чего ещё не хватает */}
      {l.stage === 'content' && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          {[['📷 Фото', ready[0]], ['🔗 Ссылка', ready[1]], ['📝 Описание', ready[2]]].map(([t, ok]) => (
            <span key={t} style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
              background: ok ? '#f0fdf4' : '#f8fafc', color: ok ? '#15803d' : '#94a3b8',
              border: `1px solid ${ok ? '#bbf7d0' : '#e2e8f0'}` }}>
              {ok ? '✓' : '○'} {t}
            </span>
          ))}
        </div>
      )}

      {l.stage === 'design' && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', fontSize: 11.5 }}>
          <span style={{ fontWeight: 700, color: '#7c3aed', background: '#faf5ff', border: '1px solid #e9d5ff',
            borderRadius: 8, padding: '2px 8px' }}>
            🎨 {l.design?.assigneeName || 'без исполнителя'}
          </span>
          {l.design?.files?.length > 0 && (
            <span style={{ color: '#64748b' }}>📎 {l.design.files.length}</span>
          )}
        </div>
      )}

      {(l.stage === 'published' || l.stage === 'feedback' || l.stage === 'done') && (
        <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11.5 }}>
          {l.publish?.publishedAt && (
            <span style={{ fontWeight: 700, color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe',
              borderRadius: 8, padding: '2px 8px' }}>📣 {fmtDay(l.publish.publishedAt)}</span>
          )}
          {l.publish?.links?.length > 0 && <span style={{ color: '#64748b' }}>🔗 {l.publish.links.length}</span>}
        </div>
      )}

      {(l.stage === 'feedback' || l.stage === 'done') && (
        <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {METRICS.map(m => (
            <div key={m.key} style={{ textAlign: 'center', background: '#f8fafc', borderRadius: 8, padding: '5px 2px' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#111' }}>{num(l.result?.[m.key])}</div>
              <div style={{ fontSize: 9.5, color: '#94a3b8' }}>{m.icon}</div>
            </div>
          ))}
        </div>
      )}

      {canMove && (prev || next) && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, justifyContent: 'flex-end' }}>
          {prev && (
            <button onClick={e => { e.stopPropagation(); onMove(prev.key); }} title={`← ${prev.label}`}
              style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${col.line}`, background: '#fff',
                color: '#64748b', fontSize: 13, cursor: 'pointer' }}>◀</button>
          )}
          {next && (
            <button onClick={e => { e.stopPropagation(); onMove(next.key); }} title={`${next.label} →`}
              style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: next.dot,
                color: '#fff', fontSize: 13, cursor: 'pointer' }}>▶</button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Карточка целиком: контент, дизайн, публикация, результат ─────────────────
function LaunchDetail({ launch: l, isContentMgr, isDesigner, onClose, onPatch, onDelete, onOrdered }) {
  const st = ST[l.stage] || ST.content;
  const i = idxOf(l.stage);
  const prev = i > 0 ? ALL_STAGES[i - 1] : null;
  const next = i < ALL_STAGES.length - 1 ? ALL_STAGES[i + 1] : null;
  const canMove = isContentMgr || (isDesigner && l.stage === 'design');

  const [busy, setBusy] = useState('');
  const save = async (data, tag) => {
    setBusy(tag);
    try { await onPatch(data); }
    catch (e) { alert(e?.response?.data?.error || 'Не удалось сохранить'); }
    finally { setBusy(''); }
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1600 }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 1601, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 20, pointerEvents: 'none' }}>
        <div style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 620, maxHeight: '92vh',
          overflow: 'auto', padding: 22, pointerEvents: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
            <img src={cloudinaryOpt(l.image || l.product?.images?.[0] || NO_PHOTO, 200)} alt=""
              onError={e => { e.target.src = NO_PHOTO; }}
              style={{ width: 72, height: 72, borderRadius: 12, objectFit: 'cover', background: '#f1f5f9' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, color: '#b0b8c1' }}>Тест №{l.number}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#111', margin: '2px 0 4px' }}>
                {l.name || l.productName}
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#334155', background: st.bg,
                border: `1px solid ${st.line}`, padding: '3px 10px', borderRadius: 20 }}>
                {st.icon} {st.label}
              </span>
            </div>
            <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 10, background: '#f5f5f5',
              border: 'none', fontSize: 17, cursor: 'pointer', flexShrink: 0 }}>✕</button>
          </div>

          {/* Перенос по этапам */}
          {canMove && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
              {prev && (
                <button onClick={() => save({ stage: prev.key }, 'stage')} disabled={!!busy}
                  style={{ flex: '1 1 140px', padding: '11px', fontSize: 13.5, fontWeight: 700, color: '#64748b',
                    background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 10, cursor: 'pointer' }}>
                  ◀ {prev.label}
                </button>
              )}
              {next && (
                <button onClick={() => save({ stage: next.key }, 'stage')} disabled={!!busy}
                  style={{ flex: '1 1 140px', padding: '11px', fontSize: 13.5, fontWeight: 700, color: '#fff',
                    background: next.dot, border: 'none', borderRadius: 10, cursor: 'pointer' }}>
                  {next.label} ▶
                </button>
              )}
            </div>
          )}

          <ContentBlock launch={l} canEdit={isContentMgr} busy={busy} onSave={save} />
          <DesignBlock  launch={l} canEdit={isContentMgr || isDesigner} busy={busy} onSave={save} />
          <PublishBlock launch={l} canEdit={isContentMgr || isDesigner} busy={busy} onSave={save} />
          <ResultBlock  launch={l} canEdit={isContentMgr} busy={busy} onSave={save} />
          <OutcomeBlock launch={l} canEdit={isContentMgr} busy={busy} onSave={save} onOrdered={onOrdered} />

          {isContentMgr && (
            <button onClick={onDelete}
              style={{ width: '100%', padding: '12px', fontSize: 14, fontWeight: 700, color: '#c0392b',
                background: '#fdecea', border: 'none', borderRadius: 12, cursor: 'pointer', marginTop: 6 }}>
              🗑 Убрать с доски
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function Section({ title, accent, bg, line, children }) {
  return (
    <div style={{ background: bg, border: `1px solid ${line}`, borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: accent, textTransform: 'uppercase',
        letterSpacing: .4, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

// Три поля от Зайнагуль
function ContentBlock({ launch: l, canEdit, busy, onSave }) {
  const [photos, setPhotos] = useState(l.content?.photos || []);
  const [sourceUrl, setSourceUrl] = useState(l.content?.sourceUrl || '');
  const [description, setDescription] = useState(l.content?.description || '');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setPhotos(l.content?.photos || []);
    setSourceUrl(l.content?.sourceUrl || '');
    setDescription(l.content?.description || '');
  }, [l._id, JSON.stringify(l.content)]);

  const upload = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    setUploading(true);
    for (const f of files) {
      try { const url = await uploadToCloudinary(f); setPhotos(p => [...p, url]); }
      catch (err) { alert(err.message); }
    }
    setUploading(false);
  };

  const dirty = JSON.stringify(photos) !== JSON.stringify(l.content?.photos || [])
    || sourceUrl !== (l.content?.sourceUrl || '')
    || description !== (l.content?.description || '');

  return (
    <Section title="📸 Контент — Зайнагуль" accent="#b3161b" bg="#fef2f2" line="#fecaca">
      {!canEdit && !photos.length && !sourceUrl && !description && (
        <div style={{ fontSize: 13, color: '#9aa5b1' }}>Контент ещё не собран.</div>
      )}

      <div style={labelStyle}>Фото {photos.length > 0 && <span style={{ color: '#94a3b8', fontWeight: 400 }}>({photos.length})</span>}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {photos.map((p, i) => (
          <div key={p + i} style={{ position: 'relative', width: 74, height: 74, borderRadius: 10, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
            <a href={p} target="_blank" rel="noreferrer">
              <img src={cloudinaryOpt(p, 200)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </a>
            {canEdit && (
              <button onClick={() => setPhotos(list => list.filter((_, j) => j !== i))} title="Убрать"
                style={{ position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: 6, border: 'none',
                  background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 11, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            )}
          </div>
        ))}
        {canEdit && (
          <label style={{ width: 74, height: 74, borderRadius: 10, border: '1.5px dashed #cbd5e1', display: 'flex',
            alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#94a3b8', fontSize: 20, background: '#fff' }}>
            {uploading ? '…' : '＋'}
            <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={upload} />
          </label>
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={labelStyle}>Ссылка на источник</div>
        {canEdit ? (
          <input value={sourceUrl} onChange={e => setSourceUrl(e.target.value)}
            placeholder="https://…" style={inputStyle} />
        ) : sourceUrl ? (
          <a href={sourceUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13.5, color: '#2563eb', wordBreak: 'break-all' }}>{sourceUrl}</a>
        ) : <div style={{ fontSize: 13, color: '#9aa5b1' }}>—</div>}
      </div>

      <div style={{ marginBottom: canEdit ? 12 : 0 }}>
        <div style={labelStyle}>Описание</div>
        {canEdit ? (
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4}
            placeholder="Что за товар, чем хорош, для кого…" style={{ ...inputStyle, resize: 'vertical' }} />
        ) : (
          <div style={{ fontSize: 13.5, color: description ? '#334155' : '#9aa5b1', whiteSpace: 'pre-wrap' }}>{description || '—'}</div>
        )}
      </div>

      {canEdit && dirty && (
        <button onClick={() => onSave({ content: { photos, sourceUrl, description } }, 'content')} disabled={!!busy || uploading}
          style={{ width: '100%', padding: '11px', fontSize: 14, fontWeight: 700, color: '#fff',
            background: '#DC1E24', border: 'none', borderRadius: 10, cursor: 'pointer' }}>
          {busy === 'content' ? 'Сохраняю…' : 'Сохранить контент'}
        </button>
      )}

      {l.content?.filledByName && (
        <div style={{ fontSize: 11.5, color: '#9aa5b1', marginTop: 8 }}>
          👤 {l.content.filledByName} · {fmtDay(l.content.filledAt)}
        </div>
      )}
    </Section>
  );
}

function DesignBlock({ launch: l, canEdit, busy, onSave }) {
  const [files, setFiles] = useState(l.design?.files || []);
  const [note, setNote]   = useState(l.design?.note || '');
  const [uploading, setUploading] = useState(false);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    setFiles(l.design?.files || []);
    setNote(l.design?.note || '');
  }, [l._id, JSON.stringify(l.design)]);

  const upload = async (e) => {
    const list = [...(e.target.files || [])];
    e.target.value = '';
    if (!list.length) return;
    setUploading(true);
    for (const f of list) {
      try { const url = await uploadToCloudinary(f, 'matkasym/product-launch/design'); setFiles(p => [...p, url]); }
      catch (err) { alert(err.message); }
    }
    setUploading(false);
  };

  const dirty = JSON.stringify(files) !== JSON.stringify(l.design?.files || []) || note !== (l.design?.note || '');

  return (
    <Section title="🎨 Дизайн" accent="#7c3aed" bg="#faf5ff" line="#e9d5ff">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: '#5b6572' }}>
          Исполнитель: <b style={{ color: '#111' }}>{l.design?.assigneeName || '—'}</b>
        </span>
        {canEdit && (
          <button onClick={() => onSave({ design: { assignee: 'me' } }, 'assign')} disabled={!!busy}
            style={{ padding: '6px 12px', fontSize: 12.5, fontWeight: 700, color: '#7c3aed', background: '#fff',
              border: '1.5px solid #e9d5ff', borderRadius: 8, cursor: 'pointer' }}>
            Беру на себя
          </button>
        )}
      </div>

      {/* Карточка в каталоге появляется здесь же — привязываем её к тесту */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: '#5b6572' }}>
          Карточка в каталоге: <b style={{ color: '#111' }}>{l.productName || 'не заведена'}</b>
          {l.sku ? <span style={{ color: '#94a3b8' }}> · {l.sku}</span> : null}
        </span>
        {canEdit && (
          <button onClick={() => setLinking(true)} disabled={!!busy}
            style={{ padding: '6px 12px', fontSize: 12.5, fontWeight: 700, color: '#7c3aed', background: '#fff',
              border: '1.5px solid #e9d5ff', borderRadius: 8, cursor: 'pointer' }}>
            {l.product ? 'Заменить' : 'Привязать товар'}
          </button>
        )}
        {canEdit && l.product && (
          <button onClick={() => onSave({ product: null }, 'unlink')} disabled={!!busy}
            style={{ padding: '6px 10px', fontSize: 12.5, fontWeight: 700, color: '#c0392b', background: '#fdecea',
              border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            Отвязать
          </button>
        )}
      </div>

      {linking && createPortal(
        <ProductPicker
          onClose={() => setLinking(false)}
          onPick={async (p) => { await onSave({ product: p._id }, 'link'); setLinking(false); }}
        />, document.body)}

      <div style={labelStyle}>Готовые макеты</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {files.map((p, i) => (
          <div key={p + i} style={{ position: 'relative', width: 74, height: 74, borderRadius: 10, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
            <a href={p} target="_blank" rel="noreferrer">
              <img src={cloudinaryOpt(p, 200)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </a>
            {canEdit && (
              <button onClick={() => setFiles(list => list.filter((_, j) => j !== i))} title="Убрать"
                style={{ position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: 6, border: 'none',
                  background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 11, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            )}
          </div>
        ))}
        {canEdit && (
          <label style={{ width: 74, height: 74, borderRadius: 10, border: '1.5px dashed #cbd5e1', display: 'flex',
            alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#94a3b8', fontSize: 20, background: '#fff' }}>
            {uploading ? '…' : '＋'}
            <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={upload} />
          </label>
        )}
        {!canEdit && !files.length && <div style={{ fontSize: 13, color: '#9aa5b1' }}>Макетов пока нет.</div>}
      </div>

      <div style={{ marginBottom: canEdit ? 12 : 0 }}>
        <div style={labelStyle}>Заметка дизайнера</div>
        {canEdit ? (
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
            placeholder="Что сделано, что уточнить…" style={{ ...inputStyle, resize: 'vertical' }} />
        ) : (
          <div style={{ fontSize: 13.5, color: note ? '#334155' : '#9aa5b1', whiteSpace: 'pre-wrap' }}>{note || '—'}</div>
        )}
      </div>

      {canEdit && dirty && (
        <button onClick={() => onSave({ design: { files, note } }, 'design')} disabled={!!busy || uploading}
          style={{ width: '100%', padding: '11px', fontSize: 14, fontWeight: 700, color: '#fff',
            background: '#7c3aed', border: 'none', borderRadius: 10, cursor: 'pointer' }}>
          {busy === 'design' ? 'Сохраняю…' : 'Сохранить дизайн'}
        </button>
      )}

      {l.design?.doneByName && (
        <div style={{ fontSize: 11.5, color: '#9aa5b1', marginTop: 8 }}>
          ✅ Передал в публикацию: {l.design.doneByName} · {fmtDay(l.design.doneAt)}
        </div>
      )}
    </Section>
  );
}

function PublishBlock({ launch: l, canEdit, busy, onSave }) {
  const [links, setLinks] = useState(l.publish?.links?.length ? l.publish.links : []);
  const [note, setNote]   = useState(l.publish?.note || '');
  const [date, setDate]   = useState(l.publish?.publishedAt ? l.publish.publishedAt.slice(0, 10) : '');

  useEffect(() => {
    setLinks(l.publish?.links || []);
    setNote(l.publish?.note || '');
    setDate(l.publish?.publishedAt ? String(l.publish.publishedAt).slice(0, 10) : '');
  }, [l._id, JSON.stringify(l.publish)]);

  const dirty = JSON.stringify(links) !== JSON.stringify(l.publish?.links || [])
    || note !== (l.publish?.note || '')
    || date !== (l.publish?.publishedAt ? String(l.publish.publishedAt).slice(0, 10) : '');

  return (
    <Section title="📣 Публикация" accent="#1d4ed8" bg="#eff6ff" line="#bfdbfe">
      <div style={{ marginBottom: 12 }}>
        <div style={labelStyle}>Дата выхода поста</div>
        {canEdit ? (
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
        ) : (
          <div style={{ fontSize: 13.5, color: '#334155' }}>{fmtDay(l.publish?.publishedAt) || '—'}</div>
        )}
      </div>

      <div style={labelStyle}>Ссылки на посты</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        {links.map((link, i) => (
          <div key={i} style={{ display: 'flex', gap: 6 }}>
            {canEdit ? (
              <>
                <input value={link.platform} placeholder="Telegram / Instagram"
                  onChange={e => setLinks(list => list.map((x, j) => j === i ? { ...x, platform: e.target.value } : x))}
                  style={{ ...inputStyle, flex: '0 0 42%' }} />
                <input value={link.url} placeholder="https://…"
                  onChange={e => setLinks(list => list.map((x, j) => j === i ? { ...x, url: e.target.value } : x))}
                  style={{ ...inputStyle, flex: 1 }} />
                <button onClick={() => setLinks(list => list.filter((_, j) => j !== i))}
                  style={{ flexShrink: 0, width: 34, borderRadius: 8, border: 'none', background: '#fdecea',
                    color: '#c0392b', fontSize: 14, cursor: 'pointer' }}>✕</button>
              </>
            ) : (
              <a href={link.url} target="_blank" rel="noreferrer" style={{ fontSize: 13.5, color: '#2563eb', wordBreak: 'break-all' }}>
                {link.platform ? `${link.platform}: ` : ''}{link.url}
              </a>
            )}
          </div>
        ))}
        {canEdit && (
          <button onClick={() => setLinks(list => [...list, { platform: '', url: '' }])}
            style={{ padding: '9px', borderRadius: 9, border: '1.5px dashed #bfdbfe', background: '#fff',
              color: '#1d4ed8', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            ＋ Ссылка
          </button>
        )}
        {!canEdit && !links.length && <div style={{ fontSize: 13, color: '#9aa5b1' }}>Ссылок нет.</div>}
      </div>

      <div style={{ marginBottom: canEdit ? 12 : 0 }}>
        <div style={labelStyle}>Заметка</div>
        {canEdit ? (
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Где и как вышел пост" style={inputStyle} />
        ) : (
          <div style={{ fontSize: 13.5, color: note ? '#334155' : '#9aa5b1' }}>{note || '—'}</div>
        )}
      </div>

      {canEdit && dirty && (
        <button onClick={() => onSave({ publish: { links, note, publishedAt: date || null } }, 'publish')} disabled={!!busy}
          style={{ width: '100%', padding: '11px', fontSize: 14, fontWeight: 700, color: '#fff',
            background: '#2563eb', border: 'none', borderRadius: 10, cursor: 'pointer' }}>
          {busy === 'publish' ? 'Сохраняю…' : 'Сохранить публикацию'}
        </button>
      )}
    </Section>
  );
}

function ResultBlock({ launch: l, canEdit, busy, onSave }) {
  const init = () => Object.fromEntries(METRICS.map(m => [m.key, l.result?.[m.key] ?? '']));
  const [vals, setVals] = useState(init);
  const [note, setNote] = useState(l.result?.note || '');

  useEffect(() => { setVals(init()); setNote(l.result?.note || ''); }, [l._id, JSON.stringify(l.result)]);

  const dirty = METRICS.some(m => String(vals[m.key] ?? '') !== String(l.result?.[m.key] ?? ''))
    || note !== (l.result?.note || '');

  return (
    <Section title="📊 Результат поста" accent="#15803d" bg="#f0fdf4" line="#bbf7d0">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 12 }}>
        {METRICS.map(m => (
          <div key={m.key}>
            <div style={{ ...labelStyle, fontSize: 11.5 }}>{m.icon} {m.label}</div>
            {canEdit ? (
              <input inputMode="numeric" value={vals[m.key]}
                onChange={e => setVals(v => ({ ...v, [m.key]: e.target.value.replace(/[^\d]/g, '') }))}
                placeholder="—" style={{ ...inputStyle, textAlign: 'center', fontSize: 18, fontWeight: 800, padding: '8px' }} />
            ) : (
              <div style={{ textAlign: 'center', fontSize: 20, fontWeight: 800, color: '#111',
                background: '#fff', borderRadius: 10, padding: '8px' }}>{num(l.result?.[m.key])}</div>
            )}
          </div>
        ))}
      </div>

      <div style={{ marginBottom: canEdit ? 12 : 0 }}>
        <div style={labelStyle}>Вывод</div>
        {canEdit ? (
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
            placeholder="Что спрашивали, брать ли партию…" style={{ ...inputStyle, resize: 'vertical' }} />
        ) : (
          <div style={{ fontSize: 13.5, color: note ? '#334155' : '#9aa5b1', whiteSpace: 'pre-wrap' }}>{note || '—'}</div>
        )}
      </div>

      {canEdit && dirty && (
        <button onClick={() => onSave({ result: { ...vals, note } }, 'result')} disabled={!!busy}
          style={{ width: '100%', padding: '11px', fontSize: 14, fontWeight: 700, color: '#fff',
            background: '#22c55e', border: 'none', borderRadius: 10, cursor: 'pointer' }}>
          {busy === 'result' ? 'Сохраняю…' : 'Сохранить результат'}
        </button>
      )}

      {l.result?.updatedByName && (
        <div style={{ fontSize: 11.5, color: '#9aa5b1', marginTop: 8 }}>
          👤 {l.result.updatedByName} · {fmtDay(l.result.updatedAt)}
        </div>
      )}
    </Section>
  );
}

// ── Итог теста: заказываем партию или закрываем без спроса ───────────────────
function OutcomeBlock({ launch: l, canEdit, busy, onSave, onOrdered }) {
  const [qty, setQty] = useState('');
  const [sending, setSending] = useState(false);

  // До публикации подводить итог нечему
  if (!['published', 'feedback', 'done'].includes(l.stage)) return null;

  const order = async () => {
    if (!window.confirm('Создать заявку на заказ первой партии? Карточка теста закроется.')) return;
    setSending(true);
    try { await onOrdered(qty ? Number(qty) : undefined); }
    catch (e) { alert(e?.response?.data?.error || 'Не удалось создать заявку'); }
    finally { setSending(false); }
  };

  if (l.outcome === 'ordered') {
    return (
      <Section title="✅ Итог теста" accent="#b45309" bg="#fffbeb" line="#fde68a">
        <div style={{ fontSize: 13.5, color: '#334155' }}>
          Спрос подтвердился — создана заявка на заказ
          {l.request?.number ? <b> №{l.request.number}</b> : null}. Дальше она идёт по вкладке «Заявки на заказ».
        </div>
      </Section>
    );
  }

  if (l.outcome === 'rejected') {
    return (
      <Section title="✖️ Итог теста" accent="#64748b" bg="#f8fafc" line="#e2e8f0">
        <div style={{ fontSize: 13.5, color: '#334155' }}>Спроса не нашлось — товар не заказываем.</div>
        {canEdit && (
          <button onClick={() => onSave({ outcome: '', stage: 'feedback' }, 'outcome')} disabled={!!busy}
            style={{ marginTop: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, color: '#475569',
              background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 9, cursor: 'pointer' }}>
            Вернуть в работу
          </button>
        )}
      </Section>
    );
  }

  if (!canEdit) return null;

  return (
    <Section title="🛒 Есть спрос — заказываем партию" accent="#b45309" bg="#fffbeb" line="#fde68a">
      <div style={{ fontSize: 12.5, color: '#92400e', marginBottom: 10 }}>
        Заявка уйдёт во вкладку «Заявки на заказ» с фото, названием и числом заявок от клиентов.
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 150px' }}>
          <div style={labelStyle}>Сколько заказываем, шт</div>
          <input inputMode="numeric" value={qty} onChange={e => setQty(e.target.value.replace(/[^\d]/g, ''))}
            placeholder="необязательно" style={inputStyle} />
        </div>
        <button onClick={order} disabled={sending || !!busy}
          style={{ flex: '1 1 200px', padding: '12px', fontSize: 14.5, fontWeight: 700, color: '#fff',
            background: sending ? '#cbd5e1' : '#b45309', border: 'none', borderRadius: 10, cursor: 'pointer' }}>
          {sending ? 'Создаю…' : '📥 Создать заявку на заказ'}
        </button>
      </div>
      <button onClick={() => onSave({ outcome: 'rejected', stage: 'done' }, 'outcome')} disabled={!!busy}
        style={{ width: '100%', marginTop: 10, padding: '10px', fontSize: 13.5, fontWeight: 700, color: '#64748b',
          background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 10, cursor: 'pointer' }}>
        ✖️ Спроса нет — не берём
      </button>
    </Section>
  );
}

// ── Новый товар на тест: то, что Зайнагуль нашла в интернете ─────────────────
function NewLaunchForm({ onClose, onCreate }) {
  const [name, setName] = useState('');
  const [photos, setPhotos] = useState([]);
  const [sourceUrl, setSourceUrl] = useState('');
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const upload = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    setUploading(true);
    for (const f of files) {
      try { const url = await uploadToCloudinary(f); setPhotos(p => [...p, url]); }
      catch (err) { setError(err.message); }
    }
    setUploading(false);
  };

  const submit = async () => {
    if (!name.trim()) return setError('Укажите название товара');
    setSaving(true); setError('');
    try { await onCreate({ name, photos, sourceUrl, description }); }
    catch (e) { setError(e?.response?.data?.error || 'Не удалось создать'); setSaving(false); }
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1700 }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 1701, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 20, pointerEvents: 'none' }}>
        <div style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 540, maxHeight: '92vh',
          overflow: 'auto', padding: 22, pointerEvents: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>🧪 Новый товар на тест</div>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 9, background: '#f5f5f5',
              border: 'none', fontSize: 16, cursor: 'pointer' }}>✕</button>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={labelStyle}>Название товара <span style={{ color: '#DC1E24' }}>*</span></div>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="Например: Складной табурет" style={inputStyle} />
          </div>

          <div style={labelStyle}>Фото {photos.length > 0 && <span style={{ color: '#94a3b8', fontWeight: 400 }}>({photos.length})</span>}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {photos.map((p, i) => (
              <div key={p + i} style={{ position: 'relative', width: 74, height: 74, borderRadius: 10, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                <img src={cloudinaryOpt(p, 200)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button onClick={() => setPhotos(list => list.filter((_, j) => j !== i))} title="Убрать"
                  style={{ position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: 6, border: 'none',
                    background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 11, cursor: 'pointer', lineHeight: 1 }}>✕</button>
              </div>
            ))}
            <label style={{ width: 74, height: 74, borderRadius: 10, border: '1.5px dashed #cbd5e1', display: 'flex',
              alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#94a3b8', fontSize: 20 }}>
              {uploading ? '…' : '＋'}
              <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={upload} />
            </label>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={labelStyle}>Ссылка на источник</div>
            <input value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="https://…" style={inputStyle} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={labelStyle}>Описание</div>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4}
              placeholder="Что за товар, чем хорош, для кого…" style={{ ...inputStyle, resize: 'vertical' }} />
          </div>

          {error && <div style={{ color: '#c00', fontSize: 13, marginBottom: 12 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose}
              style={{ flex: '0 0 auto', padding: '13px 18px', fontSize: 15, fontWeight: 600, color: '#555',
                background: '#f1f5f9', border: 'none', borderRadius: 12, cursor: 'pointer' }}>Отмена</button>
            <button onClick={submit} disabled={saving || uploading}
              style={{ flex: 1, padding: '13px', fontSize: 15, fontWeight: 700, color: '#fff',
                background: saving ? '#9aa5b1' : '#DC1E24', border: 'none', borderRadius: 12, cursor: 'pointer' }}>
              {saving ? 'Создаю…' : 'На доску теста'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Выбор товара из каталога ─────────────────────────────────────────────────
function ProductPicker({ onClose, onPick }) {
  const [list, setList]   = useState([]);
  const [q, setQ]         = useState('');
  const [loading, setLoad] = useState(true);
  const [testOnly, setTestOnly] = useState(true);

  useEffect(() => {
    adminGetProducts({ limit: 2000, sort: 'newest' })
      .then(r => setList(r.data.products || []))
      .catch(() => setList([]))
      .finally(() => setLoad(false));
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return list.filter(p => {
      if (testOnly && p.productStatus !== 'test_sale') return false;
      if (!s) return true;
      return `${p.fullName || ''} ${p.name || ''} ${p.sku || ''}`.toLowerCase().includes(s);
    }).slice(0, 200);
  }, [list, q, testOnly]);

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1700 }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 1701, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 20, pointerEvents: 'none' }}>
        <div style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 540, maxHeight: '90vh',
          overflow: 'auto', padding: 20, pointerEvents: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 17, fontWeight: 800 }}>🚀 Товар на доску запуска</div>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 9, background: '#f5f5f5',
              border: 'none', fontSize: 16, cursor: 'pointer' }}>✕</button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            {[[true, '🧪 Только тестовые'], [false, 'Все товары']].map(([v, label]) => (
              <div key={String(v)} onClick={() => setTestOnly(v)} style={{
                flex: 1, textAlign: 'center', padding: '8px 10px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', border: `1.5px solid ${testOnly === v ? '#DC1E24' : '#e2e8f0'}`,
                background: testOnly === v ? '#fef2f2' : '#fff', color: testOnly === v ? '#b3161b' : '#475569',
              }}>{label}</div>
            ))}
          </div>

          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск по названию или артикулу…"
            style={{ ...inputStyle, marginBottom: 10 }} />

          {loading ? (
            <div style={{ color: '#aaa', textAlign: 'center', padding: 30 }}>Загрузка каталога…</div>
          ) : filtered.length === 0 ? (
            <div style={{ color: '#bbb', textAlign: 'center', padding: 30, fontSize: 14 }}>Ничего не найдено</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map(p => (
                <div key={p._id} onClick={() => onPick(p)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 8, borderRadius: 10,
                    border: '1px solid #eceff3', cursor: 'pointer' }}
                  onMouseOver={e => e.currentTarget.style.borderColor = '#DC1E24'}
                  onMouseOut={e => e.currentTarget.style.borderColor = '#eceff3'}>
                  <img src={cloudinaryOpt(p.images?.[0] || NO_PHOTO, 100)} alt="" loading="lazy"
                    onError={e => { e.target.src = NO_PHOTO; }}
                    style={{ width: 46, height: 46, borderRadius: 8, objectFit: 'cover', background: '#f1f5f9', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#111', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.fullName || p.name}</div>
                    <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>
                      {p.sku}{typeof p.stock === 'number' ? ` · остаток: ${p.stock}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
