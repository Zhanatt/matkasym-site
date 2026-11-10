const mongoose = require('mongoose');

// Чертёж PDF. Файл лежит в Cloudinary (raw, папка matkasym/drawings), здесь — карточка.
//
// Главное свойство — постоянная ссылка `url`: она без номера версии и не меняется
// при замене файла. Ссылку отдают в цех и вставляют в тех.листы, поэтому замена
// перезаписывает файл под тем же publicId, а прежний файл переезжает в архив
// (versions) под своим именем — к нему тоже можно вернуться.
//
// Загрузить могут с сайта (user) или через бота (chatId). «Мои чертежи» — совпадение
// по любому из них: у сотрудника с привязанным Telegram бот и сайт показывают одно.
const versionSchema = new mongoose.Schema({
  url:        { type: String, required: true },
  publicId:   { type: String, required: true },
  fileName:   { type: String, default: '' },
  size:       { type: Number, default: 0 },
  author:     { type: String, default: '' },
  uploadedAt: { type: Date },
}, { _id: false });

const drawingSchema = new mongoose.Schema({
  title:      { type: String, default: '' },   // название; пусто — показываем имя файла
  code:       { type: String, default: '' },   // ДУ / артикул, необязательно
  caption:    { type: String, default: '' },   // примечание (в боте — подпись к файлу)
  fileName:   { type: String, default: '' },
  size:       { type: Number, default: 0 },
  url:        { type: String, required: true },
  publicId:   { type: String, required: true },
  author:     { type: String, default: '' },   // кто загрузил первым
  lastAuthor: { type: String, default: '' },   // кто загрузил текущий файл
  source:     { type: String, enum: ['bot', 'site'], default: 'bot' },
  chatId:     { type: String, default: '' },
  user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  fileUpdatedAt: { type: Date },
  versions:   [versionSchema],
}, { timestamps: true });

drawingSchema.index({ chatId: 1, createdAt: -1 });
drawingSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Drawing', drawingSchema);
