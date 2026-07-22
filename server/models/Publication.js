const mongoose = require('mongoose');

// Одна отправка на конкретную площадку внутри публикации.
// Результат хранится по каждой отдельно: Instagram может упасть, а Telegram уйти — и это норма.
const targetSchema = new mongoose.Schema({
  account:     { type: mongoose.Schema.Types.ObjectId, ref: 'SocialAccount' },
  platform:    { type: String, default: '' },
  title:       { type: String, default: '' },   // снимок имени площадки — на случай удаления аккаунта
  postType:    { type: String, default: 'feed' }, // feed / story (Instagram)
  caption:     { type: String, default: '' },    // итоговый текст ИМЕННО для этой площадки
  dueAt:       { type: Date },                   // когда отправлять (учитывает задержку узла в схеме)
  status:      { type: String, enum: ['pending', 'publishing', 'published', 'failed', 'skipped'], default: 'pending' },
  error:       { type: String, default: '' },
  externalId:  { type: String, default: '' },    // id поста на площадке
  externalUrl: { type: String, default: '' },
  publishedAt: { type: Date },
}, { _id: false });

// Публикация = один контент, разосланный по нескольким площадкам.
// Текст и картинки фиксируются здесь снимком: правки товара задним числом пост не меняют.
const publicationSchema = new mongoose.Schema({
  kind:        { type: String, enum: ['product', 'custom'], default: 'product' },
  product:     { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  productName: { type: String, default: '' },

  text:   { type: String, default: '' },   // общий текст (площадка может переопределить шаблоном)
  images: { type: [String], default: [] }, // публичные URL (Cloudinary / Drive thumbnail)

  flow:   { type: mongoose.Schema.Types.ObjectId, ref: 'PublishFlow' },
  targets: { type: [targetSchema], default: [] },

  // pending — запланирована, running — рассылается, done — все площадки отработали
  status:      { type: String, enum: ['pending', 'running', 'done'], default: 'pending' },
  scheduledAt: { type: Date },   // пусто = публиковать сразу
  startedAt:   { type: Date },
  finishedAt:  { type: Date },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

publicationSchema.index({ status: 1, scheduledAt: 1 });
publicationSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Publication', publicationSchema);
