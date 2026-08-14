const express      = require('express');
const mongoose     = require('mongoose');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const compression  = require('compression');
const dotenv       = require('dotenv');
const path         = require('path');

dotenv.config();

const app = express();

// Middleware
// Сжатие обязательно: клиентский бандл — 3,4 МБ одним файлом, и без gzip каждый
// заход на сайт съедал столько же трафика. На бесплатном тарифе Render (5 ГБ/мес)
// это выбирало лимит за считанные дни. С gzip те же 3,4 МБ едут примерно как 1 МБ.
app.use(compression());
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

// Автопубликации: тик планировщика по внешнему пингу (cron-job.org / UptimeRobot).
// Нужен, потому что на бесплатном Render сервис засыпает и внутренний таймер не идёт.
// Защищён ключом: ?key=CRON_KEY (или CATALOG_API_KEY как запасной).
// Старый путь /api/telegram-queue/tick оставлен алиасом — на него настроен внешний cron.
const { tickPublications } = require('./lib/socialPublish');
app.get(['/api/cron/tick', '/api/telegram-queue/tick'], async (req, res) => {
  const expected = process.env.CRON_KEY || process.env.CATALOG_API_KEY;
  if (expected && req.query.key !== expected) return res.status(403).json({ message: 'forbidden' });
  const publications = await tickPublications(); // отложенные посты и задержки узлов схемы
  // Напоминание владельцу, если выгрузку остатков сегодня так и не прислали
  const { remindIfNoStockToday } = require('./lib/stockBot');
  const stockReminder = await remindIfNoStockToday().catch(e => {
    console.error('[stockBot] reminder failed:', e.message);
    return null;
  });
  res.json({ ok: true, publications, stockReminder });
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

    // Выгрузка остатков из 1С файлом. Отвечаем Telegram'у сразу: загрузка идёт
    // дольше таймаута вебхука, и он прислал бы тот же файл повторно.
    if (message.document) {
      res.sendStatus(200);
      const { handleStockDocument } = require('./lib/stockBot');
      handleStockDocument(message).catch(e => console.error('[stockBot]', e.message));
      return;
    }

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
  // В именах файлов сборки есть хеш (index-DC_VoRZH.js), поэтому их можно кэшировать
  // навсегда: после нового деплоя имя другое и браузер скачает новое сам.
  // Раньше кэш-заголовков не было — при каждом обновлении версии всё качалось заново.
  app.use(express.static(clientBuild, {
    setHeaders: (res, filePath) => {
      // Vite кладёт в assets/ только файлы с хешем в имени (index-Dtiv0LFe.js)
      if (/[\\/]assets[\\/]/.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }));
  app.get('*', (req, res) => {
    // index.html кэшировать нельзя: в нём ссылки на файлы сборки
    res.setHeader('Cache-Control', 'no-cache');
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

    // Внутренний тик автопубликаций каждую минуту (пока сервис не спит).
    // Дублируется внешним cron-пингом /api/cron/tick для надёжности на Render free.
    setInterval(() => {
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
