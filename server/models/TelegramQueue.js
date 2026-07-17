const mongoose = require('mongoose');

// Один отложенный пост в очереди публикаций Telegram-канала.
// Текст (caption) и фото фиксируются в момент добавления в очередь — снимок,
// чтобы дальнейшие правки товара не меняли уже запланированный пост.
const itemSchema = new mongoose.Schema({
  product:     { type: mongoose.Schema.Types.ObjectId, ref: 'Product' }, // ссылка (может стать null, если товар удалят)
  productName: { type: String, default: '' },   // снимок названия — для списка в UI
  caption:     { type: String, default: '' },    // HTML-текст поста (авто-черновик)
  photoUrl:    { type: String, default: '' },    // обложка (пустая = без фото)
  status:      { type: String, enum: ['pending', 'publishing', 'published', 'failed'], default: 'pending' },
  order:       { type: Number, default: 0 },      // позиция в очереди (FIFO)
  publishedAt: { type: Date },
  error:       { type: String, default: '' },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

itemSchema.index({ status: 1, order: 1 });

// Настройки очереди — singleton-документ (key: 'default').
// Часы окна публикации хранятся по местному времени Кыргызстана (UTC+6).
const configSchema = new mongoose.Schema({
  key:             { type: String, unique: true, default: 'default' },
  active:          { type: Boolean, default: false },  // очередь запущена/на паузе
  intervalMinutes: { type: Number, default: 180 },      // интервал между постами
  windowStartHour: { type: Number, default: 9 },        // окно публикации: с (час KG)
  windowEndHour:   { type: Number, default: 21 },       // окно публикации: до (час KG)
  nextAt:          { type: Date },                       // когда должен выйти следующий пост (UTC)
  lastPublishedAt: { type: Date },
}, { timestamps: true });

const TelegramQueue       = mongoose.model('TelegramQueue', itemSchema);
const TelegramQueueConfig = mongoose.model('TelegramQueueConfig', configSchema);

module.exports = { TelegramQueue, TelegramQueueConfig };
