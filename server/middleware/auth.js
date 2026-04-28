const jwt  = require('jsonwebtoken');
const User = require('../models/User');

// Protect route — requires valid JWT
exports.protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Не авторизован' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user) return res.status(401).json({ message: 'Пользователь не найден' });
    next();
  } catch {
    res.status(401).json({ message: 'Недействительный токен' });
  }
};

// owner + admin only (user management, sensitive ops)
exports.admin = (req, res, next) => {
  if (!['owner', 'admin'].includes(req.user?.role)) {
    return res.status(403).json({ message: 'Доступ запрещён' });
  }
  next();
};

// owner + admin + editor (can create/edit/delete products & brands)
exports.editor = (req, res, next) => {
  if (!['owner', 'admin', 'editor'].includes(req.user?.role)) {
    return res.status(403).json({ message: 'Нет прав для редактирования' });
  }
  next();
};

// owner + admin + editor + viewer (read-only access to admin panel)
exports.viewer = (req, res, next) => {
  if (!['owner', 'admin', 'editor', 'viewer'].includes(req.user?.role)) {
    return res.status(403).json({ message: 'Доступ запрещён' });
  }
  next();
};
