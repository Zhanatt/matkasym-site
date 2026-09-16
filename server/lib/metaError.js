/**
 * Ошибки Meta (Facebook/Instagram) человеческим языком.
 *
 * Graph отвечает англоязычной простынёй, из которой не видно, что делать:
 * «Error validating access token: The session has been invalidated because the user
 * changed their password…» — в журнале публикаций это выглядит как сбой сайта,
 * хотя лечится перевыпуском токена на странице площадок.
 *
 * Общая для Instagram и Facebook: API и ошибки у них одни и те же. Используется
 * и при проверке связи (routes/social.js), и при публикации (lib/publishers/*).
 */
const META_SCOPES = 'pages_show_list, pages_read_engagement, pages_manage_posts, '
  + 'instagram_basic, instagram_content_publish';

const REISSUE = 'Возьмите новый токен САМОЙ СТРАНИЦЫ (Graph API Explorer → GET /me/accounts) '
  + 'и вставьте его в «Изменить» на странице «Площадки».';
// То же самое серединой фразы: «…прошли проверку — возьмите новый токен…»
const reissue = REISSUE.charAt(0).toLowerCase() + REISSUE.slice(1);

function metaError(err = {}) {
  const msg     = String(err.message || '');
  const code    = Number(err.code);
  const subcode = Number(err.error_subcode);

  if (/pages_manage_posts/i.test(msg)) {
    return 'У токена нет права публиковать на странице (pages_manage_posts). Перевыпустите токен '
      + `в Graph API Explorer с разрешениями ${META_SCOPES} — и возьмите токен САМОЙ СТРАНИЦЫ `
      + '(GET /me/accounts), а не пользователя.';
  }
  if (/permission\(s\) must be granted|pages_show_list|pages_read_engagement/i.test(msg)) {
    return 'У токена нет прав на страницу. Перевыпустите его в Graph API Explorer с разрешениями '
      + `${META_SCOPES} — и возьмите токен САМОЙ СТРАНИЦЫ (GET /me/accounts), а не пользователя.`;
  }
  // 190/460 — Meta погасила сессию: сменили пароль в Facebook, вышли «со всех устройств»
  // или сработала защита аккаунта. Токен мёртв навсегда, ждать бессмысленно.
  if (subcode === 460 || /session has been invalidated|changed their password/i.test(msg)) {
    return 'Токен больше не действует: Meta погасила сессию — в Facebook сменили пароль '
      + `или сработала защита аккаунта. ${REISSUE}`;
  }
  if (subcode === 463 || /expired|Session has expired/i.test(msg)) {
    return `Токен истёк. ${REISSUE}`;
  }
  // 190/459 — аккаунт под проверкой Facebook («checkpoint»). Перевыпуск токена
  // здесь не помогает: новый выдадут с той же блокировкой, и раньше эта ошибка
  // уводила в бесконечный круг — брали токен заново и получали то же самое.
  // Сначала проверку надо пройти в браузере, и только потом перевыпускать.
  if (subcode === 459 || /till you log in to www\.facebook\.com/i.test(msg)) {
    return 'Facebook закрыл доступ приложению: аккаунт под проверкой безопасности. '
      + 'Зайдите на facebook.com с того аккаунта, которым выдавали токен, и пройдите проверку, '
      + 'которую он покажет (подтверждение личности, пароль, вход с устройства). '
      + `Перевыпускать токен до этого бесполезно — новый придёт с той же блокировкой. Прошли — ${reissue}`;
  }
  // 190/464 — аккаунт не подтверждён: Facebook не пускает его в приложения вообще.
  if (subcode === 464 || /not a confirmed user/i.test(msg)) {
    return 'Facebook не пускает этот аккаунт в приложения: он не подтверждён. '
      + `Подтвердите аккаунт на facebook.com (почта или телефон), потом ${reissue}`;
  }
  if (code === 190) {
    return `Токен недействителен: ${msg} ${REISSUE}`;
  }
  return msg || 'Meta API error';
}

module.exports = { metaError, META_SCOPES };
