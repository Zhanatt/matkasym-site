const mongoose = require('mongoose');
const { Schema } = mongoose;

const photoLogSchema = new Schema({
  productId:   { type: Schema.Types.ObjectId, ref: 'Product' },
  productName: { type: String },
  sku:         { type: String },
  imageUrl:    { type: String },
  source:      { type: String, enum: ['manual', 'excel', 'api'], default: 'manual' },
  sourceFile:  { type: String, default: '' },
  changedBy: {
    id:    { type: Schema.Types.ObjectId, ref: 'User' },
    name:  { type: String },
    email: { type: String },
  },
}, { timestamps: true });

photoLogSchema.index({ productId: 1, createdAt: -1 });
photoLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('PhotoLog', photoLogSchema);
