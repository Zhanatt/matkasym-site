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
export const ADMIN_ROLES = ['owner', 'editor', 'viewer', 'navigator', 'warehouse', 'purchaser', 'designer'];

/**
 * Конструктор входит в Продакт матрицу, но видит только «Чертежи». На сервере
 * его нет в ADMIN_ROLES намеренно (там этот список открывает почти весь API) —
 * чертежи проверяет отдельный middleware `drawings`.
 */
export const KONSTRUKTOR = 'konstruktor';
export const ENTER_ROLES = [...ADMIN_ROLES, KONSTRUKTOR];

export const canEnterAdmin = role => ENTER_ROLES.includes(role);

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
