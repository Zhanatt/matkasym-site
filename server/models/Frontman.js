const { Schema, model } = require('mongoose');

const FrontmanSchema = new Schema({
  // Одна коллекция на две роли: фронтмены (снимают контент по каналам продаж)
  // и дизайнеры (ведут сеты). Различаются только kind — сеты, бренд и цвет общие.
  kind:      { type: String, enum: ['frontman', 'designer'], default: 'frontman' },
  name:      { type: String, required: true },
  brand:     { type: String, required: true },
  sets:      [{ type: String }],
  channel:   { type: String, enum: ['matkasym_home', 'make_in', 'matkasym_kz', 'matkasym_horeca', 'matkasym_kyzmat', '', null], default: null },
  instagram: { type: String, default: '' },
  color:     { type: String, default: '#888888' },
  order:     { type: Number, default: 0 },
  userId:    { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

module.exports = model('Frontman', FrontmanSchema);
