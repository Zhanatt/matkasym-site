import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  socialGetAccounts, socialCreateAccount, socialUpdateAccount,
  socialDeleteAccount, socialCheckAccount, socialGetTelegramChats,
} from '../../api';
import { PLATFORMS, POST_TYPES, platformMeta } from '../../config/socialPlatforms';

const CARD = { background: '#fff', borderRadius: 14, padding: 22, boxShadow: '0 1px 6px rgba(0,0,0,.07)', marginBottom: 16 };
const L    = { fontSize: 12, fontWeight: 700, color: '#666', display: 'block', marginBottom: 6 };
const INP  = { width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #e0e0e0', fontSize: 13, outline: 'none', boxSizing: 'border-box' };

// Пустой черновик подключения для выбранной платформы.
const emptyDraft = (platform) => ({
  platform,
  title: '',
  config: {},
  postTypes: platform === 'instagram' ? ['feed'] : ['feed'],
  captionTemplate: '',
  enabled: true,
});

export default function AdminPublishAccounts() {
  const navigate = useNavigate();

  const [accounts, setAccounts] = useState([]);
  const [tgChats,  setTgChats]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [draft,    setDraft]    = useState(null);   // новое подключение
  const [editing,  setEditing]  = useState(null);   // редактируемое подключение
  const [checks,   setChecks]   = useState({});     // результат «Проверить связь» по id
  const [error,    setError]    = useState('');

  const load = () => {
    setLoading(true);
    socialGetAccounts()
      .then(r => setAccounts(r.data.accounts || []))
      .catch(e => setError(e.response?.data?.message || 'Не удалось загрузить площадки'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    socialGetTelegramChats().then(r => setTgChats(r.data.chats || [])).catch(() => {});
  }, []);

  const save = async (item) => {
    setError('');
    try {
      if (item._id) await socialUpdateAccount(item._id, item);
      else          await socialCreateAccount(item);
      setDraft(null); setEditing(null);
      load();
    } catch (e) {
      setError(e.response?.data?.message || 'Ошибка сохранения');
    }
  };

  const remove = async (item) => {
    if (!confirm(`Удалить площадку «${item.title}»?`)) return;
    await socialDeleteAccount(item._id);
    load();
  };

  const check = async (item) => {
    setChecks(c => ({ ...c, [item._id]: { loading: true } }));
    try {
      const r = await socialCheckAccount(item._id);
      setChecks(c => ({ ...c, [item._id]: r.data }));
    } catch (e) {
      setChecks(c => ({ ...c, [item._id]: { ok: false, error: e.response?.data?.message || 'Ошибка' } }));
    }
  };

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 0 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8, flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/admin/publish')} style={{
          background: 'none', border: '1.5px solid #e0e0e0', borderRadius: 8,
          padding: '6px 14px', fontSize: 13, cursor: 'pointer', color: '#555', fontWeight: 600,
        }}>← К публикации</button>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>🔌 Площадки</h1>
      </div>
      <p style={{ fontSize: 13, color: '#888', margin: '0 0 22px' }}>
        Куда уходят посты. Каждая площадка — отдельное подключение: Instagram-аккаунтов и Telegram-групп может быть сколько угодно.
      </p>

      {error && <div style={{ ...CARD, background: '#fdf0ef', color: '#c0392b', fontSize: 13, padding: '12px 16px' }}>{error}</div>}

      {/* Добавление */}
      {!draft && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
          {Object.entries(PLATFORMS).map(([key, meta]) => (
            <button key={key} onClick={() => setDraft(emptyDraft(key))} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px',
              borderRadius: 10, border: `1.5px solid ${meta.color}33`, background: '#fff',
              color: meta.color, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}>
              <span style={{ fontSize: 16 }}>{meta.icon}</span> + {meta.label}
            </button>
          ))}
        </div>
      )}

      {draft && (
        <AccountForm
          value={draft}
          tgChats={tgChats}
          onChange={setDraft}
          onSave={() => save(draft)}
          onCancel={() => setDraft(null)}
        />
      )}

      {/* Список */}
      {loading ? (
        <div style={{ fontSize: 13, color: '#aaa' }}>Загрузка...</div>
      ) : !accounts.length && !draft ? (
        <div style={{ ...CARD, textAlign: 'center', color: '#999', fontSize: 13 }}>
          Пока не подключено ни одной площадки.
        </div>
      ) : accounts.map(a => {
        const meta = platformMeta(a.platform);
        const chk  = checks[a._id];
        if (editing?._id === a._id) {
          return (
            <AccountForm
              key={a._id}
              value={editing}
              tgChats={tgChats}
              onChange={setEditing}
              onSave={() => save(editing)}
              onCancel={() => setEditing(null)}
            />
          );
        }
        return (
          <div key={a._id} style={{ ...CARD, opacity: a.enabled ? 1 : .55 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 22 }}>{meta.icon}</span>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>{a.title}</div>
                <div style={{ fontSize: 12, color: '#8b98a5', marginTop: 2 }}>
                  {meta.label}
                  {a.platform === 'telegram' && a.config?.chatId  && ` · ${a.config.chatId}`}
                  {a.platform === 'instagram' && a.config?.igUserId && ` · ID ${a.config.igUserId}`}
                  {a.platform === 'bitrix24'  && ` · ${a.config?.dest || 'UA'}`}
                  {a.platform === 'instagram' && a.postTypes?.length > 0 &&
                    ` · ${a.postTypes.map(t => POST_TYPES[t]?.label || t).join(', ')}`}
                </div>
              </div>
              <button onClick={() => check(a)} style={btn('#fff', '#555')}>
                {chk?.loading ? '...' : 'Проверить'}
              </button>
              <button onClick={() => setEditing(JSON.parse(JSON.stringify(a)))} style={btn('#fff', '#555')}>Изменить</button>
              <button onClick={() => save({ ...a, enabled: !a.enabled })} style={btn('#fff', a.enabled ? '#b8860b' : '#1e7c3a')}>
                {a.enabled ? 'Выключить' : 'Включить'}
              </button>
              <button onClick={() => remove(a)} style={btn('#fff', '#c0392b')}>Удалить</button>
            </div>

            {chk && !chk.loading && (
              <div style={{
                marginTop: 12, fontSize: 12, padding: '8px 12px', borderRadius: 8,
                background: chk.ok ? '#eafaf1' : '#fdf0ef', color: chk.ok ? '#1e7c3a' : '#c0392b',
              }}>
                {chk.ok ? `✅ Связь есть — ${chk.info}` : `❌ ${chk.error}`}
              </div>
            )}
            {a.lastError && !chk && (
              <div style={{ marginTop: 12, fontSize: 12, color: '#c0392b' }}>Последняя ошибка: {a.lastError}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function btn(bg, color) {
  return {
    padding: '7px 14px', borderRadius: 8, border: '1.5px solid #e0e0e0',
    background: bg, color, fontSize: 12, fontWeight: 600, cursor: 'pointer',
  };
}

function AccountForm({ value, onChange, onSave, onCancel, tgChats }) {
  const meta = platformMeta(value.platform);
  const setConfig = (key, v) => onChange({ ...value, config: { ...value.config, [key]: v } });

  const togglePostType = (t) => {
    const cur = value.postTypes || [];
    const next = cur.includes(t) ? cur.filter(x => x !== t) : [...cur, t];
    onChange({ ...value, postTypes: next.length ? next : ['feed'] });
  };

  return (
    <div style={{ ...CARD, border: `1.5px solid ${meta.color}44` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 20 }}>{meta.icon}</span>
        <b style={{ fontSize: 15 }}>{value._id ? 'Изменить' : 'Новая площадка'} · {meta.label}</b>
      </div>
      {meta.hint && <div style={{ fontSize: 12, color: '#8a6d00', background: '#fff8e1', padding: '9px 12px', borderRadius: 8, marginBottom: 16 }}>{meta.hint}</div>}

      <label style={L}>Название (для себя) *</label>
      <input value={value.title} onChange={e => onChange({ ...value, title: e.target.value })}
        placeholder="Например: Группа MATKASYM HOME" style={{ ...INP, marginBottom: 16 }} />

      {/* Telegram: выбор из чатов, где бота уже видели */}
      {value.platform === 'telegram' && tgChats?.length > 0 && (
        <>
          <label style={L}>Найденные чаты <span style={{ color: '#bbb', fontWeight: 400 }}>(бот уже состоит в них)</span></label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {tgChats.map(c => (
              <button key={c.chatId} onClick={() => onChange({
                ...value, config: { ...value.config, chatId: c.chatId }, title: value.title || c.title,
              })} style={{
                padding: '7px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontWeight: 600,
                border: value.config?.chatId === c.chatId ? '2px solid #229ED9' : '1.5px solid #e0e0e0',
                background: value.config?.chatId === c.chatId ? '#eaf6fd' : '#fff', color: '#333',
              }}>
                {c.title || c.chatId} <span style={{ color: '#aaa', fontWeight: 400 }}>· {c.type}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {meta.fields.map(f => (
        <div key={f.key} style={{ marginBottom: 16 }}>
          <label style={L}>{f.label}{f.required ? ' *' : ''}</label>
          <input
            value={value.config?.[f.key] || ''}
            onChange={e => setConfig(f.key, e.target.value)}
            placeholder={f.placeholder}
            style={INP}
          />
        </div>
      ))}

      {value.platform === 'instagram' && (
        <div style={{ marginBottom: 16 }}>
          <label style={L}>Виды постов</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {Object.entries(POST_TYPES).map(([key, t]) => (
              <button key={key} onClick={() => togglePostType(key)} style={{
                padding: '8px 16px', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                border: value.postTypes?.includes(key) ? '2px solid #C13584' : '1.5px solid #e0e0e0',
                background: value.postTypes?.includes(key) ? '#fdf0f7' : '#fff', color: '#333',
              }}>{t.icon} {t.label}</button>
            ))}
          </div>
        </div>
      )}

      <label style={L}>
        Свой шаблон текста <span style={{ color: '#bbb', fontWeight: 400 }}>
          (пусто = общий текст публикации. Плейсхолдеры: {'{name} {price} {specs} {sku} {text}'})
        </span>
      </label>
      <textarea
        value={value.captionTemplate || ''}
        onChange={e => onChange({ ...value, captionTemplate: e.target.value })}
        rows={3}
        placeholder={'Например:\n{name}\n{specs}\nЦена: {price}'}
        style={{ ...INP, marginBottom: 20, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
      />

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={btn('#fff', '#555')}>Отмена</button>
        <button onClick={onSave} style={{
          padding: '9px 22px', borderRadius: 9, border: 'none',
          background: meta.color, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}>Сохранить</button>
      </div>
    </div>
  );
}
