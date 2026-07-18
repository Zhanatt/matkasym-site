const mongoose = require('mongoose');
const { Schema } = mongoose;

// Отметка о загрузке отчёта продаж за период (по стране).
// Нужна, чтобы отличить «отчёт загружен, но продаж 0» от «отчёт ещё не загружали»:
// при нуле продаж записей SalesRecord нет, и без этой отметки не понять, был ли отчёт.
const salesUploadSchema = new Schema({
  country:    { type: String, enum: ['KG', 'KZ'], default: 'KG' },
  periodFrom: { type: Date, required: true },
  periodTo:   { type: Date, required: true },
  rows:       { type: Number, default: 0 },   // сколько строк продаж было в отчёте
  uploadedBy: { name: { type: String, default: '' }, id: { type: Schema.Types.ObjectId, ref: 'User' } },
}, { timestamps: true });

salesUploadSchema.index({ country: 1, periodFrom: 1, periodTo: 1 });

module.exports = mongoose.model('SalesUpload', salesUploadSchema);
