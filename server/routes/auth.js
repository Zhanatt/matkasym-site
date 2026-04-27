const router = require('express').Router();
const jwt    = require('jsonwebtoken');
const User   = require('../models/User');
const { protect } = require('../middleware/auth');

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

    const user = await User.create({ name, email, password, phone });
    const token = signToken(user._id);
    res.status(201).json({ token, user });
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

    const token = signToken(user._id);
    res.json({ token, user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/auth/me
router.get('/me', protect, (req, res) => {
  res.json({ user: req.user });
});

// PATCH /api/auth/me — update profile
router.patch('/me', protect, async (req, res) => {
  try {
    const { name, phone, address } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { name, phone, address },
      { new: true, runValidators: true }
    );
    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/favorites/:id — toggle favorite
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
