const mongoose = require('mongoose');

// Заявка фронтмена на заказ товара. Два типа:
//   test — тестовый продукт (пробная закупка)
//   real — заказать настоящий продукт (обычный заказ)
// Инбокс обрабатывает Джипар (User.canOrderProducts) — отмечает выполненные.
const productRequestSchema = new mongoose.Schema({
  number:        { type: Number, index: true },

  createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdByName: { type: String, default: '' },

  type:  { type: String, enum: ['test', 'real'], required: true },

  photo: { type: String, default: '' },   // Cloudinary secure_url

  name:       { type: String, required: true, trim: true },
  dimensions: { type: String, default: '', trim: true },
  color:      { type: String, default: '', trim: true },
  note:       { type: String, default: '', trim: true },

  status: { type: String, enum: ['active', 'done'], default: 'active' },

  doneBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  doneByName: { type: String, default: '' },
  doneAt:     { type: Date },
}, { timestamps: true });

productRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('ProductRequest', productRequestSchema);
