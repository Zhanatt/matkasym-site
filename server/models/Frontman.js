const { Schema, model } = require('mongoose');

const FrontmanSchema = new Schema({
  // Одна коллекция на две роли: фронтмены (снимают контент) и дизайнеры
  // (ведут сеты). Различаются только kind — сеты, бренд и цвет общие.
  kind:      { type: String, enum: ['frontman', 'designer'], default: 'frontman' },
  name:      { type: String, required: true },
  brand:     { type: String, required: true },
  sets:      [{ type: String }],
  // Канала продаж у человека больше нет: за кого он отвечает, видно по
  // направлению и сетам, а кто это — по привязанному аккаунту (userId).
  instagram: { type: String, default: '' },
  color:     { type: String, default: '#888888' },
  order:     { type: Number, default: 0 },
  userId:    { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

module.exports = model('Frontman', FrontmanSchema);
