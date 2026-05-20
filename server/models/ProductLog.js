const mongoose = require('mongoose');
const { Schema } = mongoose;

const productLogSchema = new Schema({
  action:      { type: String, enum: ['added', 'deleted'], required: true },
  productId:   { type: Schema.Types.ObjectId, ref: 'Product' },
  productName: { type: String, required: true },
  sku:         { type: String, default: '' },
  brand:       { type: String, default: '' },
  source:      { type: String, enum: ['manual', 'sync_1c'], default: 'manual' },
  sourceUrl:   { type: String, default: '' },
  changedBy: {
    id:    { type: Schema.Types.ObjectId, ref: 'User' },
    name:  { type: String },
    email: { type: String },
  },
}, { timestamps: true });

productLogSchema.index({ createdAt: -1 });
productLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model('ProductLog', productLogSchema);
