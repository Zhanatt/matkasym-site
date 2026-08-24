const mongoose = require('mongoose');

/**
 * Объявление, подготовленное для Лалафо.
 *
 * У площадки нет открытого API: объявления заливаются файлом в заданном формате.
 * Поэтому «публикация в Лалафо» — это попадание товара в эту очередь: карточка
 * собирается в момент публикации (с теми фото и текстом, что были на тот день),
 * а выгрузка уходит одним xlsx, когда её скачают.
 *
 * Поля названы по колонкам файла, чтобы при сборке xlsx ничего не пересчитывать:
 * название по-русски (по нему ищут), характеристики и описание по-кыргызски
 * (на этом языке читает аудитория площадки), цена всегда договорная.
 */
const lalafoItemSchema = new mongoose.Schema({
  product:     { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  publication: { type: mongoose.Schema.Types.ObjectId, ref: 'Publication' },

  sku:         { type: String, default: '' },
  title:       { type: String, default: '' },   // по-русски
  specs:       { type: String, default: '' },   // по-кыргызски, через точку
  description: { type: String, default: '' },   // по-кыргызски
  price:       { type: String, default: '' },
  photos:      { type: [String], default: [] }, // прямые ссылки Cloudinary, до 8

  // queued — ждёт выгрузки, exported — попал в скачанный файл
  status:     { type: String, enum: ['queued', 'exported'], default: 'queued' },
  exportedAt: { type: Date },
}, { timestamps: true });

lalafoItemSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model('LalafoItem', lalafoItemSchema);
