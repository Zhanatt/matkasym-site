const mongoose = require('mongoose');

// Оформленное «Техлист на утверждение» по задаче R&D в Битриксе. Нужна, чтобы отличать
// перенос в «Завершённые техлисты» через страницу оформления (запись есть) от ручного
// перетаскивания без данных — такую задачу сайт возвращает в «Обработку техлиста».
const techlistApprovalSchema = new mongoose.Schema({
  taskId:  { type: String, required: true, index: true },
  // approval — оформили на утверждение; rework — менеджер вернул на доработку с комментарием;
  // restore — сайт сам вернул задачу в «Завершённые» (её утащили назад без комментария);
  // bounce — сайт сам выкинул из «Завершённых» задачу, затащенную туда без оформления
  kind:    { type: String, enum: ['approval', 'rework', 'restore', 'bounce'], default: 'approval' },
  message: { type: String, default: '' },
  data:    { type: Object, default: {} },
}, { timestamps: true });

module.exports = mongoose.model('TechlistApproval', techlistApprovalSchema);
