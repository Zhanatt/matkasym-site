const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  // Связи
  product:   { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  frontman:  { type: mongoose.Schema.Types.ObjectId, ref: 'Frontman', required: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Тип обращения
  type: {
    type: String,
    enum: ['complaint', 'suggestion', 'defect', 'question'],
    required: true
  },

  // Приоритет
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },

  // Статус (канбан-колонки)
  status: {
    type: String,
    enum: ['new', 'in_progress', 'improvement', 'resolved', 'rejected'],
    default: 'new'
  },

  // Срок выполнения
  deadline: { type: Date },

  // Дата начала работы
  startedAt: { type: Date },

  // Описание проблемы
  problem: {
    description: { type: String, required: true },
    media: [{ type: String }],  // URLs фото/видео
  },

  // Альтернативы решения (от фронтмена)
  alternatives: {
    description: { type: String, default: '' },
    media: [{ type: String }],
  },

  // Техлист на улучшение (заполняется перед отправкой на улучшение)
  improvementSpec: {
    description: { type: String, default: '' },
    media: [{ type: String }],
    createdAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },

  // Решение (от PM)
  resolution: {
    description: { type: String, default: '' },
    media: [{ type: String }],
    resolvedAt: { type: Date },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },

  // Комментарии
  comments: [{
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    authorName: { type: String },
    text: { type: String },
    createdAt: { type: Date, default: Date.now }
  }],

  // История изменений статуса
  statusHistory: [{
    from: { type: String },
    to: { type: String },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changedAt: { type: Date, default: Date.now }
  }],

}, { timestamps: true });

feedbackSchema.index({ status: 1 });
feedbackSchema.index({ frontman: 1 });
feedbackSchema.index({ product: 1 });
feedbackSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Feedback', feedbackSchema);
