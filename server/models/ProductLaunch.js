const mongoose = require('mongoose');

// Тестовая продажа нового товара — САМЫЙ ПЕРВЫЙ этап, до заявки на заказ.
// Товара ещё нет ни на складе, ни в каталоге: его нашли в интернете и проверяют спрос.
//   proposed  — менеджер предложил товар: увидел спрос у клиентов, скинул на рассмотрение
//   content   — Зайнагуль скидывает фото, ссылку на источник и описание
//   design    — дизайнеры делают карточку товара и креативы
//   review    — макеты на согласовании: утвердить или вернуть на доработку
//   published — пост вышел, «продаём фотки»
//   target    — решили крутить рекламу: задача уходит таргетологу в Telegram
//   feedback  — что принёс пост и таргет: обращения, реакции, комментарии, заявки клиентов
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

  stage: { type: String, enum: ['proposed', 'content', 'design', 'review', 'published', 'target', 'feedback', 'done'], default: 'content' },

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

  // Согласование дизайна: правки от согласующего и отметка об утверждении
  review: {
    note:           { type: String, default: '', trim: true },
    approvedByName: { type: String, default: '' },
    approvedAt:     { type: Date },
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

  // Таргет: задача уходит таргетологу, он же потом заполняет результат
  target: {
    startedAt: { type: Date },
    note:      { type: String, default: '', trim: true },  // что крутили, бюджет, аудитория
    byName:    { type: String, default: '' },              // кто отправил в таргет
  },

  // Замеры по дням: пост и реклама дают отклик не разом, поэтому считаем по датам.
  // Одна запись — итог одного дня; на день приходится не больше одной строки.
  results: [{
    date:      { type: Date, required: true },
    inquiries: { type: Number, default: null },  // новые обращения
    reactions: { type: Number, default: null },
    comments:  { type: Number, default: null },
    note:      { type: String, default: '', trim: true },
    byName:    { type: String, default: '' },
  }],

  // Общий вывод по тесту — вносит тот, кто ведёт доску, или таргетолог
  result: {
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
