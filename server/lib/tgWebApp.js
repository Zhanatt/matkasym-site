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

/**
 * Разбор с причиной отказа: → { user } либо { reason }.
 * Причина нужна снаружи — «заявка не отправляется» без неё превращается в гадание
 * между «не долетел заголовок», «на сервере токен другого бота» и «данные просрочены».
 */
function checkInitData(initData, token = process.env.TELEGRAM_BOT_TOKEN) {
  if (!initData) return { reason: 'no_init_data' };
  if (!token)    return { reason: 'no_bot_token' };

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { reason: 'no_hash' };
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
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { reason: 'bad_hash' };

  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || (Date.now() / 1000 - authDate) > MAX_AGE_SEC) return { reason: 'expired' };

  let user = null;
  try { user = JSON.parse(params.get('user') || 'null'); } catch (_) {}
  if (!user?.id) return { reason: 'no_user' };

  return {
    user: {
      id:        String(user.id),
      username:  user.username || '',
      name:      [user.first_name, user.last_name].filter(Boolean).join(' ').trim(),
      languageCode: user.language_code || '',
      // Написать первым бот может только тому, кто сам начал с ним диалог.
      // Флаг приходит, когда Mini App открыт по прямой ссылке t.me/<bot>/<app>.
      allowsWrite: !!user.allows_write_to_pm,
      startParam:  params.get('start_param') || '',
    },
  };
}

const verifyInitData = (initData, token) => checkInitData(initData, token).user || null;

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
  const res = checkInitData(initData);
  req.tgUser = res.user || null;
  req.tgReason = res.reason || '';
  if (!req.tgUser) {
    console.warn(`[tgAuth] отказ: ${req.tgReason} (initData ${initData.length} символов)`);
    if (process.env.NODE_ENV !== 'production') {
      req.tgUser = { id: 'dev', username: 'dev', name: 'Локальный тест', allowsWrite: false, dev: true };
    }
  }
  next();
}

module.exports = { verifyInitData, checkInitData, tgAuth };
