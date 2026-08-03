const mongoose = require('mongoose');

// Запуск нового (тестового) товара — продолжение доски поступлений.
// Товар уже заказан, приехал и лежит на складе; дальше его надо показать рынку:
//   content   — Зайнагуль скидывает фото, ссылку на источник и описание
//   design    — дизайнеры делают карточку/креативы
//   published — пост вышел
//   feedback  — результат поста: обращения, реакции, комментарии, заказы
// Ведёт доску контент-менеджер (User.canManageContent), этап «Дизайн» — роль designer.
const productLaunchSchema = new mongoose.Schema({
  number: { type: Number, index: true },

  product:     { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productName: { type: String, default: '' },   // снимок — карточка остаётся читаемой, если товар переименуют
  sku:         { type: String, default: '' },
  image:       { type: String, default: '' },   // превью из каталога на момент запуска

  // Откуда пришёл товар (если запуск создан из заявки на заказ)
  request: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductRequest' },

  stage: { type: String, enum: ['content', 'design', 'published', 'feedback', 'done'], default: 'content' },

  // Три поля от Зайнагуль
  content: {
    photos:       [{ type: String }],                    // Cloudinary secure_url
    sourceUrl:    { type: String, default: '', trim: true }, // ссылка на товар у источника
    description:  { type: String, default: '', trim: true },
    filledBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    filledByName: { type: String, default: '' },
    filledAt:     { type: Date },
  },

  design: {
    assignee:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assigneeName: { type: String, default: '' },
    files:        [{ type: String }],                    // готовые макеты / фото после обработки
    note:         { type: String, default: '', trim: true },
    doneBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    doneByName:   { type: String, default: '' },
    doneAt:       { type: Date },
  },

  publish: {
    publishedAt: { type: Date },
    links: [{
      platform: { type: String, default: '', trim: true },  // Telegram / Instagram / Битрикс24 …
      url:      { type: String, default: '', trim: true },
    }],
    note:   { type: String, default: '', trim: true },
    byName: { type: String, default: '' },
  },

  // Итог поста — цифры вносит тот, кто ведёт доску
  result: {
    inquiries:     { type: Number, default: null },  // новые обращения
    reactions:     { type: Number, default: null },
    comments:      { type: Number, default: null },
    orders:        { type: Number, default: null },  // заказов после поста
    note:          { type: String, default: '', trim: true },
    updatedByName: { type: String, default: '' },
    updatedAt:     { type: Date },
  },

  createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdByName: { type: String, default: '' },
}, { timestamps: true });

productLaunchSchema.index({ stage: 1, createdAt: -1 });
productLaunchSchema.index({ product: 1 });

module.exports = mongoose.model('ProductLaunch', productLaunchSchema);
