const mongoose = require('mongoose');

// Порядок категорий внутри сета, заданный руками из админки.
//
// Раньше он жил захардкоженным объектом в AdminSets.jsx: каждая перестановка
// требовала правки кода и деплоя, хотя это чистая настройка витрины. Здесь она
// хранится и редактируется владельцем.
//
// Категории перечислены сверху вниз. Те, что в списке не названы (новая
// категория появилась после настройки), встают после них по алфавиту — товар
// не должен пропадать со страницы только потому, что его забыли упорядочить.
const setLayoutSchema = new mongoose.Schema({
  brand:      { type: String, required: true },
  set:        { type: String, required: true },
  categories: [{ type: String }],
}, { timestamps: true });

// Один сет живёт в одном бренде, но slug сета встречается в разных брендах
// (dayar-tutuk есть и в kyzmat, и в shaar), поэтому ключ составной.
setLayoutSchema.index({ brand: 1, set: 1 }, { unique: true });

module.exports = mongoose.model('SetLayout', setLayoutSchema);
