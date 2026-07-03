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

// owner + editor
exports.editor = (req, res, next) => {
  if (!['owner', 'editor'].includes(req.user?.role)) return res.status(403).json({ message: 'Нет прав для редактирования' });
  next();
};

// owner + editor + viewer (or canViewUsers flag)
exports.viewer = (req, res, next) => {
  if (!['owner', 'editor', 'viewer'].includes(req.user?.role) && !req.user?.canViewUsers) {
    return res.status(403).json({ message: 'Доступ запрещён' });
  }
  next();
};

// owner + editor + viewer + warehouse (может видеть админку и поставщиков)
exports.warehouse = (req, res, next) => {
  if (!['owner', 'editor', 'viewer', 'navigator', 'warehouse'].includes(req.user?.role)) return res.status(403).json({ message: 'Доступ запрещён' });
  next();
};

// warehouse can receive stock (owner, editor, warehouse)
exports.canReceiveStock = (req, res, next) => {
  if (!['owner', 'editor', 'warehouse'].includes(req.user?.role)) return res.status(403).json({ message: 'Нет прав для приёма товара' });
  next();
};
