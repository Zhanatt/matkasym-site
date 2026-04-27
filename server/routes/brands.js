const router = require('express').Router();
const Brand  = require('../models/Brand');

// GET /api/brands — все бренды
router.get('/', async (req, res) => {
  try {
    const brands = await Brand.find().sort('order');
    res.json(brands);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/brands/:key — один бренд со всеми сетами
router.get('/:key', async (req, res) => {
  try {
    const brand = await Brand.findOne({ key: req.params.key });
    if (!brand) return res.status(404).json({ error: 'Бренд не найден' });
    res.json(brand);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
