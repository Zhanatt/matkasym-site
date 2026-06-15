const mongoose = require('mongoose');

const receiveAlertSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  productName: String,
  productSku: String,

  expectedQty: { type: Number, required: true },
  receivedQty: { type: Number, required: true },

  // Тип проблемы: shortage (недостача), excess (излишек), damaged (повреждён), wrong (неправильный товар)
  alertType: {
    type: String,
    enum: ['shortage', 'excess', 'damaged', 'wrong', 'other'],
    required: true
  },

  comment: String,

  // Кто принял
  receivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receivedByName: String,

  // Статус: pending (ожидает), resolved (решено), dismissed (отклонено)
  status: {
    type: String,
    enum: ['pending', 'resolved', 'dismissed'],
    default: 'pending'
  },

  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  resolvedAt: Date,
  resolvedComment: String,

}, { timestamps: true });

receiveAlertSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('ReceiveAlert', receiveAlertSchema);
