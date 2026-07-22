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
app.use('/api/brands',   require('./routes/brands'));
app.use('/api/admin',    require('./routes/admin'));
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/orders',   require('./routes/orders'));
app.use('/api/catalog',  require('./routes/catalog'));  // AI-bot context API
app.use('/api/admin/social', require('./routes/social')); // автопубликации по площадкам

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'OK', time: new Date() }));

// Version endpoint — returns server start time; changes on every redeploy
const SERVER_START = Date.now().toString();
app.get('/api/version', (req, res) => res.json({ version: SERVER_START }));

// Telegram-очередь: тик планировщика по внешнему пингу (cron-job.org / UptimeRobot).
// Нужен, потому что на бесплатном Render сервис засыпает и внутренний таймер не идёт.
// Защищён ключом: ?key=CRON_KEY (или CATALOG_API_KEY как запасной).
const { tickQueue } = require('./lib/telegramQueue');
const { tickPublications } = require('./lib/socialPublish');
app.get('/api/telegram-queue/tick', async (req, res) => {
  const expected = process.env.CRON_KEY || process.env.CATALOG_API_KEY;
  if (expected && req.query.key !== expected) return res.status(403).json({ message: 'forbidden' });
  const result = await tickQueue();
  const publications = await tickPublications(); // отложенные посты и задержки узлов схемы
  res.json({ ok: true, result, publications });
});

// Telegram bot webhook
app.post('/api/telegram-webhook', async (req, res) => {
  try {
    const update = req.body || {};
    const message = update.message;

    // Запоминаем группы/каналы, где бота видели, — из них потом выбирают площадку
    // в «Автопубликациях» вместо ручного ввода chat_id.
    const anyChat = message?.chat || update.channel_post?.chat || update.my_chat_member?.chat;
    if (anyChat && ['group', 'supergroup', 'channel'].includes(anyChat.type)) {
      const { TelegramChat } = require('./models/SocialAccount');
      await TelegramChat.updateOne(
        { chatId: String(anyChat.id) },
        { $set: { title: anyChat.title || '', type: anyChat.type, seenAt: new Date() } },
        { upsert: true },
      ).catch(() => {});
    }

    if (!message) return res.sendStatus(200);

    const chatId = message.chat?.id;
    const text = message.text || '';

    // /start userId — привязка аккаунта
    if (text.startsWith('/start ')) {
      const userId = text.split(' ')[1];
      if (userId && userId.match(/^[a-f0-9]{24}$/i)) {
        const User = require('./models/User');
        const user = await User.findByIdAndUpdate(userId, { telegramChatId: String(chatId) }, { new: true });
        if (user) {
          const { sendTelegramMessage } = require('./lib/telegram');
          await sendTelegramMessage(chatId, `✅ Telegram привязан к аккаунту <b>${user.name}</b>!\n\nТеперь ты будешь получать уведомления о новостях сюда.`);
        }
      }
    }

    res.sendStatus(200);
  } catch (e) {
    console.error('[Telegram Webhook]', e.message);
    res.sendStatus(200);
  }
});

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


    // Migration: остаток, накопленный до разделения баз 1С, — это остаток Make-in.
    // Обязана пройти до первой загрузки остатков: stock считается как сумма stockByBase,
    // и без неё сумма нулей обнулила бы весь сайт.
    // Условие «все базы по нулям, а stock > 0» делает её идемпотентной: товар,
    // у которого остаток уже разложен по базам, второй раз не тронется.
    try {
      const Product = require('./models/Product');
      const r = await Product.updateMany(
        {
          stock: { $gt: 0 },
          $or: [{ stockByBase: { $exists: false } }, {
            'stockByBase.makein': { $in: [0, null] },
            'stockByBase.matkasym': { $in: [0, null] },
            'stockByBase.qtop': { $in: [0, null] },
          }],
        },
        [{ $set: { 'stockByBase.makein': '$stock' } }],
      );
      if (r.modifiedCount) console.log(`✅ Migration: stockByBase.makein проставлен у ${r.modifiedCount} товаров`);
    } catch (e) {
      console.error('⚠️ Migration stockByBase failed:', e.message);
    }

    // Migration: заявки на заказ перешли с двух статусов (active/done) на этапы.
    // Старое 'active' → 'new' (Новые заявки); 'done' остаётся.
    try {
      const ProductRequest = require('./models/ProductRequest');
      const r = await ProductRequest.updateMany({ status: 'active' }, { $set: { status: 'new' } });
      if (r.modifiedCount) console.log(`✅ Migration: заявок active→new: ${r.modifiedCount}`);
    } catch (e) {
      console.error('⚠️ Migration product-request stages failed:', e.message);
    }

    // Migration: drop old ProductReview unique index (product+frontman) to allow audit-based index
    try {
      const ProductReview = require('./models/ProductReview');
      const indexes = await ProductReview.collection.indexes();
      const oldIndex = indexes.find(idx => idx.key.product === 1 && idx.key.frontman === 1 && !idx.key.audit);
      if (oldIndex) {
        await ProductReview.collection.dropIndex(oldIndex.name);
        console.log(`✅ Migration: dropped old ProductReview index ${oldIndex.name}`);
      }
    } catch (e) {
      if (!e.message.includes('index not found')) {
        console.error('⚠️ Migration ProductReview index failed:', e.message);
      }
    }

    // Внутренний тик очереди Telegram-публикаций каждую минуту (пока сервис не спит).
    // Дублируется внешним cron-пингом /api/telegram-queue/tick для надёжности на Render free.
    setInterval(() => {
      tickQueue().catch(e => console.error('[TelegramQueue] interval tick failed:', e.message));
      tickPublications().catch(e => console.error('[socialPublish] interval tick failed:', e.message));
    }, 60 * 1000);

    app.listen(process.env.PORT, () =>
      console.log(`🚀 Сервер запущен на http://localhost:${process.env.PORT}`)
    );
  })
  .catch(err => {
    console.error('❌ Ошибка подключения к MongoDB:', err.message);
    process.exit(1);
  });
