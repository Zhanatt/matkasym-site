import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';

// «Оформить на утверждение» (/techlist/approve/:taskId?k=…) — единственный путь задачи R&D
// в «Завершённые техлисты». Все поля обязательны, PDF техлиста — тоже.
// Сообщение собирается в формате раздела 16 инструкции техлистов.

const num = v => Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
const money = n => Math.round(n).toLocaleString('ru-RU').replace(/\s/g, ' ');
const plural = (n, one, few, many) => {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
};
const emptyPos = () => ({ taskId: '', short: '', fullName: '', qty: '', price: '' });

const S = {
  page: { minHeight: '100vh', background: '#f2f4f8', padding: '20px 12px 60px', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#1c1c1c' },
  wrap: { maxWidth: 620, margin: '0 auto' },
  card: { background: '#fff', borderRadius: 14, padding: 18, marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,.05)' },
  label: { display: 'block', fontSize: 13, fontWeight: 700, color: '#444', marginBottom: 6 },
  input: { width: '100%', padding: 12, borderRadius: 10, border: '1.5px solid #e0e0e0', fontSize: 16, boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff' },
  bad: { borderColor: '#d32f2f', background: '#fff6f6' },
  row: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 },
  btn: { padding: '14px 18px', borderRadius: 12, border: 'none', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', width: '100%' },
  pre: { whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13, background: '#f6f8ff', borderRadius: 10, padding: 14, margin: 0 },
};

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={S.label}>{label}<span style={{ color: '#d32f2f' }}> *</span></label>
      {children}
    </div>
  );
}

function buildMessage({ category, client, manager, positions }) {
  const ps = positions.map(p => ({ ...p, qty: num(p.qty), price: num(p.price) }));
  const total = ps.reduce((s, p) => s + p.qty * p.price, 0);
  const items = ps.reduce((s, p) => s + p.qty, 0);
  const n = ps.length;
  return [
    'Техлист на утверждение', '',
    `${category || '…'}, ${n} ${plural(n, 'позиция', 'позиции', 'позиций')}:`,
    ...ps.map(p => ` • ${p.fullName || '…'}`), '',
    'Количество:', '', ...ps.map(p => ` • ${p.short || "…"} : ${p.qty || 0}шт`), '',
    'Цена:', '', ...ps.map(p => ` • ${p.short || '…'} : ${money(p.price || 0)} сом`), '',
    'Сумма по позициям:', '', ...ps.map(p => ` • ${p.short || '…'} : ${money((p.qty || 0) * (p.price || 0))} сом`), '',
    `Общая сумма: ${money(total || 0)} сом (${items || 0} ${plural(items || 0, 'изделие', 'изделия', 'изделий')})`, '',
    `Менеджер: ${manager || '…'}`,
    `Клиент: ${client || '…'}`,
  ].join('\n');
}

