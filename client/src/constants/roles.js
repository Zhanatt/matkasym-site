/**
 * Роли, которым открыт вход в Продакт матрицу.
 *
 * Список ДОЛЖЕН совпадать с server/middleware/auth.js → ADMIN_ROLES.
 * Раньше он был вписан прямо в форму входа, и про него забывали:
 * роль добавляли в модель и в меню, а войти ею было нельзя — так было
 * со «Складом», потом с «Закупщиком». Добавляешь роль — правь оба места.
 */
export const ADMIN_ROLES = ['owner', 'editor', 'viewer', 'navigator', 'warehouse', 'purchaser'];

export const canEnterAdmin = role => ADMIN_ROLES.includes(role);
