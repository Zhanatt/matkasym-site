const { Schema, model } = require('mongoose');

const SupplierSchema = new Schema({
  name:      { type: String, required: true },
  instagram: { type: String, default: '' },
  phone:     { type: String, default: '' },
  notes:     { type: String, default: '' },
  products:  [{ type: Schema.Types.ObjectId, ref: 'Product' }],
}, { timestamps: true });

module.exports = model('Supplier', SupplierSchema);
