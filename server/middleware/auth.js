const jwt  = require('jsonwebtoken');
const User = require('../models/User');

// Protect route — checks Bearer header first, then auth_token cookie
exports.protect = async (req, res, next) => {
  let token;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies?.auth_token) {
    token = req.cookies.auth_token;
    req.authViaCookie = true; // flag so /me can return a fresh token
  }

  if (!token) return res.status(401).json({ message: 'Не авторизован' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user) return res.status(401).json({ message: 'Пользователь не найден' });
    if (req.user.role === 'banned') return res.status(403).json({ message: 'У вас нет доступа к этой базе' });
    next();
  } catch {
    res.status(401).json({ message: 'Недействительный токен' });
  }
};

// owner only
exports.admin = (req, res, next) => {
  if (req.user?.role !== 'owner') return res.status(403).json({ message: 'Доступ запрещён' });
  next();
};

// owner + editor + designer (дизайнер правит и публикует товары наравне с редактором)
exports.editor = (req, res, next) => {
  if (!['owner', 'editor', 'designer'].includes(req.user?.role)) return res.status(403).json({ message: 'Нет прав для редактирования' });
  next();
};

// Выгрузка на Лалафо: владелец, дизайнеры и точечно назначенные (canExportLalafo).
// Роль editor сюда НЕ входит целиком — редакторов несколько, а доступ дан одному.
exports.canExportLalafo = (req, res, next) => {
  if (['owner', 'designer'].includes(req.user?.role) || req.user?.canExportLalafo) return next();
  res.status(403).json({ message: 'Нет прав на выгрузку в Лалафо' });
};

// owner + editor + designer + viewer (or canViewUsers flag)
exports.viewer = (req, res, next) => {
  if (!['owner', 'editor', 'designer', 'viewer'].includes(req.user?.role) && !req.user?.canViewUsers) {
    return res.status(403).json({ message: 'Доступ запрещён' });
  }
  next();
};

// Роли, которым открыт вход в Продакт матрицу.
// Список ДОЛЖЕН совпадать с client/src/constants/roles.js → ADMIN_ROLES:
// иначе роль заходит на сервер, но форма входа её не пускает (так было со «Складом»,
// потом с «Закупщиком»). Добавляешь роль — правь оба места.
const ADMIN_ROLES = ['owner', 'editor', 'viewer', 'navigator', 'warehouse', 'purchaser', 'designer', 'konstruktor'];
exports.ADMIN_ROLES = ADMIN_ROLES;

// Чертежи — только владелец и конструкторы. Остальные роли админки их не видят.
// Конструктор при этом в ADMIN_ROLES: ему нужен каталог на чтение (править товары
// не даёт middleware editor), а в меню у него только «Каталог» и «Чертежи».
const DRAWING_ROLES = ['owner', 'konstruktor'];
exports.DRAWING_ROLES = DRAWING_ROLES;
exports.drawings = (req, res, next) => {
  if (!DRAWING_ROLES.includes(req.user?.role)) return res.status(403).json({ message: 'Чертежи доступны только конструкторам' });
  next();
};

exports.warehouse = (req, res, next) => {
  if (!ADMIN_ROLES.includes(req.user?.role)) return res.status(403).json({ message: 'Доступ запрещён' });
  next();
};

// warehouse can receive stock (owner, editor, warehouse)
exports.canReceiveStock = (req, res, next) => {
  if (!['owner', 'editor', 'warehouse'].includes(req.user?.role)) return res.status(403).json({ message: 'Нет прав для приёма товара' });
  next();
};

// Обзор буферного запаса открыт всем, кто вообще пущен в админку (ADMIN_ROLES).
// Зоны разделяют только адресатов алертов, не право видеть страницу.
// Менять буфер — отдельное право (canSetBufferStock), оно здесь не при чём.
exports.canViewBufferStock = (req, res, next) => {
  if (ADMIN_ROLES.includes(req.user?.role)) return next();
  res.status(403).json({ message: 'Нет доступа к буферному запасу' });
};
