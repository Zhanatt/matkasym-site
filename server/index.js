const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

// Middleware
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());

// Routes
app.use('/api/products', require('./routes/products'));
app.use('/api/brands',   require('./routes/brands'));
app.use('/api/admin',    require('./routes/admin'));
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/orders',   require('./routes/orders'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'OK', time: new Date() }));

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB подключён');
    app.listen(process.env.PORT, () =>
      console.log(`🚀 Сервер запущен на http://localhost:${process.env.PORT}`)
    );
  })
  .catch(err => {
    console.error('❌ Ошибка подключения к MongoDB:', err.message);
    process.exit(1);
  });
