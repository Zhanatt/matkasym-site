/**
 * Роли, которым открыт вход в Продакт матрицу.
 *
 * Список ДОЛЖЕН совпадать с server/middleware/auth.js → ADMIN_ROLES.
 * Раньше он был вписан прямо в форму входа, и про него забывали:
 * роль добавляли в модель и в меню, а войти ею было нельзя — так было
 * со «Складом», потом с «Закупщиком». Добавляешь роль — правь оба места.
 *
 * На клиенте единственный источник правды — этот файл. AdminLogin и
 * AdminLayout ходят сюда через canEnterAdmin(); свои копии списка
 * заводить нельзя (у AdminLayout была своя — из-за неё «Закупщик»
 * логинился, но тут же выкидывался обратно на форму входа).
 */
export const ADMIN_ROLES = ['owner', 'editor', 'viewer', 'navigator', 'warehouse', 'purchaser', 'designer', 'konstruktor'];

export const canEnterAdmin = role => ADMIN_ROLES.includes(role);

/**
 * Конструктор видит в Продакт матрице только «Каталог» (на чтение) и «Чертежи».
 * Остальные страницы AdminLayout ему не открывает.
 */
export const KONSTRUKTOR = 'konstruktor';
export const KONSTRUKTOR_PATHS = [
  '/admin/drawings', '/admin/sets', '/admin/all-catalog', '/admin/no-set', '/admin/nomenclature',
];
export const konstruktorCanOpen = path =>
  KONSTRUKTOR_PATHS.some(p => path === p || path.startsWith(p + '/')) ||
  /^\/admin\/products\/[^/]+\/?$/.test(path) && !path.startsWith('/admin/products/new');

/** Чертежи видят только конструкторы и владелец (server: DRAWING_ROLES). */
export const DRAWING_ROLES = ['owner', KONSTRUKTOR];

/**
 * Роли, которым можно править каталог: заводить и удалять товары, менять
 * порядок категорий и карточек в сете. Совпадает с middleware `editor`
 * на сервере (server/middleware/auth.js) — сервер всё равно проверит сам,
 * но кнопку, которая заведомо кончится ошибкой 403, показывать нельзя.
 *
 * Список держим здесь, а не копией в каждой странице: копии уже расходились
 * (см. историю с «Закупщиком» выше).
 */
export const EDITOR_ROLES = ['owner', 'editor', 'designer'];

export const canEditCatalog = role => EDITOR_ROLES.includes(role);

/**
 * Кто может выгружать сет на Лалафо. Файл уходит на внешнюю площадку от лица
 * компании, поэтому доступ точечный: владелец, дизайнеры и назначенные флагом
 * (canExportLalafo), а не вся роль editor — редакторов несколько.
 * Совпадает с middleware canExportLalafo на сервере.
 */
export const canExportLalafo = user =>
  ['owner', 'designer'].includes(user?.role) || !!user?.canExportLalafo;
