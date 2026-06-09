const mongoose = require('mongoose');

const productReviewSchema = new mongoose.Schema({
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

  // Статус: keep (оставить), improve (модернизировать), discontinue (снять)
  status: {
    type: String,
    enum: ['keep', 'improve', 'discontinue'],
    required: true
  },

  // Комментарий (обязателен для improve и discontinue)
  comment: {
    type: String,
    default: ''
  },

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

// Индекс для быстрого поиска: один отзыв на товар от одного фронтмена
productReviewSchema.index({ product: 1, frontman: 1 }, { unique: true });

// Индекс для фильтрации по сету
productReviewSchema.index({ 'productSnapshot.set': 1, status: 1 });

module.exports = mongoose.model('ProductReview', productReviewSchema);
