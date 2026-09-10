import { useState } from 'react';
import { adminGetTechSheetFile } from '../../api';

/**
 * Блок «Технический лист»: два поля таблицы согласования и скачивание.
 * Менеджера и заказчика вписывают перед отправкой клиенту, поэтому проще
 * ввести их здесь, чем править PDF руками. Пустые поля — скачивается оригинал.
 */

const FIELDS = [
  { key: 'manager',  label: 'Менеджер',  placeholder: 'Фамилия и имя' },
  { key: 'customer', label: 'Заказчик',  placeholder: 'Компания или ФИО' },
];

const inputStyle = {
  width: '100%', padding: '8px 11px', borderRadius: 10,
  border: '1.5px solid #bfdbfe', background: '#fff',
  fontSize: 13, color: '#111', outline: 'none',
};

const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  return b === 1 ? one : many;
};

function saveBlob(bytes, filename) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export default function TechSheetDownload({ productId, files = [], productName = 'techsheet' }) {
  const [values, setValues] = useState({ manager: '', customer: '' });
  const [busy,   setBusy]   = useState(null);
  const [note,   setNote]   = useState('');

  const hasValues = FIELDS.some(f => values[f.key].trim());

  async function handleDownload(idx) {
    if (busy !== null) return;
    setBusy(idx);
    setNote('');
    try {
      const res  = await adminGetTechSheetFile(productId, idx);
      const raw  = files[idx]?.name || productName;
      const name = /\.pdf$/i.test(raw) ? raw : `${raw}.pdf`;

      if (!hasValues) {
        saveBlob(res.data, name);
        return;
      }

      // Разбор PDF тянет за собой pdf-lib — грузим его только когда правда нужен
      const { signTechSheet } = await import('./techSheetSign');
      const { bytes, filled, overflow } = await signTechSheet(res.data, values);

      // Длинный текст в ячейку не влезает — файл не отдаём, а говорим, сколько
      // символов туда помещается: иначе подпись пришлось бы печатать нечитаемой.
      if (overflow.length) {
        setNote(overflow.map(o => {
          const label = FIELDS.find(f => f.key === o.key).label;
          return `«${label}» не помещается в ячейку: максимум ${o.max} ${plural(o.max, 'символ', 'символа', 'символов')}, сейчас ${o.length}`;
        }).join('. '));
        return;
      }

      saveBlob(bytes, name);

      const asked = FIELDS.filter(f => values[f.key].trim()).map(f => f.key);
      const missed = asked.filter(k => !filled.includes(k));
      if (filled.length === 0) {
        setNote('Таблицу согласования на листе найти не удалось — скачан оригинал без подписей.');
      } else if (missed.length) {
        setNote(`Вписано не всё: не нашлась строка «${FIELDS.find(f => f.key === missed[0]).label}».`);
      }
    } catch (e) {
      console.error('Tech sheet download error:', e);
      // Причина нужна прямо в интерфейсе: консоль на рабочем месте никто не откроет
      setNote(`Не удалось скачать техлист: ${e?.message || 'неизвестная ошибка'}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        {FIELDS.map(f => (
          <label key={f.key} style={{ flex: '1 1 190px', minWidth: 160 }}>
            <span style={{ display: 'block', fontSize: 12, color: '#7aa5d8', marginBottom: 5 }}>{f.label}</span>
            <input
              value={values[f.key]}
              onChange={e => { setValues(v => ({ ...v, [f.key]: e.target.value })); setNote(''); }}
              placeholder={f.placeholder}
              style={inputStyle}
            />
          </label>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {files.map((f, i) => (
          <button key={i} onClick={() => handleDownload(i)} disabled={busy !== null}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '9px 16px', borderRadius: 11, border: 'none',
              background: '#1d4ed8', color: '#fff',
              fontSize: 13.5, fontWeight: 700,
              cursor: busy !== null ? 'wait' : 'pointer',
            }}>
            {busy === i ? '⏳ Готовлю…' : `⬇ Скачать PDF${files.length > 1 ? ` (${i + 1})` : ''}`}
          </button>
        ))}
      </div>

      <div style={{ fontSize: 12, color: note ? '#b45309' : '#7aa5d8', marginTop: 9 }}>
        {note || (hasValues
          ? 'Подписи впишутся в таблицу согласования на листе.'
          : 'Заполните поля — они впишутся в таблицу согласования.')}
      </div>
    </>
  );
}