export default function TechlistApprove() {
  const { taskId } = useParams();
  const [params] = useSearchParams();
  const k = params.get('k') || '';
  const [loadError, setLoadError] = useState('');
  const [info, setInfo] = useState(null);
  const [category, setCategory] = useState('');
  const [client, setClient] = useState('');
  const [manager, setManager] = useState('');
  const [positions, setPositions] = useState([]);
  const [files, setFiles] = useState([]);
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    document.title = 'Техлист на утверждение — MATKASYM';
    axios.get(`/api/techlist-approve/${taskId}`, { params: { k } })
      .then(({ data }) => {
        setInfo(data); setClient(data.client); setManager(data.manager);
        setPositions(data.positions.length ? data.positions : [emptyPos()]);
      })
      .catch(e => setLoadError(e.response?.data?.message || 'Не удалось загрузить задачу'));
  }, [taskId, k]);

  const posBad = p => ({
    fullName: !p.fullName.trim(), short: !p.short.trim(),
    qty: !(num(p.qty) > 0), price: String(p.price).trim() === '' || !(num(p.price) >= 0),
  });
  const valid = category.trim() && client.trim() && manager.trim() && files.length && positions.length &&
    positions.every(p => !Object.values(posBad(p)).some(Boolean));
  const message = useMemo(() => buildMessage({ category, client, manager, positions }), [category, client, manager, positions]);
  const bad = cond => (tried && cond ? S.bad : null);
  const setPos = (i, patch) => setPositions(list => list.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  async function submit(e) {
    e.preventDefault();
    setTried(true); setError('');
    if (!valid) return;
    setSending(true);
    try {
      const fd = new FormData();
      fd.append('category', category); fd.append('client', client); fd.append('manager', manager);
      fd.append('positions', JSON.stringify(positions));
      files.forEach(f => fd.append('techlist', f));
      const { data } = await axios.post(`/api/techlist-approve/${taskId}`, fd, { params: { k } });
      setDone(data); window.scrollTo(0, 0);
    } catch (err) {
      setError(err.response?.data?.message || 'Не отправилось. Проверьте интернет и нажмите ещё раз.');
    } finally { setSending(false); }
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* старый браузер */ }
  }

  if (loadError) return <div style={S.page}><div style={S.wrap}><div style={S.card}>⚠️ {loadError}</div></div></div>;
  if (!info) return <div style={S.page}><div style={{ ...S.wrap, color: '#888' }}>Загружаем задачу…</div></div>;

  if (done) {
    return (
      <div style={S.page}><div style={S.wrap}>
        <div style={S.card}>
          <div style={{ fontSize: 40 }}>✅</div>
          <h1 style={{ fontSize: 20, margin: '6px 0 6px' }}>Отправлено на утверждение</h1>
          <p style={{ color: '#666', margin: '0 0 14px' }}>
            Сообщение и техлист — в чате задачи, задача в «Завершённых техлистах».
          </p>
          <pre style={S.pre}>{done.message}</pre>
          <button type="button" onClick={() => copy(done.message)} style={{ ...S.btn, marginTop: 12, background: '#1f3fae', color: '#fff' }}>
            {copied ? 'Скопировано ✓' : 'Скопировать для WhatsApp'}
          </button>
          <a href={info.taskUrl} style={{ display: 'block', textAlign: 'center', marginTop: 14, color: '#1f3fae' }}>Вернуться к задаче</a>
          {done.warnings?.length > 0 && <p style={{ color: '#b26a00', fontSize: 13 }}>⚠️ {done.warnings.join('; ')}</p>}
        </div>
      </div></div>
    );
  }

  return (
    <div style={S.page}><form style={S.wrap} onSubmit={submit} noValidate>
      <h1 style={{ fontSize: 24, margin: '4px 4px 16px', color: '#1f3fae' }}>Техлист на утверждение</h1>

      <div style={S.card}>
        <Field label="Категория">
          <input style={{ ...S.input, ...bad(!category.trim()) }} value={category} onChange={e => setCategory(e.target.value)} placeholder="Щиты" />
        </Field>
        <div style={S.row}>
          <Field label="Клиент"><input style={{ ...S.input, ...bad(!client.trim()) }} value={client} onChange={e => setClient(e.target.value)} /></Field>
          <Field label="Менеджер"><input style={{ ...S.input, ...bad(!manager.trim()) }} value={manager} onChange={e => setManager(e.target.value)} /></Field>
        </div>
      </div>

      {positions.map((p, i) => {
        const b = posBad(p);
        return (
          <div key={i} style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <b style={{ color: '#1f3fae' }}>Позиция {i + 1}</b>
              {positions.length > 1 && (
                <button type="button" onClick={() => setPositions(list => list.filter((_, j) => j !== i))}
                  style={{ border: 'none', background: 'none', color: '#d32f2f', fontSize: 14, cursor: 'pointer' }}>Убрать</button>
              )}
            </div>
            <Field label="Название с параметрами">
              <textarea style={{ ...S.input, minHeight: 64, resize: 'vertical', ...bad(b.fullName) }} value={p.fullName}
                onChange={e => setPos(i, { fullName: e.target.value })}
                placeholder="Электрощит этажный 900×900×150 (рамка 1000×1000), 3 двери, 5 окошек, замок треугольник, RAL 7035" />
            </Field>
            <Field label="Краткое название">
              <input style={{ ...S.input, ...bad(b.short) }} value={p.short} onChange={e => setPos(i, { short: e.target.value })} placeholder="Электрощит" />
            </Field>
            <div style={S.row}>
              <Field label="Количество, шт"><input inputMode="numeric" style={{ ...S.input, ...bad(b.qty) }} value={p.qty} onChange={e => setPos(i, { qty: e.target.value })} /></Field>
              <Field label="Цена за 1 шт, сом"><input inputMode="decimal" style={{ ...S.input, ...bad(b.price) }} value={p.price} onChange={e => setPos(i, { price: e.target.value })} /></Field>
            </div>
          </div>
        );
      })}

      <button type="button" onClick={() => setPositions(list => [...list, emptyPos()])}
        style={{ ...S.btn, background: 'transparent', color: '#1f3fae', border: '2px dashed #b8c2e6', marginBottom: 12 }}>
        + Ещё позиция
      </button>

      <div style={S.card}>
        <Field label="PDF техлиста">
          <label style={{
            display: 'block', textAlign: 'center', padding: '16px 12px', borderRadius: 10, cursor: 'pointer',
            border: `2px dashed ${tried && !files.length ? '#d32f2f' : '#b8c2e6'}`, background: tried && !files.length ? '#fff6f6' : '#f6f8ff',
            color: '#1f3fae', fontWeight: 700,
          }}>
            📄 {files.length ? 'Добавить ещё файл' : 'Прикрепить техлист'}
            <input type="file" multiple hidden accept="application/pdf,image/*"
              onChange={e => { setFiles(list => [...list, ...e.target.files]); e.target.value = ''; }} />
          </label>
          {files.map((f, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '8px 2px', borderBottom: '1px solid #f0f0f0' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📎 {f.name}</span>
              <button type="button" onClick={() => setFiles(list => list.filter((_, j) => j !== i))}
                style={{ border: 'none', background: 'none', color: '#d32f2f', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
          ))}
        </Field>
      </div>

      <div style={S.card}>
        <div style={{ ...S.label, marginBottom: 8 }}>Так увидит менеджер</div>
        <pre style={S.pre}>{message}</pre>
      </div>

      {tried && !valid && <div style={{ color: '#b71c1c', textAlign: 'center', margin: '0 4px 10px' }}>Заполните поля, выделенные красным, и прикрепите техлист</div>}
      {error && <div style={{ color: '#b71c1c', textAlign: 'center', margin: '0 4px 10px' }}>{error}</div>}

      <button type="submit" disabled={sending} style={{ ...S.btn, background: sending ? '#9aa6d6' : '#1f3fae', color: '#fff', fontSize: 17 }}>
        {sending ? 'Отправляем…' : 'Отправить на утверждение'}
      </button>
    </form></div>
  );
}
