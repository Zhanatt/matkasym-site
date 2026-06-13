const mongoose = require('mongoose');

const productReviewSchema = new mongoose.Schema({
  // Привязка к аудиту (null для legacy записей)
  audit: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Audit',
    default: null
  },

  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  frontman: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Frontman',
    required: true
  },
  reviewer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Статус: keep (оставить), not_tried (не пробовали), improve (модернизировать), discontinue (снять)
  status: {
    type: String,
    enum: ['keep', 'not_tried', 'improve', 'discontinue'],
    required: true
  },

  // Комментарий (обязателен для improve и discontinue)
  comment: {
    type: String,
    default: ''
  },

  // Фото предложений на замену (от фронтмена)
  suggestionPhotos: [{
    type: String
  }],

  // Снапшот данных товара на момент проверки
  productSnapshot: {
    name:     { type: String },
    fullName: { type: String },
    sku:      { type: String },
    set:      { type: String },
    brand:    { type: String },
    price:    { type: Number },
    stock:    { type: Number },
    image:    { type: String },
  },

}, { timestamps: true });

// Индекс: один отзыв на товар от одного фронтмена в рамках одного аудита
productReviewSchema.index({ audit: 1, product: 1, frontman: 1 }, { unique: true });

// Индекс для получения всех отзывов аудита
productReviewSchema.index({ audit: 1, status: 1 });

// Индекс для фильтрации по сету
productReviewSchema.index({ 'productSnapshot.set': 1, status: 1 });

module.exports = mongoose.model('ProductReview', productReviewSchema);
