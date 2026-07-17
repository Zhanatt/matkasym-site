const mongoose = require('mongoose');

// Заявка на заказ товара. Два типа:
//   new     — новый товар (заполняется форма с нуля)
//   catalog — заказать товар из существующего каталога
//   (test/real — устаревшие типы, оставлены для старых записей)
// Инбокс обрабатывает Джипар (User.canOrderProducts) — отмечает выполненные.
const productRequestSchema = new mongoose.Schema({
  number:        { type: Number, index: true },

  createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdByName: { type: String, default: '' },

  type:  { type: String, enum: ['new', 'catalog', 'test', 'real'], required: true },

  // Для type=catalog — ссылка на товар из каталога
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  sku:     { type: String, default: '', trim: true },

  photo:  { type: String, default: '' },   // первое фото (для совместимости/превью)
  photos: [{ type: String }],              // все фото (Cloudinary secure_url)

  name:       { type: String, required: true, trim: true },
  quantity:   { type: Number, default: null },  // желаемое количество (шт), необязательно
  dimensions: { type: String, default: '', trim: true },
  color:      { type: String, default: '', trim: true },
  note:       { type: String, default: '', trim: true },

  // Доска: active = «В обработке», done = «Завершён»
  status: { type: String, enum: ['active', 'done'], default: 'active' },

  // Заполняет закупщик (роль purchaser) при переводе в «Завершён»
  purchasePrice: { type: Number, default: null },   // цена, по которой нам продают (за шт)
  deliveryDate:  { type: Date,   default: null },   // когда товар будет
  purchaseNote:  { type: String, default: '', trim: true },

  doneBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  doneByName: { type: String, default: '' },
  doneAt:     { type: Date },
}, { timestamps: true });

productRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('ProductRequest', productRequestSchema);
