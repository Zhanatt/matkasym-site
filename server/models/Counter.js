const mongoose = require('mongoose');

// Сквозные номера для сущностей, которым нужен человеческий идентификатор
// вместо ObjectId: «публикация №142» произносится вслух и ищется в журнале,
// «6a635173265eef3c25c495f9» — нет.
//
// Одна запись на последовательность: { _id: 'publication', seq: 142 }.
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },   // имя последовательности
  seq: { type: Number, default: 0 },
}, { versionKey: false });

// Следующий номер. Именно findOneAndUpdate с $inc, а не «прочитать max и прибавить»:
// две публикации, отправленные одновременно, иначе получат один номер.
// upsert — первый вызов заводит счётчик сам, отдельная инициализация не нужна.
counterSchema.statics.next = async function (name) {
  const doc = await this.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  );
  return doc.seq;
};

module.exports = mongoose.model('Counter', counterSchema);
