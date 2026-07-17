const { Schema, model } = require('mongoose');

const PriceLogSchema = new Schema({
  productId:   { type: Schema.Types.ObjectId, ref: 'Product' },
  productName: { type: String },
  sku:         { type: String },
  priceType:   { type: String, enum: ['retail', 'wholesale', 'dealer', 'cost', 'export'], required: true },
  base:        { type: String, default: 'makein' },  // база 1С: makein | matkasym | qtop
  currency:    { type: String, default: 'KGS' },     // KGS | KZT | USD — экспортный прайс в долларах
  fromPrice:   { type: Number, default: 0 },
  toPrice:     { type: Number, default: 0 },
  source:      { type: String, enum: ['manual', 'excel'], default: 'manual' },
  sourceUrl:   { type: String, default: '' },
  changedBy: {
    id:    { type: Schema.Types.ObjectId, ref: 'User' },
    name:  { type: String },
    email: { type: String },
  },
}, { timestamps: true });

PriceLogSchema.index({ productId: 1, createdAt: -1 });
PriceLogSchema.index({ createdAt: -1 });
PriceLogSchema.index({ priceType: 1, createdAt: -1 });

module.exports = model('PriceLog', PriceLogSchema);
