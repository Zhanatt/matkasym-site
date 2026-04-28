const router  = require('express').Router();
const jwt     = require('jsonwebtoken');
const User    = require('../models/User');
const { protect } = require('../middleware/auth');
const crypto  = require('crypto');
const { sendApprovalRequest, sendApproved, sendRejected, sendPasswordReset } = require('../lib/mailer');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: 'Заполните все поля' });

    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ message: 'Email уже используется' });

    const user = await User.create({ name, email, password, phone, isPending: true });

    // Notify admin for approval
    try {
      await sendApprovalRequest({ newUser: user });
    } catch (e) {
      console.error('Mailer error:', e.message);
    }

    res.status(201).json({ pending: true, message: 'Запрос отправлен. Ожидайте подтверждения администратора.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: 'Введите email и пароль' });

    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ message: 'Неверный email или пароль' });

    if (user.isPending)
      return res.status(403).json({ message: 'Ваш аккаунт ожидает подтверждения администратора.' });

    const token = signToken(user._id);
    res.json({ token, user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/auth/approve/:id — admin clicks link in email
router.get('/approve/:id', async (req, res) => {
  try {
    const secret = req.query.secret;
    if (secret !== process.env.JWT_SECRET.slice(0, 12))
      return res.status(403).send('Недействительная ссылка');

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role: 'admin', isPending: false },
      { new: true }
    );
    if (!user) return res.status(404).send('Пользователь не найден');

    try { await sendApproved({ toEmail: user.email, toName: user.name }); } catch (e) {}

    res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:60px">
        <h2 style="color:#2d7a3a">✓ Доступ подтверждён</h2>
        <p>${user.name} (${user.email}) теперь может войти в Продакт матрицу.</p>
      </body></html>
    `);
  } catch (err) {
    res.status(500).send('Ошибка: ' + err.message);
  }
});

// GET /api/auth/reject/:id
router.get('/reject/:id', async (req, res) => {
  try {
    const secret = req.query.secret;
    if (secret !== process.env.JWT_SECRET.slice(0, 12))
      return res.status(403).send('Недействительная ссылка');

    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).send('Пользователь не найден');

    try { await sendRejected({ toEmail: user.email, toName: user.name }); } catch (e) {}

    res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:60px">
        <h2 style="color:#c0392b">✕ Запрос отклонён</h2>
        <p>Аккаунт ${user.email} удалён.</p>
      </body></html>
    `);
  } catch (err) {
    res.status(500).send('Ошибка: ' + err.message);
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Введите email' });

    const user = await User.findOne({ email });
    // Always return success so as not to reveal if email exists
    if (!user) return res.json({ message: 'Если такой email зарегистрирован, письмо отправлено.' });

    const token = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken   = crypto.createHash('sha256').update(token).digest('hex');
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour
    await user.save({ validateBeforeSave: false });

    const SITE_URL = process.env.SITE_URL || 'https://matkasym-site.onrender.com';
    const resetLink = `${SITE_URL}/admin/reset-password/${token}`;

    try {
      await sendPasswordReset({ toEmail: user.email, toName: user.name, resetLink });
    } catch (e) {
      console.error('Mailer error:', e.message);
      user.resetPasswordToken   = undefined;
      user.resetPasswordExpires = undefined;
      await user.save({ validateBeforeSave: false });
      return res.status(500).json({ message: 'Ошибка отправки письма. Проверьте настройки почты.' });
    }

    res.json({ message: 'Если такой email зарегистрирован, письмо отправлено.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/reset-password/:token
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6)
      return res.status(400).json({ message: 'Пароль должен быть минимум 6 символов' });

    const hashed = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const user = await User.findOne({
      resetPasswordToken:   hashed,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) return res.status(400).json({ message: 'Ссылка недействительна или истекла' });

    user.password             = password;
    user.resetPasswordToken   = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: 'Пароль успешно изменён. Теперь можете войти.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/auth/me
router.get('/me', protect, (req, res) => {
  res.json({ user: req.user });
});

// PATCH /api/auth/me
router.patch('/me', protect, async (req, res) => {
  try {
    const { name, phone, address } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user._id, { name, phone, address }, { new: true, runValidators: true }
    );
    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/favorites/:id
router.post('/favorites/:id', protect, async (req, res) => {
  try {
    const user  = await User.findById(req.user._id);
    const prodId = req.params.id;
    const idx   = user.favorites.indexOf(prodId);
    if (idx === -1) user.favorites.push(prodId);
    else user.favorites.splice(idx, 1);
    await user.save();
    res.json({ favorites: user.favorites });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
