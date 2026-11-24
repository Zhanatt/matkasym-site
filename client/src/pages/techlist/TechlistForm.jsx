import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

// Публичная заявка на техлист (/techlist) — без входа, для менеджеров по продажам.
// Каждое изделие → своя задача в проекте R&D Битрикс24 (см. server/routes/techlistForm.js).

const OTHER = '__other__';
const emptyItem = () => ({ name: '', qty: '', price: '', dimensions: '', material: '', coating: '', note: '', files: [] });

const S = {
  page: { minHeight: '100vh', background: '#f2f4f8', padding: '20px 12px 60px', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#1c1c1c' },
  wrap: { maxWidth: 720, margin: '0 auto' },
  card: { background: '#fff', borderRadius: 14, padding: 18, marginBottom: 14, boxShadow: '0 2px 8px rgba(0,0,0,.05)' },
  h2: { fontSize: 15, fontWeight: 800, margin: '0 0 14px' },
  label: { display: 'block', fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 6 },
  input: { width: '100%', padding: '11px 12px', borderRadius: 8, border: '1.5px solid #e0e0e0', fontSize: 15, boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff' },
  bad: { borderColor: '#d32f2f', background: '#fff6f6' },
  row: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 },
  btn: { padding: '13px 18px', borderRadius: 10, border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
};

function Field({ label, required, hint, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={S.label}>{label} {required && <span style={{ color: '#d32f2f' }}>*</span>}</label>
      {children}
      {hint && <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function FilePicker({ files, onChange }) {
  return (
    <div>
      <input type="file" multiple onChange={e => { onChange([...files, ...e.target.files]); e.target.value = ''; }}
        accept="image/*,application/pdf,.dwg,.dxf,.doc,.docx,.xls,.xlsx" style={{ fontSize: 14 }} />
      {files.map((f, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📎 {f.name} <span style={{ color: '#999' }}>({(f.size / 1048576).toFixed(1)} МБ)</span></span>
          <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', color: '#d32f2f', fontSize: 18, cursor: 'pointer' }}>×</button>
        </div>
      ))}
    </div>
  );
}

export default function TechlistForm() {
  const [cfg, setCfg] = useState({ managers: [], maxFile: 10 << 20, maxFiles: 15, maxTotal: 40 << 20 });
  const [client, setClient] = useState('');
  const [managerSel, setManagerSel] = useState(() => localStorage.getItem('techlist_manager_sel') || '');
  const [managerOther, setManagerOther] = useState(() => localStorage.getItem('techlist_manager_other') || '');
  const [object, setObject] = useState('');
  const [deadline, setDeadline] = useState('');
  const [note, setNote] = useState('');
  const [commonFiles, setCommonFiles] = useState([]);
  const [items, setItems] = useState([emptyItem()]);
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [website, setWebsite] = useState(''); // ловушка для ботов, человек поле не видит

  useEffect(() => {
    document.title = 'Заявка на техлист — MATKASYM';
    axios.get('/api/techlist-form/config').then(r => setCfg(r.data)).catch(() => {});
  }, []);

  const manager = managerSel === OTHER ? managerOther.trim() : managerSel;
  const allFiles = [...commonFiles, ...items.flatMap(it => it.files)];

  const problems = useMemo(() => {
    const p = [];
    if (!client.trim()) p.push('Заказчик');
    if (!manager) p.push('Менеджер');
    items.forEach((it, i) => {
      const n = items.length > 1 ? ` (изделие ${i + 1})` : '';
      if (!it.name.trim()) p.push(`Изделие${n}`);
      if (!(Number(String(it.qty).replace(',', '.')) > 0)) p.push(`Количество${n}`);
      if (String(it.price).trim() === '' || !(Number(String(it.price).replace(/\s/g, '').replace(',', '.')) >= 0)) p.push(`Цена за ед.${n}`);
    });
    if (!allFiles.length) p.push('Файлы (чертёж, фото или заявка клиента)');
    const big = allFiles.find(f => f.size > cfg.maxFile);
    if (big) p.push(`«${big.name}» больше ${cfg.maxFile >> 20} МБ`);
    if (allFiles.length > cfg.maxFiles) p.push(`не больше ${cfg.maxFiles} файлов`);
    if (allFiles.reduce((s, f) => s + f.size, 0) > cfg.maxTotal) p.push(`файлы вместе больше ${cfg.maxTotal >> 20} МБ`);
    return p;
  }, [client, manager, items, allFiles, cfg]);

  const setItem = (i, patch) => setItems(list => list.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const bad = cond => (tried && cond ? S.bad : null);

  async function submit(e) {
    e.preventDefault();
    setTried(true);
    setError('');
    if (problems.length) return;
    setSending(true);
    try {
      const fd = new FormData();
      fd.append('client', client);
      fd.append('manager', manager);
      fd.append('object', object);
      fd.append('deadline', deadline ? deadline.split('-').reverse().join('.') : '');
      fd.append('note', note);
      fd.append('website', website);
      fd.append('items', JSON.stringify(items.map(({ files, ...rest }) => rest)));
      commonFiles.forEach(f => fd.append('files_common', f));
      items.forEach((it, i) => it.files.forEach(f => fd.append(`files_${i}`, f)));
      const { data } = await axios.post('/api/techlist-form', fd);
      localStorage.setItem('techlist_manager_sel', managerSel);
      localStorage.setItem('techlist_manager_other', managerOther);
      setResult(data);
      window.scrollTo(0, 0);
    } catch (err) {
      setError(err.response?.data?.message || 'Не удалось отправить. Проверьте интернет и попробуйте ещё раз.');
    } finally {
      setSending(false);
    }
  }

  function reset() {
    setClient(''); setObject(''); setDeadline(''); setNote(''); setCommonFiles([]);
    setItems([emptyItem()]); setTried(false); setResult(null); setError('');
  }

  if (result) {
    return (
      <div style={S.page}><div style={S.wrap}>
        <div style={S.card}>
          <div style={{ fontSize: 40 }}>✅</div>
          <h1 style={{ fontSize: 20, margin: '8px 0 6px' }}>Заявка отправлена</h1>
          <p style={{ color: '#555', margin: '0 0 14px' }}>
            Создано задач в отделе разработки: {result.tasks.length}. Метка заказа: <b>{result.code}</b>
          </p>
          {result.tasks.map(t => (
            <div key={t.id} style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
              <a href={t.url} target="_blank" rel="noreferrer" style={{ color: '#1f3fae' }}>{t.title}</a>
              <span style={{ color: '#999', fontSize: 12 }}> · задача №{t.id}</span>
            </div>
          ))}
          {result.warnings?.length > 0 && (
            <div style={{ marginTop: 12, padding: 10, background: '#fff8e1', borderRadius: 8, fontSize: 13 }}>
              ⚠️ {result.warnings.join('; ')}. Приложите эти файлы в задачу вручную.
            </div>
          )}
          <button type="button" onClick={reset} style={{ ...S.btn, marginTop: 18, background: '#1f3fae', color: '#fff' }}>Новая заявка</button>
        </div>
      </div></div>
    );
  }

  return (
    <div style={S.page}><form style={S.wrap} onSubmit={submit} noValidate>
      <h1 style={{ fontSize: 22, margin: '4px 4px 4px', color: '#1f3fae' }}>Заявка на техлист</h1>
      <p style={{ margin: '0 4px 16px', color: '#666', fontSize: 14 }}>
        Заявка уйдёт в отдел разработки (Битрикс24). На каждое изделие создаётся отдельная задача.
      </p>

      <div style={S.card}>
        <h2 style={S.h2}>👤 Заказ</h2>
        <Field label="Заказчик" required hint="Компания полностью или ФИО: ОсОО СК «Эрма групп»">
          <input style={{ ...S.input, ...bad(!client.trim()) }} value={client} onChange={e => setClient(e.target.value)} />
        </Field>
        <Field label="Менеджер" required>
          <select style={{ ...S.input, ...bad(!manager) }} value={managerSel} onChange={e => setManagerSel(e.target.value)}>
            <option value="">— выберите —</option>
            {cfg.managers.map(m => <option key={m} value={m}>{m}</option>)}
            <option value={OTHER}>Другой — вписать</option>
          </select>
          {managerSel === OTHER && (
            <input style={{ ...S.input, marginTop: 8, ...bad(!manager) }} placeholder="Фамилия Имя" value={managerOther} onChange={e => setManagerOther(e.target.value)} />
          )}
        </Field>
        <div style={S.row}>
          <Field label="Объект"><input style={S.input} value={object} onChange={e => setObject(e.target.value)} placeholder="ЖК, адрес" /></Field>
          <Field label="Желаемый срок"><input type="date" style={S.input} value={deadline} onChange={e => setDeadline(e.target.value)} /></Field>
        </div>
        <Field label="Примечание к заказу">
          <textarea style={{ ...S.input, minHeight: 70, resize: 'vertical' }} value={note} onChange={e => setNote(e.target.value)} />
        </Field>
        <Field label="Общие файлы заказа" hint="Чертёж заказчика, рукописная заявка, переписка — прикрепятся к каждому изделию">
          <FilePicker files={commonFiles} onChange={setCommonFiles} />
        </Field>
      </div>

      {items.map((it, i) => (
        <div key={i} style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={S.h2}>📦 Изделие {items.length > 1 ? i + 1 : ''}</h2>
            {items.length > 1 && (
              <button type="button" onClick={() => setItems(list => list.filter((_, j) => j !== i))}
                style={{ border: 'none', background: 'none', color: '#d32f2f', fontSize: 13, cursor: 'pointer', marginTop: -12 }}>Убрать</button>
            )}
          </div>
          <Field label="Что делаем" required>
            <input style={{ ...S.input, ...bad(!it.name.trim()) }} value={it.name} onChange={e => setItem(i, { name: e.target.value })} placeholder="Электрощит этажный 4 окна" />
          </Field>
          <div style={S.row}>
            <Field label="Количество, шт" required>
              <input inputMode="numeric" style={{ ...S.input, ...bad(!(Number(String(it.qty).replace(',', '.')) > 0)) }} value={it.qty} onChange={e => setItem(i, { qty: e.target.value })} />
            </Field>
            <Field label="Цена за ед., сом" required>
              <input inputMode="decimal" style={{ ...S.input, ...bad(String(it.price).trim() === '') }} value={it.price} onChange={e => setItem(i, { price: e.target.value })} />
            </Field>
          </div>
          <Field label="Размеры, мм"><input style={S.input} value={it.dimensions} onChange={e => setItem(i, { dimensions: e.target.value })} placeholder="1000×800×200" /></Field>
          <div style={S.row}>
            <Field label="Материал / толщина"><input style={S.input} value={it.material} onChange={e => setItem(i, { material: e.target.value })} placeholder="х/к 1,0 мм" /></Field>
            <Field label="Покрытие / RAL"><input style={S.input} value={it.coating} onChange={e => setItem(i, { coating: e.target.value })} placeholder="RAL 7035" /></Field>
          </div>
          <Field label="Комментарий к изделию">
            <textarea style={{ ...S.input, minHeight: 60, resize: 'vertical' }} value={it.note} onChange={e => setItem(i, { note: e.target.value })} />
          </Field>
          <Field label="Файлы к этому изделию" hint="Фото, эскиз, чертёж именно этого изделия">
            <FilePicker files={it.files} onChange={files => setItem(i, { files })} />
          </Field>
        </div>
      ))}

      <button type="button" onClick={() => setItems(list => [...list, emptyItem()])}
        style={{ ...S.btn, width: '100%', background: '#fff', color: '#1f3fae', border: '1.5px dashed #1f3fae', marginBottom: 14 }}>
        + Добавить изделие
      </button>

      <input value={website} onChange={e => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off"
        style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }} aria-hidden="true" />

      {tried && problems.length > 0 && (
        <div style={{ ...S.card, background: '#fff6f6', color: '#b71c1c', fontSize: 14 }}>
          Заполните: {problems.join(', ')}
        </div>
      )}
      {error && <div style={{ ...S.card, background: '#fff6f6', color: '#b71c1c', fontSize: 14 }}>{error}</div>}

      <button type="submit" disabled={sending}
        style={{ ...S.btn, width: '100%', background: sending ? '#9aa6d6' : '#1f3fae', color: '#fff', fontSize: 16 }}>
        {sending ? 'Отправляем…' : `Отправить заявку${items.length > 1 ? ` (${items.length} изделия)` : ''}`}
      </button>
    </form></div>
  );
}
