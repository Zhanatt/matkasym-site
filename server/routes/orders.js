const router  = require('express').Router();
const Order   = require('../models/Order');
const Product = require('../models/Product');
const { protect } = require('../middleware/auth');

// POST /api/orders — create order
router.post('/', protect, async (req, res) => {
  try {
    const { items, address, paymentMethod = 'kaspi' } = req.body;
    if (!items || !items.length) return res.status(400).json({ message: 'Корзина пуста' });

    // Verify prices from DB
    let total = 0;
    const orderItems = [];
    for (const item of items) {
      const product = await Product.findById(item.product);
      if (!product) return res.status(404).json({ message: `Товар ${item.product} не найден` });
      orderItems.push({ product: product._id, name: product.fullName, price: product.price, qty: item.qty });
      total += product.price * item.qty;
    }

    const order = await Order.create({
      user: req.user._id,
      items: orderItems,
      total,
      address,
      paymentMethod,
    });

    res.status(201).json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/orders/my — current user's orders
router.get('/my', protect, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/orders/:id
router.get('/:id', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('user', 'name email');
    if (!order) return res.status(404).json({ message: 'Заказ не найден' });
    if (order.user._id.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Нет доступа' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
