const mongoose = require('mongoose');

// Подключённая площадка для автопубликации: Telegram-группа/канал, Instagram-аккаунт,
// лента Битрикс24. Одна запись = одна точка, куда может уйти пост.
//
// Секреты (Instagram access token) лежат здесь же в config — как и вебхук Битрикса
// в utils/bitrix24.js. Наружу они не отдаются: toPublicJSON() маскирует их.
const accountSchema = new mongoose.Schema({
  platform: { type: String, enum: ['telegram', 'instagram', 'bitrix24'], required: true },
  title:    { type: String, required: true },   // человеческое имя: «Группа HOME», «@matkasym.home»
  enabled:  { type: Boolean, default: true },

  // Платформенные настройки:
  //  telegram  — { chatId }                          (бот должен быть в группе/канале, с правом писать)
  //  instagram — { igUserId, accessToken, username }  (IG Business + долгоживущий токен)
  //  bitrix24  — { dest }                             (dest: 'UA' = вся компания, либо 'SG42' и т.п.)
  config: { type: mongoose.Schema.Types.Mixed, default: {} },

  // Instagram: какие виды постов разрешены этому аккаунту (обычный пост / история).
  // Для остальных платформ поле не используется.
  postTypes: { type: [String], default: ['feed'] },

  // Свой шаблон текста. Пусто — берётся общий текст публикации.
  // Плейсхолдеры: {name} {price} {sku} {specs} {set} {brand} {text} {link}
  captionTemplate: { type: String, default: '' },

  lastPublishedAt: { type: Date },
  lastError:       { type: String, default: '' },
}, { timestamps: true });

// Наружу секреты не уходят: вместо токена отдаём только признак «задан».
accountSchema.methods.toPublicJSON = function () {
  const o = this.toObject();
  const cfg = { ...(o.config || {}) };
  if (cfg.accessToken) cfg.accessToken = '••••' + String(cfg.accessToken).slice(-4);
  return { ...o, config: cfg, hasToken: !!(this.config || {}).accessToken };
};

// Чаты, где бота видели: заполняется вебхуком Telegram (server/index.js).
// Нужно, чтобы не искать chat_id группы вручную — добавил бота, написал в группу,
// и чат появился в списке подключения.
const chatSchema = new mongoose.Schema({
  chatId:   { type: String, unique: true, required: true },
  title:    { type: String, default: '' },
  type:     { type: String, default: '' },  // group / supergroup / channel
  seenAt:   { type: Date, default: Date.now },
}, { timestamps: true });

const SocialAccount = mongoose.model('SocialAccount', accountSchema);
const TelegramChat  = mongoose.model('TelegramChat', chatSchema);

module.exports = { SocialAccount, TelegramChat };
