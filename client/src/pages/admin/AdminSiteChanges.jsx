// «Правки сайта»: дизайнер описывает словами, что поменять во внешнем виде сайта,
// Claude делает правку в отдельной ветке (GitHub Actions), собирается
// предпросмотр, владелец принимает — и только тогда правка уходит на сайт.
// Сервер: server/routes/siteChanges.js, воркфлоу: .github/workflows/site-change.yml.
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import {
  getSiteChanges, getSiteChange, createSiteChange, commentSiteChange,
  retrySiteChange, approveSiteChange, rejectSiteChange,
} from '../../api/index';

const C = {
  red: '#e10523', redDark: '#b8001b', line: '#ecebe7', text: '#1c1c1c', muted: '#6b7684',
  green: '#2d7a3a', greenWash: '#e6f4ea', amber: '#9a6700', amberWash: '#fff4d6',
  slateWash: '#eef2f4', redWash: '#fdecee',
};

const STATUS = {
  queued:    { label: 'В очереди',          color: C.muted,  bg: C.slateWash },
  working:   { label: 'Claude делает…',     color: C.amber,  bg: C.amberWash },
  ready:     { label: 'Ждёт решения',       color: '#1d4ed8', bg: '#e8efff' },
  failed:    { label: 'Не получилось',      color: C.redDark, bg: C.redWash },
  merging:   { label: 'Выкладывается…',     color: C.amber,  bg: C.amberWash },
  merged:    { label: 'На сайте',           color: C.green,  bg: C.greenWash },
  rejected:  { label: 'Отклонено',          color: C.muted,  bg: C.slateWash },
  cancelled: { label: 'Отменено',           color: C.muted,  bg: C.slateWash },
};
const ACTIVE = ['queued', 'working', 'merging'];

