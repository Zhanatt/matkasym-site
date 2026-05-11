const express      = require('express');
const mongoose     = require('mongoose');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const dotenv       = require('dotenv');
const path         = require('path');

dotenv.config();

const app = express();

// Middleware
app.use(cors({ origin: process.env.CLIENT_URL || '*', credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Routes
app.use('/api/products', require('./routes/products'));
app.use('/api/brands',   require('./routes/brands'));
app.use('/api/admin',    require('./routes/admin'));
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/orders',   require('./routes/orders'));
app.use('/api/catalog',  require('./routes/catalog'));  // AI-bot context API

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'OK', time: new Date() }));

// Serve React build in production
if (process.env.NODE_ENV === 'production') {
  const clientBuild = path.join(__dirname, '../client/dist');
  app.use(express.static(clientBuild));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuild, 'index.html'));
  });
}

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('✅ MongoDB подключён');

    // Migration: split onoi-sakta into SHAAR/onoi-sakta + HOME/baary-oorunda
    try {
      const Product = require('./models/Product');
      const needsMigration = await Product.exists({ set: 'onoi-sakta', fullName: /промышленный/i, brand: { $ne: 'matkasym-shaar' } });
      if (needsMigration) {
        const r1 = await Product.updateMany(
          { set: 'onoi-sakta', fullName: /промышленный/i },
          { $set: { brand: 'matkasym-shaar' } }
        );
        const r2 = await Product.updateMany(
          { set: 'onoi-sakta', fullName: { $not: /промышленный/i } },
          { $set: { brand: 'matkasym-home', set: 'baary-oorunda' } }
        );
        console.log(`✅ Migration split-onoi-sakta: shaar=${r1.modifiedCount} home=${r2.modifiedCount}`);
      }
    } catch (e) {
      console.error('⚠️ Migration split-onoi-sakta failed:', e.message);
    }

    app.listen(process.env.PORT, () =>
      console.log(`🚀 Сервер запущен на http://localhost:${process.env.PORT}`)
    );
  })
  .catch(err => {
    console.error('❌ Ошибка подключения к MongoDB:', err.message);
    process.exit(1);
  });
