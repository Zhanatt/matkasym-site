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
//   question — Claude уточняет задачу у дизайнера (или ответил, что это не правка), ждёт ответа
const STATUSES = ['queued', 'working', 'question', 'ready', 'failed', 'merging', 'merged', 'rejected', 'cancelled'];
const ACTIVE = ['queued', 'working', 'merging'];

const messageSchema = new mongoose.Schema({
  // status — строка хода работы от системы («Claude правит код», «Предпросмотр готов»…)
  kind:       { type: String, enum: ['request', 'comment', 'bot', 'decision', 'status'], default: 'comment' },
  author:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  authorName: String,
  text:       String,
  images:     [String],
  pending:    Boolean,          // пришло, пока Claude работал — передать в следующий запуск
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
  viewPath:   String,           // где смотреть результат: '/admin/…' или «PDF …» (последняя строка ответа Claude)
  files:      [String],         // какие файлы изменены
  doneUpTo:   { type: Number, default: 0 },  // сообщения до этого индекса уже выложены прошлыми правками чата
  // Каждая выложенная правка чата — для «Истории» (в одном чате их может быть несколько)
  releases:   [{ _id: false, at: Date, deployedAt: Date, summary: String, viewPath: String, files: [String],
                 approvedBy: String, prUrl: String, mergeSha: String, ops: [String] }],
  // Изменения в каталоге, которые предложил Claude (lib/siteOps.js) — применяются при утверждении
  dataOps:    [{ _id: false, op: String, id: String, data: mongoose.Schema.Types.Mixed, label: String, note: String,
                 changes: [{ _id: false, field: String, from: String, to: String }], error: String, warn: String, applied: Boolean, applyError: String }],
  previewReadyAt: Date,         // предпросмотр Render ответил
  mergeSha:   String,           // коммит слияния в main
  mergedAt:   Date,
  deployedAt: Date,             // боевой сайт перезапущен с этим коммитом — можно смотреть
  pdfs:       [{ _id: false, title: String, url: String, error: String }],  // пробные PDF-каталоги из ветки
  reverted:   [String],           // файлы, которые трогать нельзя — правка в них отменена
  error:      String,
  model:      String,                             // какой моделью Claude делалась правка
  statusAt:   { type: Date, default: Date.now },  // когда статус менялся — для «зависших»
  decidedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  decidedAt:  Date,
}, { timestamps: true });

siteChangeSchema.statics.STATUSES = STATUSES;
siteChangeSchema.statics.ACTIVE = ACTIVE;

module.exports = mongoose.model('SiteChange', siteChangeSchema);
