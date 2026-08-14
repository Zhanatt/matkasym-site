/**
 * Проверка initData Telegram Mini App.
 *
 * Mini App отдаёт странице подписанную строку с данными пользователя (window.Telegram.WebApp.initData).
 * Подпись считается ключом, производным от токена бота, — поэтому имя и id клиента,
 * пришедшие с фронта, подделать нельзя, а значит заявку можно принимать без регистрации
 * и без капчи: за каждой стоит реальный Telegram-аккаунт.
 *
 * Алгоритм — из документации Bot API (Validating data received via the Mini App):
 *   secret = HMAC_SHA256(bot_token, "WebAppData")
 *   hash   = HMAC_SHA256(data_check_string, secret)
 * где data_check_string — все поля, кроме hash, отсортированные по имени, через \n.
 */
const crypto = require('crypto');

// Сутки: initData живёт, пока открыто окно Mini App, но старую строку могли и сохранить.
const MAX_AGE_SEC = 24 * 60 * 60;

function verifyInitData(initData, token = process.env.TELEGRAM_BOT_TOKEN) {
  if (!initData || !token) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  // signature появляется у сторонних Mini App (third-party validation) и в подпись бота не входит
  params.delete('signature');

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');

  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const calc   = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

  // Сравнение постоянного времени: длины могут не совпасть, если hash подрезали
  const a = Buffer.from(calc, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || (Date.now() / 1000 - authDate) > MAX_AGE_SEC) return null;

  let user = null;
  try { user = JSON.parse(params.get('user') || 'null'); } catch (_) {}
  if (!user?.id) return null;

  return {
    id:        String(user.id),
    username:  user.username || '',
    name:      [user.first_name, user.last_name].filter(Boolean).join(' ').trim(),
    languageCode: user.language_code || '',
    // Написать первым бот может только тому, кто сам начал с ним диалог.
    // Флаг приходит, когда Mini App открыт по прямой ссылке t.me/<bot>/<app>.
    allowsWrite: !!user.allows_write_to_pm,
    startParam:  params.get('start_param') || '',
  };
}

/**
 * Express-middleware: кладёт проверенного пользователя в req.tgUser.
 * Ничего не блокирует — решают сами роуты: каталог открыт всем, заявка требует Telegram.
 *
 * В разработке (нет NODE_ENV=production) страницу открывают в обычном браузере,
 * где initData взять негде, — там пропускаем тестового пользователя, иначе форму
 * заявки невозможно проверить локально.
 */
function tgAuth(req, _res, next) {
  const initData = req.get('X-Telegram-Init-Data') || req.body?.initData || '';
  req.tgUser = verifyInitData(initData);
  if (!req.tgUser && process.env.NODE_ENV !== 'production') {
    req.tgUser = { id: 'dev', username: 'dev', name: 'Локальный тест', allowsWrite: false, dev: true };
  }
  next();
}

module.exports = { verifyInitData, tgAuth };
