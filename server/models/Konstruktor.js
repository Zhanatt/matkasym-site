const mongoose = require('mongoose');

// Конструктор, который присылает чертежи боту в Telegram.
//
// Аккаунта на сайте у конструктора нет — его узнаём по chat_id личного чата.
// Регистрируется он сам (/konstruktor → имя), но загружать может только после
// того, как владелец нажмёт «Принять»: иначе любой, кто нашёл бота, заливал бы
// файлы в наш Cloudinary.
const konstruktorSchema = new mongoose.Schema({
  chatId:   { type: String, required: true, unique: true },
  username: { type: String, default: '' },
  name:     { type: String, default: '' },
  // awaiting_name — бот спросил имя и ждёт следующего сообщения
  status:   { type: String, enum: ['awaiting_name', 'pending', 'approved', 'rejected'], default: 'awaiting_name' },
  decidedBy: { type: String, default: '' },
  decidedAt: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('Konstruktor', konstruktorSchema);
