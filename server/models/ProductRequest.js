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

  // Этапы доски закупки:
  //   new             — Новые заявки (только что созданы)
  //   searching       — Товар в поиске (закупщик ищет поставщиков)
  //   supplier_select — Выбор поставщика (сравнение и выбор из найденных)
  //   done            — Завершён
  // Старое значение 'active' мигрируется в 'new' при старте сервера.
  status: { type: String, enum: ['new', 'searching', 'supplier_select', 'done'], default: 'new' },

  // Поставщики, которых нашёл закупщик на этапах «Поиск» / «Выбор».
  // chosen — выбранный на этапе «Выбор поставщика».
  suppliers: [{
    name:     { type: String, default: '', trim: true },  // название / контакт / ссылка
    price:    { type: Number, default: null },             // цена за шт
    currency: { type: String, default: 'сом' },            // сом | ₸ | $
    terms:    { type: String, default: '', trim: true },   // срок поставки / мин. заказ / условия
    note:     { type: String, default: '', trim: true },
    chosen:   { type: Boolean, default: false },
  }],

  // Итог по выбранному поставщику (проставляется при переводе в «Завершён»)
  purchasePrice: { type: Number, default: null },   // цена, по которой нам продают (за шт)
  deliveryDate:  { type: Date,   default: null },   // когда товар будет
  purchaseNote:  { type: String, default: '', trim: true },

  doneBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  doneByName: { type: String, default: '' },
  doneAt:     { type: Date },
}, { timestamps: true });

productRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('ProductRequest', productRequestSchema);
