/**
 * Проверка платёжной ссылки: что лежит в MBANK_PAY_URL и во что она превращается с суммой.
 *
 * Значение ссылки живёт только в переменных Render, поэтому глазами её никто не видел —
 * скрипт печатает разбор кода по тегам и готовую ссылку, которую можно открыть на телефоне
 * и убедиться, что MBank подставил сумму сам.
 *
 *   node scripts/check-mbank-pay-url.js 12500
 *   MBANK_PAY_URL='https://app.mbank.kg/qr#0002…' node scripts/check-mbank-pay-url.js 12500
 */
require('dotenv').config();
const { withAmount, parseTlv, crc16 } = require('../lib/mbankQr');

const NAMES = {
  '00': 'версия формата', '01': 'тип кода (11 многоразовый / 12 на сумму)',
  '52': 'код категории', '53': 'валюта (417 = сом)', '54': 'СУММА',
  '58': 'страна', '59': 'получатель', '60': 'город', '62': 'доп. данные', '63': 'контрольная сумма',
};

const sum = Number(process.argv[2] || 12500);
const base = (process.env.MBANK_PAY_URL || '').trim();

if (!base) {
  console.log('MBANK_PAY_URL не задана — кнопки оплаты в магазине нет.');
  process.exit(1);
}

const dump = (label, url) => {
  console.log(`\n${label}\n${url}`);
  const start = url.indexOf('000201');
  const items = start === -1 ? null : parseTlv(url.slice(start));
  if (!items) {
    console.log('  ⚠️  это не платёжный код EMV — сумму подставить нельзя, ссылка уйдёт как есть');
    return;
  }
  for (const t of items) console.log(`  ${t.id} ${NAMES[t.id] || ''}: ${t.value}`);
  const body = url.slice(start, -4);
  console.log(`  контрольная сумма ${crc16(body) === url.slice(-4) ? 'верна' : '❌ НЕ СХОДИТСЯ'}`);
};

dump('Ссылка из переменной:', base);
dump(`Ссылка для заявки на ${sum.toLocaleString('ru')} сом:`, withAmount(base, sum));
