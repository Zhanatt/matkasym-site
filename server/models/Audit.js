const mongoose = require('mongoose');

const auditSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },

  // Сроки
  startedAt: {
    type: Date,
    default: Date.now,
  },
  deadline: {
    type: Date,
    required: true,
  },

  // Статус
  status: {
    type: String,
    enum: ['active', 'completed', 'cancelled'],
    default: 'active',
  },
  completedAt: {
    type: Date,
    default: null,
  },

  // Кто создал
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  // Прогресс фронтменов: кто завершил
  frontmenProgress: [{
    frontman: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Frontman',
    },
    completedAt: {
      type: Date,
      default: null,
    },
    totalProducts: {
      type: Number,
      default: 0,
    },
    reviewedProducts: {
      type: Number,
      default: 0,
    },
  }],

  // Статистика (заполняется при завершении)
  stats: {
    totalProducts: { type: Number, default: 0 },
    keep: { type: Number, default: 0 },
    improve: { type: Number, default: 0 },
    discontinue: { type: Number, default: 0 },
    frontmenTotal: { type: Number, default: 0 },
    frontmenCompleted: { type: Number, default: 0 },
  },

}, { timestamps: true });

auditSchema.index({ status: 1, deadline: 1 });

module.exports = mongoose.model('Audit', auditSchema);