const fmtDate = d => d ? new Date(d).toLocaleString('ru', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
const errMsg = e => e?.response?.data?.message || e?.message || 'Ошибка';

function Badge({ status }) {
  const s = STATUS[status] || STATUS.queued;
  return <span style={{ background: s.bg, color: s.color, borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{s.label}</span>;
}

function Button({ kind = 'ghost', children, style, ...p }) {
  const k = {
    primary: { background: C.red, color: '#fff', border: `1px solid ${C.red}` },
    green:   { background: C.green, color: '#fff', border: `1px solid ${C.green}` },
    ghost:   { background: '#fff', color: C.text, border: `1px solid ${C.line}` },
    danger:  { background: '#fff', color: C.redDark, border: '1px solid #f5c2c9' },
  }[kind];
  return (
    <button {...p} style={{
      ...k, borderRadius: 9, padding: '8px 14px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
      cursor: p.disabled ? 'default' : 'pointer', opacity: p.disabled ? .55 : 1, whiteSpace: 'nowrap', ...style,
    }}>{children}</button>
  );
}

function Modal({ title, onClose, children, width = 640 }) {
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div onMouseDown={e => e.target === e.currentTarget && onClose()} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, background: 'rgba(0,0,0,.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: 'var(--admin-font)',
    }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: width, maxHeight: '90vh', overflow: 'auto', padding: '22px 24px', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{title}</div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: C.muted, lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

const inputStyle = { width: '100%', boxSizing: 'border-box', border: `1px solid ${C.line}`, borderRadius: 10, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit' };

function ImagePicker({ files, setFiles }) {
  return (
    <div style={{ marginTop: 8 }}>
      <label style={{ fontSize: 13, color: C.muted, cursor: 'pointer' }}>
        📎 Приложить скриншоты или пример (до 5)
        <input type="file" accept="image/*" multiple hidden onChange={e => setFiles([...files, ...e.target.files].slice(0, 5))} />
      </label>
      {!!files.length && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {files.map((f, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <img src={URL.createObjectURL(f)} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: `1px solid ${C.line}` }} />
              <button onClick={() => setFiles(files.filter((_, j) => j !== i))} style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, border: 'none', background: '#1c1c1c', color: '#fff', cursor: 'pointer', fontSize: 12 }}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NewChange({ onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    setBusy(true); setErr('');
    const f = new FormData();
    f.append('title', title); f.append('text', text);
    files.forEach(x => f.append('images', x));
    try { const r = await createSiteChange(f); onCreated(r.data); }
    catch (e) { setErr(errMsg(e)); setBusy(false); }
  };
  return (
    <Modal title="Новая правка сайта" onClose={onClose}>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 14, lineHeight: 1.5 }}>
        Опишите словами, что поменять во внешнем виде сайта или в PDF-каталоге: какая страница или какой каталог, что именно и как должно стать.
        Claude сделает правку за 5–15 минут, вы проверите её на предпросмотре, а на сайт она попадёт после одобрения владельца.
      </div>
      <input style={inputStyle} placeholder="Коротко: что сделать (например, «Крупнее фото в карточке товара»)" value={title} onChange={e => setTitle(e.target.value)} maxLength={140} />
      <textarea style={{ ...inputStyle, marginTop: 10, minHeight: 140, resize: 'vertical' }}
        placeholder={'Подробно: где это (страница, раздел), что сейчас не так, как должно быть.\nЦвета, размеры, тексты — чем точнее, тем лучше.'}
        value={text} onChange={e => setText(e.target.value)} maxLength={5000} />
      <ImagePicker files={files} setFiles={setFiles} />
      {err && <div style={{ color: C.redDark, fontSize: 13, marginTop: 10 }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <Button onClick={onClose}>Отмена</Button>
        <Button kind="primary" disabled={busy || !title.trim() || !text.trim()} onClick={submit}>{busy ? 'Отправляю…' : 'Отправить Claude'}</Button>
      </div>
    </Modal>
  );
}

function Message({ m }) {
  const bot = m.kind === 'bot';
  const decision = m.kind === 'decision';
  return (
    <div style={{ background: bot ? C.slateWash : decision ? '#fafafa' : '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '10px 12px', marginBottom: 8 }}>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>
        <b style={{ color: C.text }}>{bot ? '🤖 Claude' : m.authorName}</b> · {fmtDate(m.at)}
      </div>
      <div style={{ fontSize: 14, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{m.text}</div>
      {!!m.images?.length && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {m.images.map(u => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8 }} /></a>)}
        </div>
      )}
    </div>
  );
}

function Detail({ id, isOwner, onClose, onChanged }) {
  const [d, setD] = useState(null);
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(() => getSiteChange(id).then(r => setD(r.data)).catch(e => setErr(errMsg(e))), [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!d || !ACTIVE.includes(d.status)) return;
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [d?.status, load]);

  const act = async (fn, after) => {
    setBusy(true); setErr('');
    try { const r = await fn(); setD(r.data); onChanged(); after?.(); }
    catch (e) { setErr(errMsg(e)); }
    setBusy(false);
  };

  const send = () => {
    const f = new FormData(); f.append('text', text); files.forEach(x => f.append('images', x));
    act(() => commentSiteChange(id, f), () => { setText(''); setFiles([]); });
  };
  const reject = () => {
    const reason = isOwner ? window.prompt('Причина (увидит дизайнер). Можно оставить пустым:', '') : '';
    if (reason === null) return;
    if (!isOwner && !window.confirm('Отменить эту правку?')) return;
    act(() => rejectSiteChange(id, reason));
  };

  if (!d) return <Modal title="Правка сайта" onClose={onClose}><div style={{ color: C.muted }}>{err || 'Загрузка…'}</div></Modal>;
  const canComment = ['ready', 'failed'].includes(d.status);
  const open = !['merging', 'merged', 'rejected', 'cancelled'].includes(d.status);

  return (
    <Modal title={`№${d.number} · ${d.title}`} onClose={onClose} width={720}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <Badge status={d.status} />
        <span style={{ fontSize: 12, color: C.muted }}>{d.authorName} · {fmtDate(d.createdAt)}{isOwner && d.costUsd ? ` · $${d.costUsd.toFixed(2)}` : ''}</span>
        {d.runUrl && isOwner && <a href={d.runUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C.muted }}>журнал запуска</a>}
        {d.prUrl && isOwner && <a href={d.prUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C.muted }}>изменения в коде</a>}
      </div>

      {d.status === 'ready' && d.previewUrl && (
        <div style={{ background: '#e8efff', borderRadius: 12, padding: '12px 14px', marginBottom: 14, fontSize: 14, lineHeight: 1.5 }}>
          👀 <a href={d.previewUrl} target="_blank" rel="noreferrer" style={{ fontWeight: 700 }}>Открыть предпросмотр</a>
          <div style={{ fontSize: 12, color: C.muted }}>Собирается 3–7 минут после того, как правка готова. Данные там <b>настоящие</b>: ничего не меняйте в товарах на предпросмотре — только смотрите.</div>
        </div>
      )}
      {d.status === 'ready' && !!d.pdfs?.length && (
        <div style={{ background: C.slateWash, borderRadius: 12, padding: '12px 14px', marginBottom: 14, fontSize: 14, lineHeight: 1.6 }}>
          {d.pdfs.map((p, i) => (
            <div key={i}>📄 {p.url
              ? <a href={p.url} target="_blank" rel="noreferrer" style={{ fontWeight: 700 }}>{p.title} — пробный PDF</a>
              : <span>{p.title}: не собрался <span style={{ color: C.muted, fontSize: 12 }}>({p.error})</span></span>}</div>
          ))}
          <div style={{ fontSize: 12, color: C.muted }}>Собран по новой вёрстке. После «Принять» боевые каталоги пересоберутся сами при следующем скачивании.</div>
        </div>
      )}
      {d.status === 'failed' && d.error && (
        <div style={{ background: C.redWash, color: C.redDark, borderRadius: 12, padding: '10px 14px', marginBottom: 14, fontSize: 14 }}>{d.error}</div>
      )}
      {!!d.reverted?.length && (
        <div style={{ background: C.amberWash, color: C.amber, borderRadius: 12, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
          Отменены изменения в файлах, которые дизайнерам трогать нельзя: {d.reverted.join(', ')}
        </div>
      )}
      {ACTIVE.includes(d.status) && (
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 14 }}>
          {d.stuck ? '⚠️ Запуск, похоже, завис.' : d.status === 'merging' ? 'Правка выкладывается на сайт…' : 'Claude работает над правкой, обычно это 5–15 минут. Страница обновится сама.'}
        </div>
      )}

      {d.messages.map((m, i) => <Message key={i} m={m} />)}

      {canComment && (
        <div style={{ marginTop: 12 }}>
          <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={text} onChange={e => setText(e.target.value)}
            placeholder="Уточнение: что поправить (Claude доработает эту же правку)" />
          <ImagePicker files={files} setFiles={setFiles} />
        </div>
      )}
      {err && <div style={{ color: C.redDark, fontSize: 13, marginTop: 10 }}>{err}</div>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: 16 }}>
        {open && <Button kind="danger" disabled={busy} onClick={reject}>{isOwner ? 'Отклонить' : 'Отменить правку'}</Button>}
        {(d.status === 'failed' || d.stuck) && <Button disabled={busy} onClick={() => act(() => retrySiteChange(id))}>Повторить</Button>}
        {canComment && <Button kind="primary" disabled={busy || !text.trim()} onClick={send}>Отправить уточнение</Button>}
        {isOwner && d.status === 'ready' && (
          <Button kind="green" disabled={busy} onClick={() => window.confirm('Выложить правку на сайт?') && act(() => approveSiteChange(id))}>✅ Принять и выложить</Button>
        )}
      </div>
    </Modal>
  );
}

export default function AdminSiteChanges() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState('open');
  const openId = params.get('id');

  const load = useCallback(() => getSiteChanges().then(r => setData(r.data)).catch(e => setErr(errMsg(e))), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!data?.items?.some(x => ACTIVE.includes(x.status))) return;
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [data, load]);

  const setOpen = id => setParams(id ? { id } : {});
  const items = (data?.items || []).filter(x =>
    filter === 'all' ? true : filter === 'open' ? !['merged', 'rejected', 'cancelled'].includes(x.status) : x.status === 'merged');
  const waiting = (data?.items || []).filter(x => x.status === 'ready').length;

  return (
    <div className="admin-page" style={{ maxWidth: 960 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>🎨 Правки сайта</h1>
        <Button kind="primary" onClick={() => setCreating(true)}>+ Новая правка</Button>
      </div>
      <div style={{ color: C.muted, fontSize: 14, marginBottom: 18, lineHeight: 1.5 }}>
        Опишите словами, что изменить во внешнем виде сайта или в PDF-каталогах. Claude сделает правку, вы проверите её на предпросмотре,
        владелец примет — и она появится на сайте.
        {data?.isOwner && data.budget && <> Расход за месяц: <b>${data.budget.spent}</b> из ${data.budget.limit}.</>}
        {data?.isOwner && waiting > 0 && <> Ждут вашего решения: <b>{waiting}</b>.</>}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {[['open', 'Открытые'], ['merged', 'На сайте'], ['all', 'Все']].map(([k, l]) => (
          <Button key={k} kind={filter === k ? 'primary' : 'ghost'} style={{ padding: '6px 12px' }} onClick={() => setFilter(k)}>{l}</Button>
        ))}
      </div>

      {err && <div style={{ color: C.redDark }}>{err}</div>}
      {!data && !err && <div style={{ color: C.muted }}>Загрузка…</div>}
      {data && !items.length && <div style={{ color: C.muted, padding: '30px 0' }}>Пока пусто.</div>}

      <div style={{ display: 'grid', gap: 8 }}>
        {items.map(x => (
          <div key={x._id} onClick={() => setOpen(x._id)} style={{
            border: `1px solid ${C.line}`, borderRadius: 12, padding: '12px 14px', background: '#fff', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between',
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>№{x.number} · {x.title}</div>
              <div style={{ fontSize: 12, color: C.muted }}>{x.authorName} · {fmtDate(x.createdAt)}{x.stuck ? ' · ⚠️ завис' : ''}</div>
            </div>
            <Badge status={x.status} />
          </div>
        ))}
      </div>

      {creating && <NewChange onClose={() => setCreating(false)} onCreated={d => { setCreating(false); load(); setOpen(d._id); }} />}
      {openId && <Detail id={openId} isOwner={!!data?.isOwner} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}
