/**
 * Диагностика отправки почты (Resend).
 *
 * Запуск:
 *   node testMail.js you@example.com
 *
 * Где you@example.com — адрес, на который пробуем отправить письмо.
 * Скрипт читает те же переменные окружения, что и рабочий сервер
 * (RESEND_API_KEY, FROM_EMAIL, SITE_URL), поэтому запускать надо
 * там, где эти переменные заданы (на Render — в Shell, либо локально
 * с production-ключом в .env).
 */
require('dotenv').config();
const { Resend } = require('resend');

const to = process.argv[2];

const KEY  = process.env.RESEND_API_KEY;
const FROM = process.env.FROM_EMAIL || 'onboarding@resend.dev';
const SITE = process.env.SITE_URL || 'https://matkasym-site.onrender.com';

console.log('--- Конфигурация почты ---');
console.log('RESEND_API_KEY:', KEY ? `задан (${KEY.slice(0, 6)}…)` : '❌ НЕ ЗАДАН');
console.log('FROM_EMAIL    :', FROM, FROM === 'onboarding@resend.dev' ? '⚠️  дефолтный — можно слать ТОЛЬКО на email владельца аккаунта Resend' : '');
console.log('SITE_URL      :', SITE);
console.log('--------------------------');

if (!KEY) {
  console.error('\n❌ RESEND_API_KEY не задан. Добавьте его в переменные окружения (Render → Environment).');
  process.exit(1);
}
if (!to) {
  console.error('\nУкажите email получателя:  node testMail.js you@example.com');
  process.exit(1);
}

(async () => {
  const resend = new Resend(KEY);
  console.log(`\nПробую отправить тестовое письмо на: ${to} …`);
  const { data, error } = await resend.emails.send({
    from: `Продакт матрица <${FROM}>`,
    to,
    subject: 'Тест отправки почты — Продакт матрица',
    html: '<p>Если вы это читаете — отправка почты работает ✅</p>',
  });

  if (error) {
    console.error('\n❌ Resend вернул ошибку:');
    console.error(JSON.stringify(error, null, 2));
    console.error('\nЧастые причины:');
    console.error(' • "You can only send testing emails to your own email" →');
    console.error('   домен не подтверждён. Нужно подтвердить свой домен в Resend и');
    console.error('   выставить FROM_EMAIL на адрес вида noreply@ваш-домен.');
    console.error(' • 401/403 → неверный или отозванный RESEND_API_KEY.');
    process.exit(1);
  }

  console.log('\n✅ Письмо принято Resend. ID:', data?.id);
  console.log('Проверьте входящие (и «Спам») у', to);
})();
