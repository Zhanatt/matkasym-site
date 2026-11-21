const mongoose = require('mongoose');

// «Правки сайта» — дизайнеры просят изменить внешний вид сайта словами,
// правку делает Claude в GitHub Actions (.github/workflows/site-change.yml)
// в отдельной ветке design/<_id>, на живой сайт она попадает только после
// «Принять» владельца. Весь цикл: server/routes/siteChanges.js.
//
// Статусы:
//   queued   — задача отправлена в GitHub, ждёт запуска
//   working  — Claude правит код
//   ready    — правка готова, есть PR и ссылка-предпросмотр, ждёт решения владельца
//   failed   — не получилось (ошибка сборки, лимит, сбой) — можно уточнить и повторить
//   merging  — владелец принял, идёт слияние в main
//   merged   — на сайте
//   rejected — владелец отклонил
//   cancelled — автор передумал
const STATUSES = ['queued', 'working', 'ready', 'failed', 'merging', 'merged', 'rejected', 'cancelled'];
const ACTIVE = ['queued', 'working', 'merging'];

const messageSchema = new mongoose.Schema({
  kind:       { type: String, enum: ['request', 'comment', 'bot', 'decision'], default: 'comment' },
  author:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  authorName: String,
  text:       String,
  images:     [String],
  at:         { type: Date, default: Date.now },
}, { _id: false });

const runSchema = new mongoose.Schema({
  at:       { type: Date, default: Date.now },
  ok:       Boolean,
  costUsd:  { type: Number, default: 0 },
  summary:  String,
  runUrl:   String,
}, { _id: false });

const siteChangeSchema = new mongoose.Schema({
  number:     { type: Number, index: true },
  author:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorName: String,
  title:      { type: String, required: true },
  status:     { type: String, enum: STATUSES, default: 'queued', index: true },
  messages:   [messageSchema],
  runs:       [runSchema],
  costUsd:    { type: Number, default: 0 },   // условная стоимость по расчёту Claude Code (платит подписка)
  runBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },  // чей Claude делает текущий запуск
  runByName:  String,
  prNumber:   Number,
  prUrl:      String,
  previewUrl: String,
  runUrl:     String,             // текущий/последний запуск в GitHub Actions
  pdfs:       [{ _id: false, title: String, url: String, error: String }],  // пробные PDF-каталоги из ветки
  reverted:   [String],           // файлы, которые трогать нельзя — правка в них отменена
  error:      String,
  statusAt:   { type: Date, default: Date.now },  // когда статус менялся — для «зависших»
  decidedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  decidedAt:  Date,
}, { timestamps: true });

siteChangeSchema.statics.STATUSES = STATUSES;
siteChangeSchema.statics.ACTIVE = ACTIVE;

module.exports = mongoose.model('SiteChange', siteChangeSchema);
