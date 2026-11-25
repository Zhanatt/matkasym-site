/**
 * Сообщение «Техлист на утверждение» из данных самих задач R&D (формат — раздел 16
 * инструкции техлистов). Данные — поля карточки задачи (блок «Пользовательские поля»:
 * UF_TL_CATEGORY, UF_TL_CLIENT, UF_TL_MANAGER, UF_TL_PRODUCT, UF_TL_PARAMS, UF_TL_QTY,
 * UF_TL_PRICE). Для старых задач — запасной вариант: строки «Подпись: значение» в описании.
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
// Значение поля карточки, иначе — строка из описания
function fieldsOf(t) {
  const d = parseDescription(t.description);
  const v = (uf, ...keys) => String(t[uf] ?? '').trim() || keys.map(k => d[k]).find(Boolean) || '';
  return {
    category: v('ufTlCategory', 'Категория'),
    client:   v('ufTlClient', 'Заказчик', 'Клиент'),
    manager:  v('ufTlManager', 'Менеджер'),
    name:     v('ufTlProduct', 'Изделие'),
    params:   v('ufTlParams', 'Параметры', 'Размеры'),
    qty:      num(v('ufTlQty', 'Количество')),
    price:    num(v('ufTlPrice', 'Цена за ед.', 'Цена')),
  };
}

function buildFromTasks(tasks, moved) {
  const f0 = fieldsOf(moved);
  const all = tasks.map(fieldsOf);
  const order = {
    category: f0.category || all.map(f => f.category).find(Boolean) || '',
    client:   f0.client || all.map(f => f.client).find(Boolean) || '',
    manager:  f0.manager || all.map(f => f.manager).find(Boolean) || '',
  };
  const problems = [];
  if (!order.category) problems.push('Категория');
  if (!order.client)   problems.push('Заказчик');
  if (!order.manager)  problems.push('Менеджер');

  const positions = tasks.map((t, i) => {
    const { name, params, qty, price } = all[i];
    const label = tasks.length > 1 ? `${name ? `«${name}»` : `задача ${t.id}`}: ` : '';
    if (!name) problems.push(`${label}Изделие`);
    if (!params) problems.push(`${label}Размеры и комплектация`);
    if (!(qty > 0)) problems.push(`${label}Количество, шт`);
    if (!(price > 0)) problems.push(`${label}Цена за 1 шт, сом`);
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
