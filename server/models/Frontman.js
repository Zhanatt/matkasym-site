const { Schema, model } = require('mongoose');

const FrontmanSchema = new Schema({
  name:      { type: String, required: true },
  brand:     { type: String, required: true },
  sets:      [{ type: String }],
  instagram: { type: String, default: '' },
  color:     { type: String, default: '#888888' },
  order:     { type: Number, default: 0 },
}, { timestamps: true });

module.exports = model('Frontman', FrontmanSchema);
