const mongoose = require('mongoose');
const { Schema } = mongoose;

const stockLogSchema = new Schema({
  productId:   { type: Schema.Types.ObjectId, ref: 'Product' },
  productName: { type: String },
  sku:         { type: String },
  delta:       { type: Number, required: true },   // +30 приход, -10 уход
  fromStock:   { type: Number, default: 0 },
  toStock:     { type: Number, default: 0 },
  source:      { type: String, enum: ['manual', 'excel', 'sync_1c'], default: 'manual' },
  base:        { type: String, default: '' },  // база 1С выгрузки: makein | matkasym | qtop
  sourceUrl:   { type: String, default: '' },
  notInFile:   { type: Boolean, default: false }, // товар отсутствовал в выгрузке 1С → обнулён (не продажа!)
  changedBy: {
    id:    { type: Schema.Types.ObjectId, ref: 'User' },
    name:  { type: String },
    email: { type: String },
  },
}, { timestamps: true });

stockLogSchema.index({ productId: 1, createdAt: -1 });
stockLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('StockLog', stockLogSchema);
