// Вкладка «Чертежи»: PDF конструкторов с постоянной ссылкой.
//
// Те же записи, что загружает Telegram-бот (server/lib/drawingBot.js). Главное —
// ссылка: она не меняется при замене файла, поэтому её можно один раз отдать
// в цех или вставить в тех.лист. Прежние файлы остаются в «Версиях».
//
// Каждый сразу видит только свои чертежи. Чужие — во вкладке «Конструкторы»:
// список людей → чертежи выбранного.
import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  getDrawings, getDrawingAuthors, uploadDrawing, updateDrawing, replaceDrawing, deleteDrawingApi,
} from '../../api/index';

const BOT_LINK = 'https://t.me/productmatrixmatkasym_bot?start=konstruktor';
const MAX_MB = 20;

const C = {
  red: '#e10523', redDark: '#b8001b', redWash: '#fdecee',
  line: '#ecebe7', surface: '#fff', slate: '#7d96a0', slateWash: '#eef2f4',
  text: '#1c1c1c', muted: '#6b7684', green: '#2d7a3a', greenWash: '#e6f4ea',
};

const fmtDate = d => d ? new Date(d).toLocaleString('ru', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const fmtSize = n => !n ? '' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} КБ` : `${(n / 1024 / 1024).toFixed(1)} МБ`;
const nameOf  = d => d.title || (d.fileName || '').replace(/\.pdf$/i, '') || 'Чертёж';
const plural  = n => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? 'чертёж' : m >= 2 && m <= 4 && (h < 12 || h > 14) ? 'чертежа' : 'чертежей'; };
const errMsg  = e => e?.response?.data?.message || e?.message || 'Ошибка';

function checkPdf(file) {
  if (!file) return 'Выберите файл';
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') return 'Нужен файл PDF';
  if (file.size > MAX_MB * 1024 * 1024) return `Файл больше ${MAX_MB} МБ`;
  return '';
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  }
}

// ── Общие кусочки ────────────────────────────────────────────────────────────

const btn = (kind = 'ghost') => ({
  primary: { background: C.red, color: '#fff', border: `1px solid ${C.red}` },
  dark:    { background: '#1c1c1c', color: '#fff', border: '1px solid #1c1c1c' },
  ghost:   { background: '#fff', color: C.text, border: `1px solid ${C.line}` },
  danger:  { background: '#fff', color: C.redDark, border: '1px solid #f5c2c9' },
  dangerFill: { background: C.redDark, color: '#fff', border: `1px solid ${C.redDark}` },
}[kind]);

function Button({ kind, children, style, ...p }) {
  return (
    <button {...p} style={{
      ...btn(kind), borderRadius: 9, padding: '8px 14px', fontSize: 13, fontWeight: 600,
      cursor: p.disabled ? 'default' : 'pointer', opacity: p.disabled ? .55 : 1,
      fontFamily: 'inherit', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6,
      ...style,
    }}>{children}</button>
  );
}

function Modal({ title, onClose, children, width = 480 }) {
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div onMouseDown={e => e.target === e.currentTarget && onClose()} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
      background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, fontFamily: 'var(--admin-font)',
    }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: width, maxHeight: '90vh',
        overflow: 'auto', padding: '22px 24px', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{title}</div>
          <button onClick={onClose} aria-label="Закрыть" style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: C.muted }}>✕</button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function Field({ label, hint, ...p }) {
  const Tag = p.rows ? 'textarea' : 'input';
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 5 }}>{label}</div>
      <Tag {...p} style={{ width: '100%', boxSizing: 'border-box', fontSize: 14, fontFamily: 'inherit',
        border: `1px solid ${C.line}`, borderRadius: 9, padding: '9px 11px', outline: 'none', resize: 'vertical' }} />
      {hint && <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{hint}</div>}
    </label>
  );
}

function Progress({ value }) {
  return (
    <div style={{ height: 6, background: C.slateWash, borderRadius: 3, overflow: 'hidden', margin: '10px 0' }}>
      <div style={{ height: '100%', width: `${value}%`, background: C.red, transition: 'width .2s' }} />
    </div>
  );
}

function LinkBox({ url, onCopied }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
      <input readOnly value={url} onFocus={e => e.target.select()} style={{ flex: 1, minWidth: 0, fontSize: 12.5,
        fontFamily: 'ui-monospace, Menlo, monospace', border: `1px solid ${C.line}`, borderRadius: 9,
        padding: '9px 10px', background: '#fafaf8', color: C.text }} />
      <Button kind="primary" onClick={async () => { if (await copyText(url)) onCopied?.(); }}>🔗 Копировать</Button>
    </div>
  );
}

// ── Зона выбора файла ────────────────────────────────────────────────────────

function DropZone({ file, onFile, compact }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onClick={() => input.current?.click()}
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
      style={{ border: `2px dashed ${over ? C.red : '#d9d6cf'}`, background: over ? C.redWash : '#fafaf8',
        borderRadius: 12, padding: compact ? '16px 14px' : '26px 16px', textAlign: 'center', cursor: 'pointer',
        marginBottom: 14, transition: 'all .15s' }}>
      <input ref={input} type="file" accept="application/pdf,.pdf" hidden
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
      {file ? (
        <>
          <div style={{ fontSize: 26 }}>📄</div>
          <div style={{ fontWeight: 700, fontSize: 14, marginTop: 4, wordBreak: 'break-word' }}>{file.name}</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{fmtSize(file.size)} · нажмите, чтобы выбрать другой</div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 28 }}>📐</div>
          <div style={{ fontWeight: 700, fontSize: 14, marginTop: 4 }}>Перетащите PDF сюда или нажмите</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Только PDF, до {MAX_MB} МБ</div>
        </>
      )}
    </div>
  );
}

// ── Модалки ──────────────────────────────────────────────────────────────────

function UploadModal({ onClose, onDone, toast }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  const [caption, setCaption] = useState('');
  const [pct, setPct] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);

  const pick = f => {
    const e = checkPdf(f); setErr(e);
    if (!e) { setFile(f); if (!title) setTitle(f.name.replace(/\.pdf$/i, '')); }
  };

  const submit = async () => {
    const e = checkPdf(file); if (e) return setErr(e);
    setBusy(true); setErr('');
    try {
      const fd = new FormData();
      fd.append('file', file); fd.append('title', title); fd.append('code', code); fd.append('caption', caption);
      const r = await uploadDrawing(fd, ev => ev.total && setPct(Math.round(ev.loaded * 100 / ev.total)));
      setDone(r.data); onDone(r.data);
    } catch (e2) { setErr(errMsg(e2)); }
    finally { setBusy(false); }
  };

  if (done) {
    return (
      <Modal title="✅ Чертёж загружен" onClose={onClose}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{nameOf(done)}</div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>Ссылка постоянная: при замене файла она не изменится.</div>
        <LinkBox url={done.url} onCopied={() => toast('Ссылка скопирована')} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
          <Button kind="ghost" onClick={() => window.open(done.url, '_blank')}>Открыть PDF</Button>
          <Button kind="dark" onClick={onClose}>Готово</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Загрузить чертёж" onClose={() => !busy && onClose()}>
      <DropZone file={file} onFile={pick} />
      <Field label="Название" value={title} onChange={e => setTitle(e.target.value)} placeholder="Например: Сборка гребенки 830" />
      <Field label="Номер ДУ / артикул" value={code} onChange={e => setCode(e.target.value)} placeholder="ДУ0014 — необязательно" />
      <Field label="Примечание" rows={2} value={caption} onChange={e => setCaption(e.target.value)} placeholder="Для чего чертёж, что поменялось — необязательно" />
      {busy && <Progress value={pct} />}
      {err && <div style={{ color: C.redDark, fontSize: 13, marginBottom: 8 }}>⚠️ {err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button kind="ghost" onClick={onClose} disabled={busy}>Отмена</Button>
        <Button kind="primary" onClick={submit} disabled={busy || !file}>{busy ? `Загрузка ${pct}%…` : '📤 Загрузить'}</Button>
      </div>
    </Modal>
  );
}

function ReplaceModal({ drawing, onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [pct, setPct] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const pick = f => { const e = checkPdf(f); setErr(e); if (!e) setFile(f); };
  const submit = async () => {
    setBusy(true); setErr('');
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await replaceDrawing(drawing._id, fd, ev => ev.total && setPct(Math.round(ev.loaded * 100 / ev.total)));
      onDone(r.data);
    } catch (e) { setErr(errMsg(e)); setBusy(false); }
  };

  return (
    <Modal title="Заменить файл" onClose={() => !busy && onClose()}>
      <div style={{ fontSize: 14, marginBottom: 4 }}><b>{nameOf(drawing)}</b></div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 14 }}>Сейчас: {drawing.fileName} · {fmtSize(drawing.size)}</div>
      <DropZone file={file} onFile={pick} compact />
      <div style={{ background: C.greenWash, color: C.green, borderRadius: 10, padding: '10px 12px', fontSize: 13, marginBottom: 14 }}>
        🔗 Ссылка останется прежней — у всех, кому её отправили, откроется новый файл.
        Текущий файл сохранится в «Версиях».
      </div>
      {busy && <Progress value={pct} />}
      {err && <div style={{ color: C.redDark, fontSize: 13, marginBottom: 8 }}>⚠️ {err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button kind="ghost" onClick={onClose} disabled={busy}>Отмена</Button>
        <Button kind="primary" onClick={submit} disabled={busy || !file}>{busy ? `Загрузка ${pct}%…` : '🔄 Заменить файл'}</Button>
      </div>
    </Modal>
  );
}

function EditModal({ drawing, onClose, onDone }) {
  const [title, setTitle] = useState(drawing.title || nameOf(drawing));
  const [code, setCode] = useState(drawing.code || '');
  const [caption, setCaption] = useState(drawing.caption || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    setBusy(true); setErr('');
    try { const r = await updateDrawing(drawing._id, { title, code, caption }); onDone(r.data); }
    catch (e) { setErr(errMsg(e)); setBusy(false); }
  };
  return (
    <Modal title="Изменить описание" onClose={() => !busy && onClose()}>
      <Field label="Название" value={title} onChange={e => setTitle(e.target.value)} />
      <Field label="Номер ДУ / артикул" value={code} onChange={e => setCode(e.target.value)} />
      <Field label="Примечание" rows={3} value={caption} onChange={e => setCaption(e.target.value)} />
      {err && <div style={{ color: C.redDark, fontSize: 13, marginBottom: 8 }}>⚠️ {err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button kind="ghost" onClick={onClose} disabled={busy}>Отмена</Button>
        <Button kind="dark" onClick={submit} disabled={busy}>Сохранить</Button>
      </div>
    </Modal>
  );
}

// Удаление — всегда со вторым шагом: ссылка перестанет открываться, вернуть нельзя.
function DeleteModal({ drawing, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const n = drawing.versions?.length || 0;
  const submit = async () => {
    setBusy(true); setErr('');
    try { await deleteDrawingApi(drawing._id); onDone(); }
    catch (e) { setErr(errMsg(e)); setBusy(false); }
  };
  return (
    <Modal title="Удалить чертёж?" onClose={() => !busy && onClose()} width={430}>
      <div style={{ fontSize: 14, marginBottom: 10 }}><b>{nameOf(drawing)}</b></div>
      <div style={{ background: C.redWash, color: C.redDark, borderRadius: 10, padding: '10px 12px', fontSize: 13, marginBottom: 16 }}>
        Ссылка перестанет открываться у всех, кому её отправили. Вернуть файл будет нельзя.
        {n > 0 && <> Вместе с ним удалятся {n} {n === 1 ? 'прежняя версия' : 'прежних версии'}.</>}
      </div>
      {err && <div style={{ color: C.redDark, fontSize: 13, marginBottom: 8 }}>⚠️ {err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button kind="ghost" onClick={onClose} disabled={busy}>Отмена</Button>
        <Button kind="dangerFill" onClick={submit} disabled={busy}>{busy ? 'Удаляю…' : '🗑 Да, удалить'}</Button>
      </div>
    </Modal>
  );
}

// ── Карточка чертежа ─────────────────────────────────────────────────────────

function DrawingRow({ d, showAuthor, onAction, toast }) {
  const [openVersions, setOpenVersions] = useState(false);
  const n = d.versions?.length || 0;
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <a href={d.url} target="_blank" rel="noreferrer" title="Открыть PDF" style={{ width: 44, height: 52, flexShrink: 0,
          borderRadius: 8, background: C.redWash, color: C.red, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 11, textDecoration: 'none', border: '1px solid #f8d3d8' }}>PDF</a>

        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: C.text, wordBreak: 'break-word' }}>{nameOf(d)}</span>
            {d.code && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: C.slateWash, color: '#3d5560' }}>{d.code}</span>}
            {n > 0 && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: '#fff4e0', color: '#9a5b00' }}>версия {n + 1}</span>}
          </div>
          {d.caption && <div style={{ fontSize: 13, color: C.dark || '#4d4d4d', marginTop: 4 }}>{d.caption}</div>}
          <div style={{ fontSize: 12, color: C.muted, marginTop: 5 }}>
            {d.fileName} · {fmtSize(d.size)} · {fmtDate(d.fileUpdatedAt)}
            {showAuthor && <> · {d.lastAuthor || d.author}</>}
            {d.source === 'bot' && <> · через Telegram</>}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button kind="primary" onClick={async () => { if (await copyText(d.url)) toast('Ссылка скопирована'); }}>🔗 Копировать ссылку</Button>
          <Button kind="ghost" onClick={() => window.open(d.url, '_blank')}>Открыть</Button>
          {d.canEdit && <>
            <Button kind="ghost" onClick={() => onAction('replace', d)} title="Новый файл под той же ссылкой">🔄 Заменить</Button>
            <Button kind="ghost" onClick={() => onAction('edit', d)} title="Название, ДУ, примечание">✏️</Button>
            <Button kind="danger" onClick={() => onAction('delete', d)} title="Удалить">🗑</Button>
          </>}
        </div>
      </div>

      {n > 0 && (
        <div style={{ marginTop: 10, borderTop: `1px dashed ${C.line}`, paddingTop: 8 }}>
          <button onClick={() => setOpenVersions(v => !v)} style={{ border: 'none', background: 'none', padding: 0,
            fontSize: 12.5, fontWeight: 700, color: C.slate, cursor: 'pointer', fontFamily: 'inherit' }}>
            {openVersions ? '▾' : '▸'} Прежние версии ({n})
          </button>
          {openVersions && (
            <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
              {d.versions.map((v, i) => (
                <div key={v.publicId} style={{ fontSize: 12.5, color: C.muted, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, color: C.text }}>v{n - i}</span>
                  <a href={v.url} target="_blank" rel="noreferrer" style={{ color: '#3463A3' }}>{v.fileName}</a>
                  <span>{fmtSize(v.size)} · {fmtDate(v.uploadedAt)}{v.author ? ` · ${v.author}` : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Страница ─────────────────────────────────────────────────────────────────

export default function AdminDrawings() {
  const [scope, setScope] = useState('mine');   // mine | authors
  const [author, setAuthor] = useState(null);   // { key, name } — выбранный конструктор
  const [authors, setAuthors] = useState([]);
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({ mine: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);   // { type, drawing }
  const [toastMsg, setToastMsg] = useState('');

  const toast = useCallback(msg => {
    setToastMsg(msg);
    clearTimeout(toast.t); toast.t = setTimeout(() => setToastMsg(''), 2200);
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [r, a] = await Promise.all([
        scope === 'authors' && !author ? null
          : getDrawings(scope === 'authors' ? { scope: 'author', author: author.key, q } : { scope: 'mine', q }),
        getDrawingAuthors(),
      ]);
      if (r) { setItems(r.data.items); setCounts(r.data.counts); } else setItems([]);
      setAuthors(a.data.items);
    } catch (e) { setError(errMsg(e)); }
    finally { setLoading(false); }
  }, [scope, author, q]);

  const showAuthors = scope === 'authors' && !author;
  const shownAuthors = showAuthors && q.trim()
    ? authors.filter(a => a.name.toLowerCase().includes(q.trim().toLowerCase()))
    : authors;
  const openAuthor = a => { setAuthor(a); setQ(''); };
  const backToAuthors = () => { setAuthor(null); setQ(''); };

  useEffect(() => { const t = setTimeout(load, q ? 250 : 0); return () => clearTimeout(t); }, [load, q]);

  const close = () => setModal(null);
  const afterChange = msg => { close(); if (msg) toast(msg); load(); };

  const tab = (key, label, n) => (
    <button key={key} onClick={() => { setScope(key); setAuthor(null); setQ(''); }} style={{
      padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
      fontSize: 13.5, fontWeight: 700, background: scope === key ? '#fff' : 'transparent',
      color: scope === key ? C.text : C.muted, boxShadow: scope === key ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
    }}>{label} <span style={{ color: C.muted, fontWeight: 600 }}>{n}</span></button>
  );

  return (
    <div style={{ maxWidth: 1100 }}>
      <div className="admin-page-header" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="admin-page-title">Чертежи</h1>
          <p style={{ color: 'var(--slate)', fontSize: 13, margin: '2px 0 0' }}>
            PDF с постоянной ссылкой — заменили файл, ссылка осталась той же
          </p>
        </div>
        <Button kind="primary" onClick={() => setModal({ type: 'upload' })} style={{ padding: '10px 18px', fontSize: 14 }}>
          📤 Загрузить чертёж
        </Button>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'inline-flex', background: '#f0f0ee', borderRadius: 10, padding: 3, gap: 3 }}>
          {tab('mine', 'Мои чертежи', counts.mine)}
          {tab('authors', 'Конструкторы', authors.length)}
        </div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={showAuthors ? '🔍 Поиск конструктора…' : '🔍 Поиск: название, ДУ…'}
          style={{ flex: '1 1 220px', maxWidth: 360, fontSize: 14, fontFamily: 'inherit', border: `1px solid ${C.line}`,
            borderRadius: 10, padding: '9px 12px', outline: 'none', background: '#fff' }} />
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: '#eef4fb',
        border: '1px solid #d7e5f5', borderRadius: 12, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#2b4d73' }}>
        <span>📱 С телефона — через Telegram-бота: конструктор регистрируется по ссылке и присылает PDF. Загруженное там видно здесь.</span>
        <button onClick={async () => { if (await copyText(BOT_LINK)) toast('Ссылка на регистрацию скопирована'); }}
          style={{ marginLeft: 'auto', border: '1px solid #b9d0ea', background: '#fff', color: '#2b4d73', borderRadius: 8,
            padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          Скопировать ссылку для конструктора
        </button>
      </div>

      {error && <div style={{ color: C.redDark, marginBottom: 12 }}>⚠️ {error}</div>}

      {scope === 'authors' && author && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <Button kind="ghost" onClick={backToAuthors}>← Все конструкторы</Button>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{author.name}</div>
          <div style={{ fontSize: 13, color: C.muted }}>{author.count} {plural(author.count)}</div>
        </div>
      )}

      {showAuthors ? (
        loading && !authors.length ? (
          <div style={{ color: C.muted, padding: 30, textAlign: 'center' }}>Загрузка…</div>
        ) : !shownAuthors.length ? (
          <div style={{ background: '#fff', border: `1px dashed ${C.line}`, borderRadius: 14, padding: '40px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 34 }}>👷</div>
            <div style={{ fontWeight: 800, fontSize: 16, marginTop: 6 }}>
              {q ? 'Никого не нашлось' : 'У других конструкторов пока нет чертежей'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
            {shownAuthors.map(a => (
              <button key={a.key} onClick={() => openAuthor(a)} style={{ textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: '14px 16px',
                display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ width: 42, height: 42, borderRadius: '50%', background: C.slateWash, color: '#3d5560', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16 }}>
                  {(a.name || '?').trim()[0]?.toUpperCase()}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{a.count ? `${a.count} ${plural(a.count)} · ${fmtDate(a.lastAt).split(',')[0]}` : 'пока нет чертежей'}</div>
                </div>
                <span style={{ color: C.muted, fontSize: 18 }}>›</span>
              </button>
            ))}
          </div>
        )
      ) : loading && !items.length ? (
        <div style={{ color: C.muted, padding: 30, textAlign: 'center' }}>Загрузка…</div>
      ) : !items.length ? (
        <div style={{ background: '#fff', border: `1px dashed ${C.line}`, borderRadius: 14, padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 34 }}>📐</div>
          <div style={{ fontWeight: 800, fontSize: 16, marginTop: 6 }}>
            {q ? 'Ничего не нашлось' : scope === 'mine' ? 'У вас пока нет чертежей' : 'Чертежей нет'}
          </div>
          {!q && scope === 'mine' && <div style={{ color: C.muted, fontSize: 13, margin: '6px 0 14px' }}>Загрузите PDF — получите постоянную ссылку на него.</div>}
          {!q && scope === 'mine' && <Button kind="primary" onClick={() => setModal({ type: 'upload' })}>📤 Загрузить чертёж</Button>}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10, opacity: loading ? .6 : 1, transition: 'opacity .15s' }}>
          {items.map(d => (
            <DrawingRow key={d._id} d={d} showAuthor={!d.mine} toast={toast}
              onAction={(type, drawing) => setModal({ type, drawing })} />
          ))}
        </div>
      )}

      {modal?.type === 'upload'  && <UploadModal onClose={() => { close(); load(); }} onDone={() => {}} toast={toast} />}
      {modal?.type === 'replace' && <ReplaceModal drawing={modal.drawing} onClose={close} onDone={() => afterChange('Файл заменён — ссылка прежняя')} />}
      {modal?.type === 'edit'    && <EditModal drawing={modal.drawing} onClose={close} onDone={() => afterChange('Сохранено')} />}
      {modal?.type === 'delete'  && <DeleteModal drawing={modal.drawing} onClose={close} onDone={() => afterChange('Чертёж удалён')} />}

      {toastMsg && createPortal(
        <div style={{ position: 'fixed', left: '50%', bottom: 28, transform: 'translateX(-50%)', zIndex: 10000,
          background: '#1c1c1c', color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 14, fontWeight: 600,
          fontFamily: 'var(--admin-font)', boxShadow: '0 8px 24px rgba(0,0,0,.25)' }}>✓ {toastMsg}</div>,
        document.body,
      )}
    </div>
  );
}
