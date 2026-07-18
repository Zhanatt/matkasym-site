const mongoose = require('mongoose');
const { Schema } = mongoose;

// Строка продажи из 1С (документ «Реализация ТМЗ и услуг»).
// Одна запись = одна строка товара в накладной. Точные данные о продажах
// по торговым агентам, в отличие от расчёта по уменьшению остатков.
const salesRecordSchema = new Schema({
  docNumber:    { type: String, default: '' },   // номер накладной
  docDate:      { type: Date, required: true },   // дата + время накладной
  agent:        { type: String, default: '' },    // торговый агент
  counterparty: { type: String, default: '' },    // контрагент (покупатель)
  warehouse:    { type: String, default: '' },    // склад

  productName:  { type: String, default: '' },    // номенклатура из 1С
  productId:    { type: Schema.Types.ObjectId, ref: 'Product', default: null }, // сопоставление с товаром сайта
  sku:          { type: String, default: '' },
  brand:        { type: String, default: '' },
  set:          { type: String, default: '' },

  quantity:     { type: Number, default: 0 },
  price:        { type: Number, default: 0 },
  sum:          { type: Number, default: 0 },

  // Страна учёта: KG (Make-in/Matkasym) или KZ (Q-top). Отчёты стран не смешиваются:
  // загрузка одной страны заменяет только её записи за период.
  country:      { type: String, enum: ['KG', 'KZ'], default: 'KG' },

  source:       { type: String, default: '1c' },
}, { timestamps: true });

salesRecordSchema.index({ docDate: -1 });
salesRecordSchema.index({ country: 1, docDate: -1 });
salesRecordSchema.index({ agent: 1, docDate: -1 });
salesRecordSchema.index({ productId: 1, docDate: -1 });

module.exports = mongoose.model('SalesRecord', salesRecordSchema);
