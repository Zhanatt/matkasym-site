const mongoose = require('mongoose');

// Тестовая продажа нового товара — САМЫЙ ПЕРВЫЙ этап, до заявки на заказ.
// Товара ещё нет ни на складе, ни в каталоге: его нашли в интернете и проверяют спрос.
//   content   — Зайнагуль скидывает фото, ссылку на источник и описание
//   design    — дизайнеры делают карточку товара и креативы
//   published — пост вышел, «продаём фотки»
//   feedback  — что принёс пост: обращения, реакции, комментарии, заявки клиентов
// Есть спрос → из карточки создаётся заявка на заказ первой партии (ProductRequest).
// Ведёт доску контент-менеджер (User.canManageContent), этап «Дизайн» — роль designer.
const productLaunchSchema = new mongoose.Schema({
  number: { type: Number, index: true },

  name:  { type: String, required: true, trim: true },  // название, под которым товар ведут до каталога
  image: { type: String, default: '' },                 // превью (первое фото)

  // Товар из каталога — появляется, когда дизайнеры завели карточку
  product:     { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  productName: { type: String, default: '' },
  sku:         { type: String, default: '' },

  // Заявка на заказ первой партии, созданная из этой карточки
  request: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductRequest' },

  stage: { type: String, enum: ['content', 'design', 'published', 'feedback', 'done'], default: 'content' },

  // Чем кончилась тестовая продажа: заказали первую партию или спроса не нашлось
  outcome: { type: String, enum: ['', 'ordered', 'rejected'], default: '' },

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
    requests:      { type: Number, default: null },  // заявки от клиентов — из них и растёт заказ партии
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
