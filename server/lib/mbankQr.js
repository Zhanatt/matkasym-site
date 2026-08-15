/**
 * Подстановка суммы в платёжную ссылку MBank.
 *
 * MBANK_PAY_URL — статическая ссылка приёма перевода: в ней зашит только получатель,
 * поэтому банк открывался с пустым полем суммы и клиент вбивал её руками (и ошибался).
 *
 * Внутри ссылки лежит платёжный код стандарта EMVCo QR: цепочка «тег(2) длина(2) значение».
 * Сумму задаёт тег 54, валюту — 53 (417 = сом), тип кода — 01 (11 многоразовый,
 * 12 одноразовый «на сумму»), последним идёт тег 63 — контрольная сумма CRC16 всего кода.
 * Меняем 54 → обязаны пересчитать 63, иначе банк скажет «неверный QR».
 *
 * Ссылку не разбираем «на удачу»: если это не EMV-код (другой формат реквизитов),
 * возвращаем исходную — кнопка оплаты работает как раньше, просто без суммы.
 */

/** CRC16-CCITT (FALSE): полином 0x1021, начальное значение 0xFFFF — как требует EMVCo. */
function crc16(str) {
  // Считаем по байтам UTF-8, а не по символам строки: в коде может стоять
  // название получателя не латиницей, и посимвольный проход дал бы другую сумму.
  const bytes = Buffer.from(str, 'utf8');
  let crc = 0xffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i] << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Разбор цепочки TLV верхнего уровня. Кривая длина или обрыв → null. */
function parseTlv(payload) {
  const out = [];
  let i = 0;
  while (i < payload.length) {
    if (i + 4 > payload.length) return null;
    const id = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(id) || !Number.isInteger(len)) return null;
    const value = payload.slice(i + 4, i + 4 + len);
    if (value.length !== len) return null;
    out.push({ id, value });
    i += 4 + len;
  }
  return out.length ? out : null;
}

const tlv = (id, value) => `${id}${String(value.length).padStart(2, '0')}${value}`;

/**
 * Сумма в формате EMV: целая — без копеек, дробная — с двумя знаками.
 * Точка, не запятая; максимум 13 символов.
 */
function formatAmount(sum) {
  const n = Math.round(Number(sum) * 100) / 100;
  const s = Number.isInteger(n) ? String(n) : n.toFixed(2);
  return s.length <= 13 ? s : '';
}

/**
 * Ссылка на оплату с уже подставленной суммой.
 * @param {string} rawUrl  значение MBANK_PAY_URL
 * @param {number} sum     сумма в сомах
 */
function withAmount(rawUrl, sum) {
  const url = String(rawUrl || '').trim();
  const amount = formatAmount(sum);
  if (!url || !amount || Number(sum) <= 0) return url;

  // Платёжный код всегда начинается с версии формата «000201», а перед ним —
  // адрес страницы банка (https://app.mbank.kg/qr#…): режем ровно по этой границе.
  const start = url.indexOf('000201');
  if (start === -1) return url;
  const prefix = url.slice(0, start);
  const items = parseTlv(url.slice(start));
  if (!items) return url;

  const byId = id => items.find(t => t.id === id);
  if (!byId('63')) return url;                 // нет контрольной суммы — код не EMV, не трогаем

  const set = (id, value) => {
    const found = byId(id);
    if (found) { found.value = value; return; }
    // Теги идут по возрастанию — вставляем на своё место, а не в конец.
    const at = items.findIndex(t => t.id > id);
    items.splice(at === -1 ? items.length : at, 0, { id, value });
  };

  set('54', amount);
  set('53', byId('53')?.value || '417');       // сом, если валюта в коде не указана
  set('01', '12');                             // код «на сумму» — одноразовый

  const body = items.filter(t => t.id !== '63').map(t => tlv(t.id, t.value)).join('');
  return `${prefix}${body}6304${crc16(`${body}6304`)}`;
}

module.exports = { withAmount, crc16, parseTlv, formatAmount };
