/**
 * Сообщение «Техлист на утверждение» из данных самих задач R&D (формат — раздел 16
 * инструкции техлистов). Данные берутся из описания задачи: строки «Подпись: значение»
 * (так пишет форма заявки, жирным), их можно дописать и вручную в Битриксе.
 */

const num = v => Number(String(v ?? '').replace(/[^\d.,]/g, '').replace(',', '.'));
const money = n => Math.round(n).toLocaleString('ru-RU').replace(/\s/g, ' ');
const plural = (n, one, few, many) => {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
};

// «[b]Категория:[/b] Щиты» или «Категория: Щиты» → { 'Категория': 'Щиты' }
function parseDescription(text = '') {
  const out = {};
  const plain = String(text).replace(/\[\/?b\]/gi, '');
  for (const m of plain.matchAll(/^[ \t]*([А-Яа-яЁёA-Za-z][^:\n]{1,40}?)[ \t]*:[ \t]*(.+)$/gm)) {
    const key = m[1].trim();
    if (!(key in out)) out[key] = m[2].trim();
  }
  return out;
}

const hasTechlistPdf = files => files.some(f => /\.pdf$/i.test(f.NAME || '') && /техлист|techlist/i.test(f.NAME || ''));

/**
 * tasks: [{ id, title, description, files: [{NAME}] }], moved — задача, которую перенесли.
 * Возвращает { problems: [...], message }.
 */
function buildFromTasks(tasks, moved) {
  const d0 = parseDescription(moved.description);
  const order = {
    category: d0['Категория'] || tasks.map(t => parseDescription(t.description)['Категория']).find(Boolean) || '',
    client:   d0['Заказчик'] || d0['Клиент'] || '',
    manager:  d0['Менеджер'] || '',
  };
  const problems = [];
  if (!order.category) problems.push('Категория (например «Категория: Щиты»)');
  if (!order.client)   problems.push('Заказчик');
  if (!order.manager)  problems.push('Менеджер');

  const positions = tasks.map(t => {
    const d = parseDescription(t.description);
    const name = d['Изделие'] || '';
    const params = d['Параметры'] || d['Размеры'] || '';
    const qty = num(d['Количество']);
    const price = num(d['Цена за ед.'] || d['Цена']);
    const label = name ? `«${name}»` : `задача ${t.id}`;
    if (!name) problems.push(`${label}: Изделие`);
    if (!params) problems.push(`${label}: Параметры (размеры и комплектация)`);
    if (!(qty > 0)) problems.push(`${label}: Количество`);
    if (!(price > 0)) problems.push(`${label}: Цена за ед.`);
    const fullName = params.toLowerCase().startsWith(name.toLowerCase()) ? params : `${name} ${params}`.trim();
    return { taskId: String(t.id), short: name, fullName, qty, price };
  });

  if (!hasTechlistPdf(moved.files || [])) problems.push('PDF техлиста — прикрепите к задаче файл со словом «Техлист» в названии');
  if (problems.length) return { problems, message: '' };

  const total = positions.reduce((s, p) => s + p.qty * p.price, 0);
  const items = positions.reduce((s, p) => s + p.qty, 0);
  const n = positions.length;
  const message = [
    'Техлист на утверждение', '',
    `${order.category}, ${n} ${plural(n, 'позиция', 'позиции', 'позиций')}:`,
    ...positions.map(p => ` • ${p.fullName}`), '',
    'Количество:', '', ...positions.map(p => ` • ${p.short} : ${p.qty}шт`), '',
    'Цена:', '', ...positions.map(p => ` • ${p.short} : ${money(p.price)} сом`), '',
    'Сумма по позициям:', '', ...positions.map(p => ` • ${p.short} : ${money(p.qty * p.price)} сом`), '',
    `Общая сумма: ${money(total)} сом (${items} ${plural(items, 'изделие', 'изделия', 'изделий')})`, '',
    `Менеджер: ${order.manager}`,
    `Клиент: ${order.client}`,
  ].join('\n');
  return { problems: [], message, positions };
}

module.exports = { parseDescription, buildFromTasks, hasTechlistPdf };
