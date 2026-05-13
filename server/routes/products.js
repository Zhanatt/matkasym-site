const router  = require('express').Router();
const Product = require('../models/Product');

// GET /api/products — list with filters & pagination
router.get('/', async (req, res) => {
  try {
    const { category, search, sort = 'createdAt', page = 1, limit = 20, inStock, set, setLevel, brand, color } = req.query;
    const filter = {};

    if (category) filter.category = category;
    if (set)      filter.set = set;
    if (setLevel) filter.setLevel = setLevel;
    if (brand)    filter.brand = brand;
    if (color)    filter.color = color;
    if (inStock === 'true') filter.inStock = true;
    if (search) filter.$or = [
      { name:     { $regex: search, $options: 'i' } },
      { fullName: { $regex: search, $options: 'i' } },
      { tags:     { $regex: search, $options: 'i' } },
    ];

    const sortMap = {
      price_asc:  { price:  1 },
      price_desc: { price: -1 },
      rating:     { rating: -1 },
      newest:     { createdAt: -1 },
      stock_desc: { stock: -1, createdAt: -1 },
      stock_asc:  { stock:  1, createdAt: -1 },
    };
    const sortObj = sortMap[sort] || { stock: -1, createdAt: -1 };

    const skip  = (Number(page) - 1) * Number(limit);
    const total = await Product.countDocuments(filter);
    const products = await Product.find(filter).sort(sortObj).skip(skip).limit(Number(limit));

    res.json({ products, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/products/categories — list all categories with counts
router.get('/categories', async (req, res) => {
  try {
    const cats = await Product.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort:  { _id: 1 } },
    ]);
    res.json(cats);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/products/:id
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Товар не найден' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
