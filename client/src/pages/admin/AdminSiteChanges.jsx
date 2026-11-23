// «Правки сайта» — чат с Claude внутри сайта: дизайнер описывает словами, что поменять во внешнем виде сайта,
// Claude делает правку в отдельной ветке (GitHub Actions), собирается
// предпросмотр, владелец принимает — и только тогда правка уходит на сайт.
// Сервер: server/routes/siteChanges.js, воркфлоу: .github/workflows/site-change.yml.
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import {
  getSiteChanges, getSiteChange, createSiteChange, commentSiteChange,
  retrySiteChange, approveSiteChange, rejectSiteChange, saveMyClaude, removeMyClaude, getSiteChangeHistory,
} from '../../api/index';

const C = {
  red: '#e10523', redDark: '#b8001b', line: '#ecebe7', text: '#1c1c1c', muted: '#6b7684',
  green: '#2d7a3a', greenWash: '#e6f4ea', amber: '#9a6700', amberWash: '#fff4d6',
  slateWash: '#eef2f4', redWash: '#fdecee',
};

const STATUS = {
  queued:    { label: 'В очереди',          color: C.muted,  bg: C.slateWash },
  working:   { label: 'Claude делает…',     color: C.amber,  bg: C.amberWash },
  question:  { label: 'Ждёт вашего ответа', color: '#7c3aed', bg: '#f3e8ff' },
  ready:     { label: 'На утверждении',     color: '#1d4ed8', bg: '#e8efff' },
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

// «Мой Claude»: личный токен подписки. Правки, которые человек запускает, делает его Claude.
// Установка Claude Code: Mac/Linux — Терминал, Windows — PowerShell (code.claude.com/docs/en/setup)
const INSTALL = {
  mac: { cmd: 'curl -fsSL https://claude.ai/install.sh | bash', token: 'claude setup-token', open: <>На Mac откройте <b>Терминал</b> (⌘ + Пробел → «Терминал» → Enter).</>, term: 'Терминале' },
  win: { cmd: 'irm https://claude.ai/install.ps1 | iex', token: '& "$env:USERPROFILE\\.local\\bin\\claude.exe" setup-token', open: <>На Windows откройте <b>PowerShell</b>: клавиша ⊞ Win → наберите «PowerShell» → Enter.</>, term: 'PowerShell' },
};
const detectOs = () => /Win/i.test(navigator.userAgent) ? 'win' : 'mac';

function CopyLine({ text }) {
  const [ok, setOk] = useState(false);
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#1c1c1c', color: '#fff', borderRadius: 8, padding: '8px 10px', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13, margin: '6px 0' }}>
      <span style={{ flex: 1, overflowX: 'auto', whiteSpace: 'nowrap' }}>{text}</span>
      <button onClick={() => navigator.clipboard?.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); })}
        style={{ border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: '#fff', color: '#1c1c1c', fontFamily: 'inherit' }}>{ok ? '✓' : 'Копировать'}</button>
    </div>
  );
}

