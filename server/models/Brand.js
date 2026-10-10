const mongoose = require('mongoose');

const SetSchema = new mongoose.Schema({
  key:      { type: String, required: true },
  label:    { type: String, required: true }, // 'TAZA KIYM'
  labelRu:  { type: String, default: '' },    // 'Чистая одежда'
  desc:     { type: String, default: '' },
  image:    { type: String, default: '' },    // Google Drive file ID or URL
  levels:   [{ type: String }],               // ['Standard', 'VIP', 'Premium']
  order:    { type: Number, default: 0 },
  // Заморозка: сет не идёт в общий PDF-каталог направления (BrandPdfButton).
  // Вручную через «Все сеты» его отметить можно; на сайте и в админке виден как обычно.
  frozen:   { type: Boolean, default: false },
});

const BrandSchema = new mongoose.Schema({
  key:     { type: String, required: true, unique: true }, // 'matkasym-home'
  label:   { type: String, required: true },
  tagline: { type: String, default: '' },
  desc:    { type: String, default: '' },
  color:   { type: String, default: '#7d96a0' },           // accent color
  order:   { type: Number, default: 0 },
  sets:    [SetSchema],
});

module.exports = mongoose.model('Brand', BrandSchema);
