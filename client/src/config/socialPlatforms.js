// Общее описание площадок автопубликации — одинаковое во всех страницах раздела:
// канвас схемы, настройки площадок, форма публикации, журнал.
export const PLATFORMS = {
  telegram: {
    label: 'Telegram',
    icon:  '✈️',
    color: '#229ED9',
    hint:  'Группа или канал. Бот должен быть добавлен туда с правом писать сообщения.',
    // Какие поля просить в форме подключения
    fields: [
      { key: 'chatId', label: 'Chat ID', placeholder: '-1001234567890', required: true },
    ],
  },
  instagram: {
    label: 'Instagram',
    icon:  '📸',
    color: '#C13584',
    hint:  'Нужен аккаунт Instagram Business, привязанная страница Facebook и долгоживущий токен доступа.',
    fields: [
      { key: 'username',    label: 'Аккаунт (для себя)', placeholder: 'matkasym.home' },
      { key: 'igUserId',    label: 'Instagram User ID',  placeholder: '17841400000000000', required: true },
      { key: 'accessToken', label: 'Access Token',       placeholder: 'EAAG...', required: true, secret: true },
    ],
  },
  facebook: {
    label: 'Facebook',
    icon:  '👍',
    color: '#1877F2',
    hint:  'Страница Facebook. Нужен токен САМОЙ страницы (GET /me/accounts) с правом pages_manage_posts — '
         + 'тот же, что и для Instagram, но с добавленным правом на публикацию. Историй у страниц через API нет.',
    fields: [
      { key: 'pageName',    label: 'Страница (для себя)', placeholder: 'Matkasym Home' },
      { key: 'pageId',      label: 'Page ID',             placeholder: '489438164253110', required: true },
      { key: 'accessToken', label: 'Access Token',        placeholder: 'EAAG...', required: true, secret: true },
    ],
  },
  site: {
    label: 'Сайт',
    icon:  '🌐',
    color: '#267846',
    hint:  'Лента новостей самой матрицы (/admin/news) — пост увидят все сотрудники. Настраивать нечего.',
    fields: [],
  },
  bitrix24: {
    label: 'Битрикс24',
    icon:  '🅱️',
    color: '#0B66C3',
    hint:  'Публикация в живую ленту. Используется тот же вебхук, что и синхронизация каталога.',
    fields: [
      { key: 'dest', label: 'Кому видно', placeholder: 'UA — вся компания, SG12 — группа, U7 — сотрудник' },
    ],
  },
};

// Виды постов: пока различаются только у Instagram (обычный пост и история).
export const POST_TYPES = {
  feed:  { label: 'Пост',    icon: '🖼' },
  story: { label: 'История', icon: '⚡' },
};

export const platformMeta = (p) => PLATFORMS[p] || { label: p, icon: '•', color: '#888', fields: [] };