function MyClaude({ me, onClose, onChanged }) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [os, setOs] = useState(detectOs);
  const I = INSTALL[os];
  const save = async () => {
    setBusy(true); setErr('');
    try { await saveMyClaude(token.replace(/\s+/g, '')); setToken(''); onChanged(); onClose(); }
    catch (e) { setErr(errMsg(e)); }
    setBusy(false);
  };
  const remove = async () => {
    if (!window.confirm('Отключить ваш Claude? Запускать правки будет нельзя, пока не подключите снова.')) return;
    await removeMyClaude().catch(() => {}); onChanged(); onClose();
  };
  const step = { fontSize: 14, lineHeight: 1.55, marginBottom: 12 };
  return (
    <Modal title="Мой Claude" onClose={onClose}>
      {me?.connected && (
        <div style={{ background: me.lastError ? C.redWash : C.greenWash, color: me.lastError ? C.redDark : C.green, borderRadius: 12, padding: '10px 14px', marginBottom: 16, fontSize: 14 }}>
          {me.lastError ? `⚠️ ${me.lastError}` : '✅ Подключён'} · токен …{me.last4} · действует до {new Date(me.expiresAt).toLocaleDateString('ru')}
        </div>
      )}
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 14, lineHeight: 1.5 }}>
        Правки, которые вы отправляете, делает <b>ваш</b> Claude — по вашей подписке. Подключить нужно один раз (токен действует год).
        Токен хранится на сайте зашифрованным, его никто не видит.
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, background: C.slateWash, borderRadius: 10, padding: 3, width: 'fit-content' }}>
        {[['mac', ' Mac'], ['win', '⊞ Windows']].map(([k, l]) => (
          <button key={k} onClick={() => setOs(k)} style={{ border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', background: os === k ? '#fff' : 'transparent', boxShadow: os === k ? '0 1px 3px rgba(0,0,0,.12)' : 'none', color: C.text }}>{l}</button>
        ))}
      </div>
      <div style={step}><b>1.</b> {I.open} Если Claude Code ещё не установлен — вставьте эту команду и нажмите Enter:
        <CopyLine text={I.cmd} />
        {os === 'win' && <span style={{ fontSize: 12, color: C.muted }}>Дождитесь «Claude Code successfully installed!». Предупреждение про PATH можно не читать — следующая команда запускает Claude по полному пути.</span>}</div>
      <div style={step}><b>2.</b> Вставьте эту команду и нажмите Enter — откроется браузер, войдите в свой аккаунт Claude и нажмите «Authorize»:
        <CopyLine text={I.token} /></div>
      <div style={step}><b>3.</b> В {I.term} появится длинный токен, он начинается с <code>sk-ant-oat01-</code>. Выделите его целиком{os === 'win' ? ' (в PowerShell выделенное копируется правым кликом или Ctrl+C)' : ''} и вставьте сюда:</div>
      <textarea style={{ ...inputStyle, fontFamily: 'ui-monospace, Menlo, monospace', minHeight: 70, resize: 'vertical', wordBreak: 'break-all' }} placeholder="sk-ant-oat01-…" value={token} onChange={e => setToken(e.target.value)} autoComplete="off" spellCheck={false} />
      {err && <div style={{ color: C.redDark, fontSize: 13, marginTop: 10 }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        <div>{me?.connected && <Button kind="danger" onClick={remove}>Отключить</Button>}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={onClose}>Закрыть</Button>
          <Button kind="primary" disabled={busy || !token.trim()} onClick={save}>{busy ? 'Сохраняю…' : me?.connected ? 'Заменить токен' : 'Подключить'}</Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Чат ──────────────────────────────────────────────────────────────────────
// Раздел устроен как чат с Claude: слева список правок (каждая — свой чат),
// справа переписка, внизу одно поле. Файлы — перетащить в поле, вставить ⌘V
// или скрепкой. Первое сообщение создаёт правку, следующие — уточнения к ней.

const isPdf = u => /\.pdf(\?|$)/i.test(u);
const MAX_FILES = 10, MAX_MB = 15;

function useFiles() {
  const [files, setFiles] = useState([]);
  const [err, setErr] = useState('');
  const add = list => {
    const ok = [...list].filter(f => /^image\//.test(f.type) || f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
    if (ok.length < list.length) setErr('Можно прикладывать картинки и PDF');
    const big = ok.find(f => f.size > MAX_MB * 1024 * 1024);
    if (big) { setErr(`«${big.name}» больше ${MAX_MB} МБ`); return; }
    setFiles(prev => [...prev, ...ok.map(f => ({ f, url: /^image\//.test(f.type) ? URL.createObjectURL(f) : null }))].slice(0, MAX_FILES));
  };
  return { files, add, remove: i => setFiles(p => p.filter((_, j) => j !== i)), clear: () => setFiles([]), err, setErr };
}

function Composer({ disabled, placeholder, onSend, hint }) {
  const [text, setText] = useState('');
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const fl = useFiles();
  const inputRef = useRef(null);
  const taRef = useRef(null);

  useEffect(() => {   // поле растёт вместе с текстом, как в Claude
    const t = taRef.current; if (!t) return;
    t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 240) + 'px';
  }, [text]);

  const send = async () => {
    if (!text.trim() || busy || disabled) return;
    setBusy(true); fl.setErr('');
    try { await onSend(text.trim(), fl.files.map(x => x.f)); setText(''); fl.clear(); }
    catch (e) { fl.setErr(errMsg(e)); }
    setBusy(false);
  };

  return (
    <div
      onDragOver={e => { e.preventDefault(); if (!disabled) setDrag(true); }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDrag(false); }}
      onDrop={e => { e.preventDefault(); setDrag(false); if (!disabled) fl.add(e.dataTransfer.files); }}
      style={{
        border: `1.5px ${drag ? 'dashed' : 'solid'} ${drag ? C.red : C.line}`, borderRadius: 18, background: drag ? C.redWash : '#fff',
        padding: '10px 12px', boxShadow: '0 2px 12px rgba(0,0,0,.05)', opacity: disabled ? .6 : 1, position: 'relative',
      }}>
      {drag && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.red, fontWeight: 600, pointerEvents: 'none' }}>Отпустите, чтобы прикрепить</div>}
      {!!fl.files.length && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          {fl.files.map((x, i) => (
            <div key={i} style={{ position: 'relative' }}>
              {x.url
                ? <img src={x.url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10, border: `1px solid ${C.line}` }} />
                : <div style={{ width: 64, height: 64, borderRadius: 10, border: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: C.muted, padding: 4, boxSizing: 'border-box', textAlign: 'center', overflow: 'hidden' }}>📄<span style={{ wordBreak: 'break-all', lineHeight: 1.1 }}>{x.f.name.slice(0, 18)}</span></div>}
              <button onClick={() => fl.remove(i)} style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, border: 'none', background: '#1c1c1c', color: '#fff', cursor: 'pointer', fontSize: 12, lineHeight: 1 }}>×</button>
            </div>
          ))}
        </div>
      )}
      <textarea ref={taRef} rows={1} value={text} disabled={disabled}
        onChange={e => setText(e.target.value)}
        onPaste={e => { const fs = [...(e.clipboardData?.files || [])]; if (fs.length) { e.preventDefault(); fl.add(fs); } }}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
        placeholder={placeholder}
        style={{ width: '100%', border: 'none', outline: 'none', resize: 'none', fontSize: 15, lineHeight: 1.5, fontFamily: 'inherit', background: 'transparent', boxSizing: 'border-box', maxHeight: 240 }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
        <button onClick={() => inputRef.current?.click()} disabled={disabled} title="Прикрепить картинку или PDF"
          style={{ border: `1px solid ${C.line}`, background: '#fff', borderRadius: 10, width: 34, height: 34, cursor: 'pointer', fontSize: 16 }}>📎</button>
        <input ref={inputRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={e => { fl.add(e.target.files); e.target.value = ''; }} />
        <span style={{ flex: 1, fontSize: 12, color: fl.err ? C.redDark : C.muted }}>{fl.err || hint}</span>
        <button onClick={send} disabled={disabled || busy || !text.trim()} title="Отправить (Enter)"
          style={{ border: 'none', background: !text.trim() || disabled ? '#d9d6d0' : C.red, color: '#fff', borderRadius: 10, width: 34, height: 34, cursor: 'pointer', fontSize: 17, fontWeight: 700 }}>
          {busy ? '…' : '↑'}
        </button>
      </div>
    </div>
  );
}

function Attachments({ urls }) {
  if (!urls?.length) return null;
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
      {urls.map(u => isPdf(u)
        ? <a key={u} href={u} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${C.line}`, borderRadius: 10, padding: '8px 10px', fontSize: 13, color: C.text, textDecoration: 'none', background: '#fff' }}>📄 PDF</a>
        : <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 12, border: `1px solid ${C.line}` }} /></a>)}
    </div>
  );
}

// Чат ещё чего-то ждёт: Claude работает, предпросмотр собирается или сайт пересобирается
const waiting = d => ACTIVE.includes(d.status) || (d.status === 'ready' && !d.previewReadyAt) || (d.status === 'merged' && !d.deployedAt);

const linkify = text => String(text).split(/(https?:\/\/\S+)/g).map((part, i) =>
  /^https?:\/\//.test(part) ? <a key={i} href={part} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>открыть</a> : part);

function Bubble({ m }) {
  if (m.kind === 'status') {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '6px 0 6px 6px', fontSize: 13, color: '#4b5563', lineHeight: 1.5 }}>
        <span style={{ color: C.muted, fontSize: 11, whiteSpace: 'nowrap', paddingTop: 2 }}>{fmtDate(m.at).split(', ')[1] || fmtDate(m.at)}</span>
        <span>{linkify(m.text)}</span>
      </div>
    );
  }
  if (m.kind === 'decision') {
    return <div style={{ textAlign: 'center', fontSize: 13, color: C.muted, margin: '14px 0' }}>{m.text} · {m.authorName} · {fmtDate(m.at)}</div>;
  }
  const bot = m.kind === 'bot';
  return (
    <div style={{ display: 'flex', justifyContent: bot ? 'flex-start' : 'flex-end', margin: '10px 0' }}>
      <div style={{ maxWidth: '82%' }}>
        <div style={{ fontSize: 11, color: C.muted, margin: bot ? '0 0 3px 4px' : '0 4px 3px 0', textAlign: bot ? 'left' : 'right' }}>
          {bot ? '🤖 Claude' : m.authorName} · {fmtDate(m.at)}{m.pending ? ' · ⏳ в очереди' : ''}
        </div>
        <div style={{
          background: bot ? '#fff' : '#f1efe9', border: bot ? `1px solid ${C.line}` : 'none',
          borderRadius: bot ? '4px 16px 16px 16px' : '16px 4px 16px 16px', padding: '10px 14px',
          fontSize: 15, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {m.text}
          <Attachments urls={m.images} />
        </div>
      </div>
    </div>
  );
}

// Изменения каталога, которые предложил Claude: что будет добавлено/изменено, было → стало
function OpsCard({ ops, title = 'Изменения в каталоге' }) {
  const [open, setOpen] = useState(null);
  if (!ops?.length) return null;
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '10px 12px', margin: '10px 0' }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>🗂 {title}</div>
      {ops.map((o, i) => (
        <div key={i} style={{ borderTop: i ? `1px solid ${C.line}` : 'none', padding: '6px 0' }}>
          <div onClick={() => setOpen(open === i ? null : i)} style={{ display: 'flex', gap: 8, alignItems: 'baseline', cursor: o.changes?.length ? 'pointer' : 'default' }}>
            <span style={{ flex: 1, fontSize: 14, color: o.error || o.applyError ? C.redDark : C.text }}>
              {o.applied ? '✅ ' : ''}{o.label}
            </span>
            {!!o.changes?.length && <span style={{ fontSize: 12, color: C.muted }}>{open === i ? 'скрыть' : `${o.changes.length} пол${o.changes.length === 1 ? 'е' : 'я'}`}</span>}
          </div>
          {o.error && <div style={{ fontSize: 12, color: C.redDark }}>Не будет внесено: {o.error}</div>}
          {o.warn && <div style={{ fontSize: 12, color: C.amber }}>⚠️ {o.warn}</div>}
          {o.applyError && <div style={{ fontSize: 12, color: C.redDark }}>Не внесено: {o.applyError}</div>}
          {o.note && <div style={{ fontSize: 12, color: C.muted }}>{o.note}</div>}
          {open === i && (
            <div style={{ marginTop: 6, fontSize: 13, display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '3px 12px' }}>
              {o.changes.map((c, j) => [
                <span key={j + 'f'} style={{ color: C.muted }}>{c.field}</span>,
                <span key={j + 'v'} style={{ wordBreak: 'break-word' }}>{c.from !== undefined && c.from !== null ? <><s style={{ color: C.muted }}>{c.from}</s> → </> : ''}<b style={{ fontWeight: 600 }}>{c.to}</b></span>,
              ])}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Карточка состояния под перепиской: что сейчас происходит и что можно сделать
function StatusCard({ d, isOwner, busy, act }) {
  const box = (bg, children) => <div style={{ background: bg, borderRadius: 14, padding: '12px 14px', margin: '12px 0', fontSize: 14, lineHeight: 1.55 }}>{children}</div>;
  const reject = () => {
    const reason = isOwner ? window.prompt('Причина (увидит дизайнер). Можно оставить пустым:', '') : '';
    if (reason === null) return;
    if (!isOwner && !window.confirm('Отменить эту правку?')) return;
    act(() => rejectSiteChange(d._id, reason));
  };
  const closeBtn = !['merging', 'merged', 'rejected', 'cancelled'].includes(d.status) &&
    <Button kind="danger" disabled={busy} onClick={reject}>{isOwner ? 'Отклонить' : 'Отменить правку'}</Button>;

  if (['queued', 'working'].includes(d.status)) {
    return box(C.amberWash, <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="sc-dots" style={{ color: C.amber, fontWeight: 700 }}>●●●</span>
        <span>{d.stuck ? '⚠️ Похоже, запуск завис.' : d.status === 'queued' ? 'Claude скоро возьмётся за правку…' : 'Claude делает правку — обычно 5–15 минут. Можно закрыть страницу, придёт уведомление в Telegram.'}</span>
      </div>
      {d.stuck && <div style={{ marginTop: 8 }}><Button disabled={busy} onClick={() => act(() => retrySiteChange(d._id))}>Повторить</Button></div>}
    </>);
  }
  if (d.status === 'question') {
    return box('#f3e8ff', <>
      <div style={{ fontWeight: 700 }}>❓ Claude ждёт ответа</div>
      <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>Ответьте ниже — после этого Claude возьмётся за правку. Код пока не тронут.</div>
      <div style={{ marginTop: 10 }}>{closeBtn}</div>
    </>);
  }
  if (d.status === 'ready') {
    const who = d.approver || 'владелец сайта';
    return box('#e8efff', <>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
        ⏳ {isOwner ? 'Ждёт вашего утверждения' : `На утверждении — должен утвердить ${who}`}
      </div>
      {!isOwner && <div style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>Пока {who} не утвердит, на сайте ничего не изменится.</div>}
      {d.previewUrl && (d.previewReadyAt
        ? <div>👀 <a href={d.previewUrl} target="_blank" rel="noreferrer" style={{ fontWeight: 700 }}>Открыть предпросмотр</a>
            <span style={{ fontSize: 12, color: C.muted }}> — данные там настоящие, только смотрите</span></div>
        : <div style={{ color: C.muted }}><span className="sc-dots">●●●</span> Предпросмотр собирается (3–7 минут)… <a href={d.previewUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C.muted }}>попробовать открыть</a></div>)}
      {(d.pdfs || []).map((p, i) => <div key={i}>📄 {p.url ? <a href={p.url} target="_blank" rel="noreferrer" style={{ fontWeight: 700 }}>{p.title} — пробный PDF</a> : <>{p.title}: не собрался <span style={{ fontSize: 12, color: C.muted }}>({p.error})</span></>}</div>)}
      <OpsCard ops={d.dataOps} title="Изменения в каталоге — внесутся только после утверждения" />
      {!!d.reverted?.length && <div style={{ fontSize: 12, color: C.amber, marginTop: 6 }}>Отменены изменения в файлах, которые трогать нельзя: {d.reverted.join(', ')}</div>}
      <div style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>Что-то не так — напишите ниже, Claude доработает эту же правку.</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {isOwner && <Button kind="green" disabled={busy} onClick={() => window.confirm('Выложить правку на сайт?') && act(() => approveSiteChange(d._id))}>✅ Принять и выложить</Button>}
        {closeBtn}
      </div>
    </>);
  }
  if (d.status === 'failed') {
    return box(C.redWash, <>
      <div style={{ color: C.redDark }}>❌ {d.error || 'Не получилось'}</div>
      <OpsCard ops={d.dataOps} />
      <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Напишите уточнение ниже или повторите.</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <Button disabled={busy} onClick={() => act(() => retrySiteChange(d._id))}>Повторить</Button>
        {closeBtn}
      </div>
    </>);
  }
  if (d.status === 'merging') return box(C.amberWash, <><span className="sc-dots" style={{ color: C.amber, fontWeight: 700 }}>●●●</span> Утверждено, выкладываю правку…{d.stuck && <div style={{ marginTop: 8 }}><Button disabled={busy} onClick={() => act(() => retrySiteChange(d._id))}>Повторить</Button></div>}</>);
  if (d.status === 'merged' && !d.deployedAt) return box(C.amberWash, <><span className="sc-dots" style={{ color: C.amber, fontWeight: 700 }}>●●●</span> Утверждено. Сайт пересобирается — обычно 5–10 минут. Напишу здесь, когда можно смотреть.</>);
  if (d.status === 'merged') return box(C.greenWash, <><span style={{ color: C.green }}>🎉 Изменения на сайте — обновите страницу (⌘R), чтобы увидеть.</span> <ViewLink path={d.viewPath} /><div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Нужно что-то ещё — просто напишите ниже, чат продолжится.</div></>);
  return box(C.slateWash, <span style={{ color: C.muted }}>{d.status === 'rejected' ? '🚫 Отклонено' : '↩️ Отменено'}. Можно написать ниже — Claude сделает новую правку в этом чате.</span>);
}

function ChatView({ id, isOwner, me, onChanged, onCreated, onOpenClaude }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  const load = useCallback(() => {
    if (!id) { setD(null); return; }
    getSiteChange(id).then(r => { setD(r.data); setErr(''); }).catch(e => setErr(errMsg(e)));
  }, [id]);
  useEffect(() => { setD(null); load(); }, [load]);
  useEffect(() => {
    if (!d || !waiting(d)) return;
    const t = setInterval(load, 12_000);
    return () => clearInterval(t);
  }, [d?.status, load]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [d?.messages?.length, d?.status, d?.previewReadyAt, d?.deployedAt]);

  const act = async fn => {
    setBusy(true); setErr('');
    try { const r = await fn(); setD(r.data); onChanged(); } catch (e) { setErr(errMsg(e)); }
    setBusy(false);
  };
  const form = (text, files) => { const f = new FormData(); f.append('text', text); files.forEach(x => f.append('images', x)); return f; };

  const noClaude = !me?.connected;
  const canWrite = !id || !!d;   // чат не закрывается: пока Claude работает — сообщение встаёт в очередь
  const hint = noClaude ? '' : 'Enter — отправить, Shift+Enter — новая строка. Файлы можно перетащить или вставить ⌘V';

  const sendNew = async (text, files) => { const r = await createSiteChange(form(text, files)); onChanged(); onCreated(r.data._id); };
  const sendMore = async (text, files) => { const r = await commentSiteChange(id, form(text, files)); setD(r.data); onChanged(); };

  const placeholder = noClaude ? 'Сначала подключите свой Claude' : !id ? 'Опишите, что поменять на сайте или в PDF-каталоге…'
    : ACTIVE.includes(d?.status) ? 'Можно писать — Claude возьмёт сообщение, как только закончит текущую работу…'
    : ['merged', 'rejected', 'cancelled'].includes(d?.status) ? 'Написать ещё — Claude сделает новую правку в этом чате…'
    : d?.status === 'question' ? 'Ответ для Claude…' : 'Уточнение для Claude…';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 4px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          {!id && (
            <div style={{ textAlign: 'center', padding: '12vh 16px 24px' }}>
              <div style={{ fontSize: 40 }}>🎨</div>
              <div style={{ fontSize: 24, fontWeight: 700, margin: '8px 0' }}>Что поменяем?</div>
              <div style={{ color: C.muted, fontSize: 14, lineHeight: 1.6, maxWidth: 520, margin: '0 auto' }}>
                Опишите своими словами, что изменить во внешнем виде сайта или в PDF-каталоге. Прикрепите скриншоты — «вот здесь так, а надо как тут».
                Claude сделает правку, вы проверите её на предпросмотре, владелец примет — и она появится на сайте.
              </div>
              {noClaude && <div style={{ marginTop: 18 }}><Button kind="primary" onClick={onOpenClaude}>🔌 Подключить мой Claude</Button></div>}
            </div>
          )}
          {id && !d && <div style={{ color: C.muted, padding: 24 }}>{err || 'Загрузка…'}</div>}
          {d && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '6px 4px 4px' }}>
                <div style={{ fontWeight: 700, fontSize: 17, flex: 1, minWidth: 0 }}>№{d.number} · {d.title}</div>
                <Badge status={d.status} />
              </div>
              <div style={{ fontSize: 12, color: C.muted, padding: '0 4px 6px' }}>
                {d.authorName}{d.runByName ? ` · делает Claude: ${d.runByName}` : ''}
                {isOwner && d.runUrl && <> · <a href={d.runUrl} target="_blank" rel="noreferrer" style={{ color: C.muted }}>журнал</a></>}
                {isOwner && d.prUrl && <> · <a href={d.prUrl} target="_blank" rel="noreferrer" style={{ color: C.muted }}>код</a></>}
              </div>
              {d.messages.map((m, i) => <Bubble key={i} m={m} />)}
              <StatusCard d={d} isOwner={isOwner} busy={busy} act={act} />
            </>
          )}
          {err && d && <div style={{ color: C.redDark, fontSize: 13, padding: 4 }}>{err}</div>}
          <div ref={endRef} />
        </div>
      </div>
      <div style={{ padding: '8px 4px 4px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <Composer disabled={noClaude || !canWrite} placeholder={placeholder} hint={hint} onSend={id ? sendMore : sendNew} />
        </div>
      </div>
    </div>
  );
}

// ── История: что выложено, по дизайнерам ────────────────────────────────────

const SITE = window.location.origin;
function ViewLink({ path }) {
  if (!path) return null;
  if (path.startsWith('/')) return <a href={SITE + path} target="_blank" rel="noreferrer" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Посмотреть на сайте →</a>;
  return <span style={{ color: C.muted, fontSize: 13 }}>📄 {path}</span>;
}

function HistoryView({ isOwner, onOpen }) {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState('');
  const [who, setWho] = useState('all');
  const [openId, setOpenId] = useState(null);
  useEffect(() => { getSiteChangeHistory().then(r => setItems(r.data)).catch(e => setErr(errMsg(e))); }, []);

  if (err) return <div style={{ color: C.redDark, padding: 24 }}>{err}</div>;
  if (!items) return <div style={{ color: C.muted, padding: 24 }}>Загрузка…</div>;
  const people = [...new Map(items.map(x => [String(x.author), x.authorName])).entries()];
  const shown = items.filter(x => who === 'all' || String(x.author) === who);
  const groups = [...new Map(shown.map(x => [String(x.author), { name: x.authorName, list: [] }])).entries()];
  shown.forEach(x => groups.find(([k]) => k === String(x.author))[1].list.push(x));
  const fmtDay = d => d ? new Date(d).toLocaleString('ru', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '4px 4px 24px' }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: 22 }}>История изменений</h2>
          <span style={{ color: C.muted, fontSize: 13 }}>{items.length} {items.length === 1 ? 'правка' : 'правок'} выложено на сайт</span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0 18px' }}>
          {[['all', 'Все дизайнеры'], ...people].map(([k, n]) => (
            <button key={k} onClick={() => setWho(k)} style={{ border: `1px solid ${who === k ? '#1c1c1c' : C.line}`, background: who === k ? '#1c1c1c' : '#fff', color: who === k ? '#fff' : C.text, borderRadius: 999, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{n}</button>
          ))}
        </div>
        {!shown.length && <div style={{ color: C.muted }}>Пока ничего не выложено.</div>}
        {groups.map(([k, g]) => (
          <div key={k} style={{ marginBottom: 26 }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 10 }}>👤 {g.name} <span style={{ color: C.muted, fontWeight: 500, fontSize: 13 }}>· {g.list.length}</span></div>
            <div style={{ borderLeft: `2px solid ${C.line}`, marginLeft: 8, paddingLeft: 18 }}>
              {g.list.map(x => {
                const open = openId === x.key;
                return (
                  <div key={x.key} style={{ position: 'relative', marginBottom: 14 }}>
                    <span style={{ position: 'absolute', left: -25, top: 16, width: 12, height: 12, borderRadius: 6, background: x.deployed ? C.green : C.amber, border: '2px solid #f7f6f3' }} />
                    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, color: C.muted }}>{fmtDay(x.at)}{x.approvedBy ? ` · утвердил ${x.approvedBy}` : ''}</span>
                        <span style={{ marginLeft: 'auto' }}><ViewLink path={x.viewPath} /></span>
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 15, margin: '4px 0' }}>№{x.number} · {x.title}</div>
                      {x.summary && (
                        <div style={{ fontSize: 14, lineHeight: 1.55, color: '#374151', whiteSpace: 'pre-wrap', ...(open ? {} : { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }) }}>{x.summary}</div>
                      )}
                      <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 13, flexWrap: 'wrap' }}>
                        {x.summary && <button onClick={() => setOpenId(open ? null : x.key)} style={{ border: 'none', background: 'none', padding: 0, color: C.muted, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>{open ? 'Свернуть' : 'Подробнее'}</button>}
                        <button onClick={() => onOpen(x._id)} style={{ border: 'none', background: 'none', padding: 0, color: C.muted, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>Открыть чат</button>
                        {isOwner && x.prUrl && <a href={x.prUrl} target="_blank" rel="noreferrer" style={{ color: C.muted }}>Изменения в коде</a>}
                      </div>
                      {!!x.ops?.length && <div style={{ fontSize: 13, marginTop: 6, color: '#374151' }}>{x.ops.map((l, i) => <div key={i}>{l}</div>)}</div>}
                      {open && isOwner && !!x.files.length && (
                        <div style={{ marginTop: 8, fontSize: 12, color: C.muted, fontFamily: 'ui-monospace, Menlo, monospace' }}>{x.files.join(' · ')}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminSiteChanges() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [claudeOpen, setClaudeOpen] = useState(false);
  const [filter, setFilter] = useState('open');
  const openId = params.get('id');
  const [narrow, setNarrow] = useState(() => window.innerWidth < 860);
  useEffect(() => { const f = () => setNarrow(window.innerWidth < 860); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);

  const load = useCallback(() => getSiteChanges().then(r => setData(r.data)).catch(e => setErr(errMsg(e))), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!data?.items?.some(waiting)) return;
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [data, load]);

  const setOpen = id => setParams(id ? { id } : {});
  const items = (data?.items || []).filter(x =>
    filter === 'all' ? true : filter === 'open' ? !['merged', 'rejected', 'cancelled'].includes(x.status) : x.status === 'merged');
  const me = data?.me;
  const isOwner = !!data?.isOwner;
  // На телефоне по очереди: список → чат или история
  const showList = !narrow || (!openId && filter !== 'merged');
  const showChat = !narrow || !!openId || params.get('new') === '1' || filter === 'merged';

  return (
    <div className="admin-page" style={{ height: 'calc(100vh - 40px)', display: 'flex', flexDirection: 'column', maxWidth: 1280 }}>
      <style>{`@keyframes scPulse{0%,100%{opacity:.3}50%{opacity:1}} .sc-dots{animation:scPulse 1.4s ease-in-out infinite;letter-spacing:2px}`}</style>
      <div style={{ display: 'flex', flex: 1, minHeight: 0, gap: 16 }}>
        {showList && (
          <aside style={{ width: narrow ? '100%' : 290, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: narrow ? 'none' : `1px solid ${C.line}`, paddingRight: narrow ? 0 : 14, minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <h1 style={{ margin: 0, fontSize: 20 }}>🎨 Правки сайта</h1>
              <button onClick={() => setClaudeOpen(true)} title="Мой Claude" style={{ border: `1px solid ${C.line}`, background: '#fff', borderRadius: 9, padding: '5px 9px', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                {me?.connected ? (me.lastError ? '⚠️ Claude' : '✅ Claude') : '🔌 Claude'}
              </button>
            </div>
            <Button kind="primary" style={{ width: '100%', marginBottom: 10, justifyContent: 'center' }} onClick={() => { if (filter === 'merged') setFilter('open'); setParams(narrow ? { new: '1' } : {}); }}>＋ Новый чат</Button>
            {me?.lastError && <div onClick={() => setClaudeOpen(true)} style={{ background: C.redWash, color: C.redDark, borderRadius: 10, padding: '8px 10px', marginBottom: 10, fontSize: 12, cursor: 'pointer' }}>⚠️ {me.lastError}</div>}
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              {[['open', 'Открытые'], ['merged', 'История'], ['all', 'Все']].map(([k, l]) => (
                <button key={k} onClick={() => setFilter(k)} style={{ flex: 1, border: 'none', borderRadius: 8, padding: '6px 4px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', background: filter === k ? '#1c1c1c' : 'transparent', color: filter === k ? '#fff' : C.muted, fontWeight: 600 }}>{l}</button>
              ))}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', margin: '0 -4px' }}>
              {err && <div style={{ color: C.redDark, fontSize: 13, padding: 6 }}>{err}</div>}
              {data && !items.length && <div style={{ color: C.muted, fontSize: 13, padding: 6 }}>Пока пусто</div>}
              {items.map(x => (
                <div key={x._id} onClick={() => setOpen(x._id)} style={{
                  padding: '9px 10px', borderRadius: 10, cursor: 'pointer', margin: '2px 4px',
                  background: x._id === openId ? '#f1efe9' : 'transparent',
                }}>
                  <div style={{ fontSize: 14, fontWeight: x._id === openId ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.title}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.muted, marginTop: 2 }}>
                    <span style={{ width: 7, height: 7, borderRadius: 4, background: (STATUS[x.status] || STATUS.queued).color, flexShrink: 0 }} />
                    <span>{x.status === 'ready' ? 'На утверждении' : x.status === 'merged' && !x.deployedAt ? 'Выкладывается…' : (STATUS[x.status] || STATUS.queued).label}{x.stuck ? ' · завис' : ''}</span>
                    <span style={{ marginLeft: 'auto' }}>{x.authorName?.split(' ')[0]} · {fmtDate(x.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        )}
        {showChat && (
          <section style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {narrow && <div><Button style={{ padding: '5px 10px', marginBottom: 6 }} onClick={() => { if (!openId) setFilter('open'); setParams({}); }}>← Все чаты</Button></div>}
            <div style={{ flex: 1, minHeight: 0 }}>
              {filter === 'merged' && !openId
                ? <HistoryView isOwner={isOwner} onOpen={setOpen} />
                : <ChatView id={openId} isOwner={isOwner} me={me} onChanged={load} onCreated={setOpen} onOpenClaude={() => setClaudeOpen(true)} />}
            </div>
          </section>
        )}
      </div>
      {claudeOpen && <MyClaude me={me} onClose={() => setClaudeOpen(false)} onChanged={load} />}
    </div>
  );
}
