const mongoose = require('mongoose');

// Что сайт уже сделал по переносам задач R&D в Битриксе: отправил на утверждение,
// вернул на доработку, откатил перенос. Нужна, чтобы один перенос не обрабатывать дважды
// и отличать свои переносы от ручных (см. lib/rndAutoAssign.js).
const techlistApprovalSchema = new mongoose.Schema({
  taskId:  { type: String, required: true, index: true },
  // approval — оформили на утверждение; rework — менеджер вернул на доработку с комментарием;
  // restore — сайт сам вернул задачу в «Завершённые» (её утащили назад без комментария);
  // bounce — сайт сам выкинул из «Завершённых» задачу, затащенную туда без оформления
  kind:    { type: String, enum: ['approval', 'rework', 'restore', 'bounce'], default: 'approval' },
  moveId:  { type: String, default: '' }, // id записи STAGE в истории задачи, которую обработали
  message: { type: String, default: '' },
  data:    { type: Object, default: {} },
}, { timestamps: true });

module.exports = mongoose.model('TechlistApproval', techlistApprovalSchema);
