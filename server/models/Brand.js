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
  // Сет своего производства — в списке сетов значок с логотипом MATKASYM.
  // Ставится руками: доля своих товаров не говорит, чей это сет (в ACHYK ASMAN
  // своих 4 из 20, а сет наш). Без отметки сет без своих товаров помечается CROSS.
  maker:    { type: String, enum: ['', 'matkasym'], default: '' },
  // Место сета в общем PDF-каталоге направления. Если задано хоть у одного сета,
  // PDF идёт по нему (сеты без номера — в конце), а не по порядку на экране.
  pdfOrder: { type: Number },
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
