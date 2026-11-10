const mongoose = require('mongoose');

// Чертёж, загруженный конструктором через бота. Сам PDF лежит в Cloudinary
// (папка matkasym/drawings), здесь — журнал: кто, когда, какой файл и ссылка.
const drawingSchema = new mongoose.Schema({
  chatId:     { type: String, required: true },
  author:     { type: String, default: '' },
  fileName:   { type: String, default: '' },
  caption:    { type: String, default: '' },
  size:       { type: Number, default: 0 },
  url:        { type: String, required: true },
  publicId:   { type: String, required: true },
}, { timestamps: true });

module.exports = mongoose.model('Drawing', drawingSchema);
