import { useEffect, useState } from 'react';
import axios from 'axios';

// Публичная заявка на техлист (/techlist) — без входа, для менеджеров по продажам.
// Каждое изделие → своя задача в проекте R&D Битрикс24 (см. server/routes/techlistForm.js).
// Форма нарочно короткая: менеджеры длинные формы не читают.

const OTHER = '__other__';
const emptyItem = () => ({ name: '', params: '', qty: '', price: '', note: '', files: [] });
const CATEGORIES = ['Щиты', 'Урны', 'Скамейки', 'Ограждения', 'Двери', 'Велопарковки', 'Лазерная резка', 'Металлоконструкции'];
const num = v => Number(String(v).replace(/\s/g, '').replace(',', '.'));

const S = {
  page: { minHeight: '100vh', background: '#f2f4f8', padding: '20px 12px 60px', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#1c1c1c' },
  wrap: { maxWidth: 560, margin: '0 auto' },
  card: { background: '#fff', borderRadius: 14, padding: 18, marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,.05)' },
  label: { display: 'block', fontSize: 13, fontWeight: 700, color: '#444', marginBottom: 6 },
  input: { width: '100%', padding: '12px', borderRadius: 10, border: '1.5px solid #e0e0e0', fontSize: 16, boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff' },
  bad: { borderColor: '#d32f2f', background: '#fff6f6' },
  row: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 },
  btn: { padding: '14px 18px', borderRadius: 12, border: 'none', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', width: '100%' },
};

function Field({ label, required, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={S.label}>{label}{required && <span style={{ color: '#d32f2f' }}> *</span>}</label>
      {children}
    </div>
  );
}

function FilePicker({ files, onChange, invalid }) {
  return (
    <div>
      <label style={{
        display: 'block', textAlign: 'center', padding: '16px 12px', borderRadius: 10, cursor: 'pointer',
        border: `2px dashed ${invalid ? '#d32f2f' : '#b8c2e6'}`, background: invalid ? '#fff6f6' : '#f6f8ff',
        color: '#1f3fae', fontWeight: 700, fontSize: 15,
      }}>
        📷 {files.length ? 'Добавить ещё' : 'Добавить фото или чертёж'}
        <input type="file" multiple hidden accept="image/*,application/pdf,.dwg,.dxf,.doc,.docx,.xls,.xlsx"
          onChange={e => { onChange([...files, ...e.target.files]); e.target.value = ''; }} />
      </label>
      {files.map((f, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14, padding: '8px 2px', borderBottom: '1px solid #f0f0f0' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📎 {f.name}</span>
          <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))}
            style={{ border: 'none', background: 'none', color: '#d32f2f', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
      ))}
    </div>
  );
}

export default function TechlistForm() {
  const [cfg, setCfg] = useState({ managers: [], makers: [], maxFile: 10 << 20, maxFiles: 15, maxTotal: 40 << 20 });
  const [category, setCategory] = useState('');
  const [client, setClient] = useState('');
  const [managerSel, setManagerSel] = useState(() => localStorage.getItem('techlist_manager_sel') || '');
  const [managerOther, setManagerOther] = useState(() => localStorage.getItem('techlist_manager_other') || '');
  const [maker, setMaker] = useState('');
  const [deadline, setDeadline] = useState('');
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
  const allFiles = items.flatMap(it => it.files);

  const itemBad = it => ({
    name: !it.name.trim(),
    params: !it.params.trim(),
    qty: !(num(it.qty) > 0),
    price: !(num(it.price) > 0),
    files: !it.files.length,
  });
  const fileProblem =
    allFiles.find(f => f.size > cfg.maxFile) ? `Файл больше ${cfg.maxFile >> 20} МБ — уменьшите или пришлите другой`
    : allFiles.length > cfg.maxFiles ? `Слишком много файлов (не больше ${cfg.maxFiles})`
    : allFiles.reduce((s, f) => s + f.size, 0) > cfg.maxTotal ? `Файлы вместе больше ${cfg.maxTotal >> 20} МБ`
    : '';
  const valid = category.trim() && client.trim() && manager && maker && !fileProblem &&
    items.every(it => !Object.values(itemBad(it)).some(Boolean));

  const setItem = (i, patch) => setItems(list => list.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const bad = cond => (tried && cond ? S.bad : null);

  async function submit(e) {
    e.preventDefault();
    setTried(true);
    setError('');
    if (!valid) return;
    setSending(true);
    try {
      const fd = new FormData();
      fd.append('category', category);
      fd.append('client', client);
      fd.append('manager', manager);
      fd.append('maker', maker);
      fd.append('deadline', deadline ? deadline.split('-').reverse().join('.') : '');
      fd.append('website', website);
      fd.append('items', JSON.stringify(items.map(({ files, ...rest }) => rest)));
      items.forEach((it, i) => it.files.forEach(f => fd.append(`files_${i}`, f)));
      const { data } = await axios.post('/api/techlist-form', fd);
      localStorage.setItem('techlist_manager_sel', managerSel);
      localStorage.setItem('techlist_manager_other', managerOther);
      setResult(data);
      window.scrollTo(0, 0);
    } catch (err) {
      setError(err.response?.data?.message || 'Не отправилось. Проверьте интернет и нажмите ещё раз.');
    } finally {
      setSending(false);
    }
  }

  function reset() {
    setCategory(''); setClient(''); setMaker(''); setDeadline(''); setItems([emptyItem()]);
    setTried(false); setResult(null); setError('');
  }

  if (result) {
    return (
      <div style={S.page}><div style={S.wrap}>
        <div style={{ ...S.card, textAlign: 'center', padding: 28 }}>
          <div style={{ fontSize: 48 }}>✅</div>
          <h1 style={{ fontSize: 22, margin: '8px 0 6px' }}>Заявка отправлена</h1>
          <p style={{ color: '#666', margin: '0 0 20px' }}>Отдел разработки получил её</p>
          {result.warnings?.length > 0 && (
            <div style={{ marginBottom: 16, padding: 10, background: '#fff8e1', borderRadius: 8, fontSize: 14, textAlign: 'left' }}>
              ⚠️ Не все файлы прикрепились — отправьте их Жанату вручную.
            </div>
          )}
          <button type="button" onClick={reset} style={{ ...S.btn, background: '#1f3fae', color: '#fff' }}>Новая заявка</button>
        </div>
      </div></div>
    );
  }

  return (
    <div style={S.page}><form style={S.wrap} onSubmit={submit} noValidate>
      <h1 style={{ fontSize: 24, margin: '4px 4px 16px', color: '#1f3fae' }}>Заявка на техлист</h1>

      <div style={S.card}>
        <Field label="Категория" required>
          <input list="techlist-categories" style={{ ...S.input, ...bad(!category.trim()) }} value={category} onChange={e => setCategory(e.target.value)} placeholder="Щиты" />
          <datalist id="techlist-categories">{CATEGORIES.map(c => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Заказчик" required>
          <input style={{ ...S.input, ...bad(!client.trim()) }} value={client} onChange={e => setClient(e.target.value)} placeholder="Компания или ФИО" />
        </Field>
        <Field label="Менеджер" required>
          <select style={{ ...S.input, ...bad(!manager) }} value={managerSel} onChange={e => setManagerSel(e.target.value)}>
            <option value="">Выберите себя</option>
            {cfg.managers.map(m => <option key={m} value={m}>{m}</option>)}
            <option value={OTHER}>Нет в списке</option>
          </select>
          {managerSel === OTHER && (
            <input style={{ ...S.input, marginTop: 8, ...bad(!manager) }} placeholder="Ваше имя" value={managerOther} onChange={e => setManagerOther(e.target.value)} />
          )}
        </Field>
        <Field label="Кто делает техлист" required>
          <div style={S.row}>
            {cfg.makers.map(m => (
              <button key={m.id} type="button" onClick={() => setMaker(m.id)} style={{
                ...S.input, fontWeight: 700, cursor: 'pointer',
                ...(maker === m.id ? { background: '#1f3fae', color: '#fff', borderColor: '#1f3fae' } : {}),
                ...(tried && !maker ? S.bad : {}),
              }}>{m.name}</button>
            ))}
          </div>
        </Field>
        <Field label="Когда нужен техлист">
          <input type="date" style={S.input} value={deadline} onChange={e => setDeadline(e.target.value)} />
        </Field>
      </div>

      {items.map((it, i) => {
        const b = itemBad(it);
        return (
          <div key={i} style={S.card}>
            {items.length > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <b style={{ color: '#1f3fae' }}>Изделие {i + 1}</b>
                <button type="button" onClick={() => setItems(list => list.filter((_, j) => j !== i))}
                  style={{ border: 'none', background: 'none', color: '#d32f2f', fontSize: 14, cursor: 'pointer' }}>Удалить</button>
              </div>
            )}
            <Field label="Что делаем" required>
              <input style={{ ...S.input, ...bad(b.name) }} value={it.name} onChange={e => setItem(i, { name: e.target.value })} placeholder="Электрощит этажный" />
            </Field>
            <div style={S.row}>
              <Field label="Сколько штук" required>
                <input inputMode="numeric" style={{ ...S.input, ...bad(b.qty) }} value={it.qty} onChange={e => setItem(i, { qty: e.target.value })} />
              </Field>
              <Field label="Цена за 1 шт, сом" required>
                <input inputMode="decimal" style={{ ...S.input, ...bad(b.price) }} value={it.price} onChange={e => setItem(i, { price: e.target.value })} />
              </Field>
            </div>
            <Field label="Размеры и комплектация" required>
              <textarea style={{ ...S.input, minHeight: 64, resize: 'vertical', ...bad(b.params) }} value={it.params} onChange={e => setItem(i, { params: e.target.value })}
                placeholder="900×900×150 (рамка 1000×1000), 3 двери, 5 окошек, замок треугольник, RAL 7035" />
            </Field>
            <Field label="Фото или чертёж" required>
              <FilePicker files={it.files} onChange={files => setItem(i, { files })} invalid={tried && b.files} />
            </Field>
            <Field label="Комментарий">
              <textarea style={{ ...S.input, minHeight: 64, resize: 'vertical' }} value={it.note} onChange={e => setItem(i, { note: e.target.value })} placeholder="Объект, пожелания — если есть" />
            </Field>
          </div>
        );
      })}

      <button type="button" onClick={() => setItems(list => [...list, emptyItem()])}
        style={{ ...S.btn, background: 'transparent', color: '#1f3fae', border: '2px dashed #b8c2e6', marginBottom: 12 }}>
        + Ещё изделие
      </button>

      <input value={website} onChange={e => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off"
        style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }} aria-hidden="true" />

      {tried && !valid && (
        <div style={{ color: '#b71c1c', fontSize: 15, margin: '0 4px 10px', textAlign: 'center' }}>
          {fileProblem || 'Заполните поля, выделенные красным'}
        </div>
      )}
      {error && <div style={{ color: '#b71c1c', fontSize: 15, margin: '0 4px 10px', textAlign: 'center' }}>{error}</div>}

      <button type="submit" disabled={sending}
        style={{ ...S.btn, background: sending ? '#9aa6d6' : '#1f3fae', color: '#fff', fontSize: 17 }}>
        {sending ? 'Отправляем…' : 'Отправить'}
      </button>
    </form></div>
  );
}
