const mongoose = require('mongoose');
const { Schema } = mongoose;

// Накладная продажи из журнала «Реализации ТМЗ и услуг» — уровень документа,
// с реальными датой и временем. Используется для детализации «Накладные (дата/время)»
// под агентом. Итоги по агентам/сетам/товарам берутся из SalesRecord («Сводная»),
// поэтому суммы отсюда в те итоги НЕ входят (двойного счёта нет).
const salesDocSchema = new Schema({
  docNumber:    { type: String, default: '' },
  docDate:      { type: Date, required: true },   // реальные дата + время накладной
  agent:        { type: String, default: '' },    // торговый агент
  counterparty: { type: String, default: '' },
  warehouse:    { type: String, default: '' },
  sum:          { type: Number, default: 0 },
  country:      { type: String, enum: ['KG', 'KZ'], default: 'KG' },
  source:       { type: String, default: '1c-journal' },
}, { timestamps: true });

salesDocSchema.index({ docDate: -1 });
salesDocSchema.index({ agent: 1, docDate: -1 });

module.exports = mongoose.model('SalesDoc', salesDocSchema);
