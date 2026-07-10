const mongoose = require('mongoose');

// Юридический статус клиента. Для всех статусов кроме 'individual' и 'ip'
// название компании обязательно (проверка ниже + на клиенте).
const LEGAL_STATUSES = ['individual', 'ip', 'ooo', 'oao', 'gov', 'other'];

// Статусы, при которых требуется название компании
const COMPANY_REQUIRED = ['ooo', 'oao', 'gov', 'other'];

const SYMBOL_TYPES = ['logo', 'sticker', 'cutout', 'engraving', 'print', 'other'];

const techRequestSchema = new mongoose.Schema({
  // Порядковый номер заявки (ТЗ-1, ТЗ-2 ...) — проставляется в роуте создания
  number: { type: Number, index: true },

  // Кто создал заявку (навигатор)
  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // Конструктор, назначенный на заявку
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // ── Клиент ──────────────────────────────────────────────────────────────
  client: {
    name:        { type: String, required: true, trim: true },
    legalStatus: { type: String, enum: LEGAL_STATUSES, required: true },
    // Обязательно для ОсОО / ОАО / гос. организаций
    companyName: { type: String, default: '', trim: true },
    phone:       { type: String, default: '', trim: true },
  },

  // ── Изделие ─────────────────────────────────────────────────────────────
  item: {
    name:       { type: String, default: '', trim: true },
    // Свободное поле: у каждого вида продукции свой набор размеров.
    // Позже сюда добавим структурированные размеры по категориям.
    dimensions: { type: String, required: true, trim: true },
    color:      { type: String, required: true, trim: true },
    quantity:   { type: Number, default: 1, min: 1 },
  },

  // ── Символика на изделии ────────────────────────────────────────────────
  symbols: {
    has:         { type: Boolean, default: false },
    types:       [{ type: String, enum: SYMBOL_TYPES }],
    description: { type: String, default: '' },
    media:       [{ type: String }],
  },

  // ── Техническое задание ─────────────────────────────────────────────────
  spec: {
    description: { type: String, required: true },
    media:       [{ type: String }],
  },

  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },

  // Канбан-колонки
  status: {
    type: String,
    enum: ['new', 'in_progress', 'review', 'done', 'rejected'],
    default: 'new',
  },

  deadline:  { type: Date },
  startedAt: { type: Date },

  // Результат работы конструктора: готовый техлист / чертежи
  result: {
    description: { type: String, default: '' },
    media:       [{ type: String }],
    doneAt:      { type: Date },
    doneBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },

  // Причина отклонения заявки
  rejectReason: { type: String, default: '' },

  comments: [{
    author:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    authorName: { type: String },
    text:       { type: String },
    createdAt:  { type: Date, default: Date.now },
  }],

  statusHistory: [{
    from:      { type: String },
    to:        { type: String },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changedAt: { type: Date, default: Date.now },
  }],

}, { timestamps: true });

// Название компании обязательно для юрлиц
techRequestSchema.pre('validate', function (next) {
  if (COMPANY_REQUIRED.includes(this.client?.legalStatus) && !this.client?.companyName?.trim()) {
    return next(new Error('Для юридического лица обязательно название компании'));
  }
  next();
});

techRequestSchema.index({ status: 1 });
techRequestSchema.index({ createdBy: 1 });
techRequestSchema.index({ createdAt: -1 });

module.exports = mongoose.model('TechRequest', techRequestSchema);
module.exports.LEGAL_STATUSES = LEGAL_STATUSES;
module.exports.COMPANY_REQUIRED = COMPANY_REQUIRED;
module.exports.SYMBOL_TYPES = SYMBOL_TYPES;
