import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';

// «Вернуть на доработку» (/techlist/rework/:taskId?k=…): клиент на утверждении попросил
// изменить техлист. Менеджер обязательно пишет, что изменить, — задача уходит в «Заявку на техлист».

const S = {
  page: { minHeight: '100vh', background: '#f2f4f8', padding: '20px 12px 60px', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#1c1c1c' },
  wrap: { maxWidth: 560, margin: '0 auto' },
  card: { background: '#fff', borderRadius: 14, padding: 18, marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,.05)' },
  input: { width: '100%', padding: 12, borderRadius: 10, border: '1.5px solid #e0e0e0', fontSize: 16, boxSizing: 'border-box', fontFamily: 'inherit' },
  btn: { padding: '14px 18px', borderRadius: 12, border: 'none', fontSize: 17, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', width: '100%' },
};

export default function TechlistRework() {
  const { taskId } = useParams();
  const [params] = useSearchParams();
  const k = params.get('k') || '';
  const [info, setInfo] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [what, setWhat] = useState('');
  const [files, setFiles] = useState([]);
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    document.title = 'Вернуть на доработку — MATKASYM';
    axios.get(`/api/techlist-approve/${taskId}/rework`, { params: { k } })
      .then(r => setInfo(r.data))
      .catch(e => setLoadError(e.response?.data?.message || 'Не удалось загрузить задачу'));
  }, [taskId, k]);

  const bad = tried && what.trim().length < 3;

  async function submit(e) {
    e.preventDefault();
    setTried(true); setError('');
    if (what.trim().length < 3) return;
    setSending(true);
    try {
      const fd = new FormData();
      fd.append('what', what);
      files.forEach(f => fd.append('files', f));
      await axios.post(`/api/techlist-approve/${taskId}/rework`, fd, { params: { k } });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Не отправилось. Проверьте интернет и нажмите ещё раз.');
    } finally { setSending(false); }
  }

  if (loadError) return <div style={S.page}><div style={S.wrap}><div style={S.card}>⚠️ {loadError}</div></div></div>;
  if (!info) return <div style={S.page}><div style={{ ...S.wrap, color: '#888' }}>Загружаем задачу…</div></div>;

  if (done) {
    return (
      <div style={S.page}><div style={S.wrap}><div style={{ ...S.card, textAlign: 'center', padding: 28 }}>
        <div style={{ fontSize: 44 }}>🔁</div>
        <h1 style={{ fontSize: 20, margin: '8px 0 6px' }}>Вернули на доработку</h1>
        <p style={{ color: '#666' }}>Задача снова в «Заявке на техлист», комментарий — в чате задачи.</p>
        <a href={info.taskUrl} style={{ color: '#1f3fae' }}>Вернуться к задаче</a>
      </div></div></div>
    );
  }

  return (
    <div style={S.page}><form style={S.wrap} onSubmit={submit} noValidate>
      <h1 style={{ fontSize: 22, margin: '4px 4px 6px', color: '#1f3fae' }}>Вернуть на доработку</h1>
      <p style={{ margin: '0 4px 16px', color: '#666' }}>{info.title}</p>
      <div style={S.card}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#444', marginBottom: 6 }}>
          Что изменить<span style={{ color: '#d32f2f' }}> *</span>
        </label>
        <textarea style={{ ...S.input, minHeight: 140, resize: 'vertical', ...(bad ? { borderColor: '#d32f2f', background: '#fff6f6' } : {}) }}
          value={what} onChange={e => setWhat(e.target.value)} placeholder="Например: клиент просит 4 окошка вместо 5 и цвет RAL 9003" />
        <label style={{ display: 'block', textAlign: 'center', marginTop: 12, padding: 14, borderRadius: 10, cursor: 'pointer', border: '2px dashed #b8c2e6', background: '#f6f8ff', color: '#1f3fae', fontWeight: 700 }}>
          📷 Приложить фото или файл (если есть)
          <input type="file" multiple hidden onChange={e => { setFiles(l => [...l, ...e.target.files]); e.target.value = ''; }} />
        </label>
        {files.map((f, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '8px 2px', borderBottom: '1px solid #f0f0f0' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📎 {f.name}</span>
            <button type="button" onClick={() => setFiles(l => l.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', color: '#d32f2f', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
        ))}
      </div>
      {bad && <div style={{ color: '#b71c1c', textAlign: 'center', marginBottom: 10 }}>Напишите, что нужно изменить</div>}
      {error && <div style={{ color: '#b71c1c', textAlign: 'center', marginBottom: 10 }}>{error}</div>}
      <button type="submit" disabled={sending} style={{ ...S.btn, background: sending ? '#9aa6d6' : '#1f3fae', color: '#fff' }}>
        {sending ? 'Отправляем…' : 'Вернуть на доработку'}
      </button>
    </form></div>
  );
}
