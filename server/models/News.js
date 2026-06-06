const mongoose = require('mongoose');
const { Schema } = mongoose;

const newsSchema = new Schema({
  type: {
    type: String,
    enum: [
      'discontinued', 'liquidation', 'out_of_stock', 'restocked', 'price_change', 'custom',
      'new_product', 'status_planned', 'status_in_development', 'status_improvement', 'status_for_sale',
    ],
    required: true,
  },
  title:   { type: String, required: true },
  message: { type: String, default: '' },
  images:  [{ type: String }],  // массив URL фотографий для поста
  product: {
    id:          { type: Schema.Types.ObjectId, ref: 'Product', default: null },
    name:        { type: String, default: '' },
    brand:       { type: String, default: '' },
    set:         { type: String, default: '' },
    stock:       { type: Number, default: 0 },
    inTransit:   { type: Boolean, default: false },
    images:      [{ type: String }],
    driveImages: [{ type: String }],
  },
  recipients: [{
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    name:   { type: String },
    email:  { type: String },
    read:   { type: Boolean, default: false },
    readAt: { type: Date,    default: null  },
  }],
  createdBy: {
    id:    { type: Schema.Types.ObjectId, ref: 'User' },
    name:  { type: String },
    email: { type: String },
  },
}, { timestamps: true });

newsSchema.index({ createdAt: -1 });
newsSchema.index({ 'recipients.userId': 1, 'recipients.read': 1 });

module.exports = mongoose.model('News', newsSchema);
