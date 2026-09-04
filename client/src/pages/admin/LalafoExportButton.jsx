import { useState } from 'react';
import { socialExportLalafoSet } from '../../api';

// Выгрузка сета на доску объявлений Лалафо: xlsx в формате её импорта —
// название по-русски, характеристики и описание по-кыргызски, цена договорная,
// фото прямыми ссылками. Строки собирает сервер тем же кодом, что и объявление
// при публикации, чтобы формат не разъезжался.
export default function LalafoExportButton({ brand, set }) {
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res  = await socialExportLalafoSet(brand, set);
      const url  = URL.createObjectURL(res.data);
      const a    = document.createElement('a');
      a.href = url;
      a.download = `Lalafo_${set}.xlsx`;   // кириллица в имени уезжает процентной кодировкой
      a.click();
      URL.revokeObjectURL(url);

      // Товары без фото в файл не попадают — площадка на такой строке роняет
      // импорт целиком. Молча их терять нельзя: человек должен знать, что
      // именно не уехало и чему надо доснять фото.
      const raw = res.headers['x-lalafo-skipped'];
      const skipped = raw ? JSON.parse(decodeURIComponent(raw)) : [];
      if (skipped.length) {
        alert(
          `Файл собран, но ${skipped.length} товар(ов) в него не вошли — у них нет фото, ` +
          `а Лалафо без фото не принимает:\n\n• ${skipped.join('\n• ')}`
        );
      }
    } catch (e) {
      // Ошибку сервер шлёт JSON-ом, но responseType: 'blob' превращает её в Blob —
      // читаем текстом, иначе пользователь увидит «[object Blob]».
      let msg = e.message;
      try { msg = JSON.parse(await e.response.data.text()).message || msg; } catch { /* не JSON */ }
      alert('Не удалось выгрузить: ' + msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={run} disabled={loading} title="Выгрузить сет на Лалафо (xlsx)"
      style={{
        padding: '7px 12px', borderRadius: 9, whiteSpace: 'nowrap',
        border: '1.5px solid #e0e0e0', background: '#fff',
        color: '#555', fontSize: 12, fontWeight: 600,
        cursor: loading ? 'wait' : 'pointer',
      }}>
      {loading ? '⏳ Собираю…' : '📋 Лалафо'}
    </button>
  );
}
