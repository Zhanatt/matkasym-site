const { Schema, model } = require('mongoose');

const VideoScheduleSchema = new Schema({
  frontman:    { type: Schema.Types.ObjectId, ref: 'Frontman', required: true },
  product:     { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  plannedDate: { type: Date, required: true },
  isCompleted: { type: Boolean, default: false },
  completedAt: { type: Date, default: null },
}, { timestamps: true });

VideoScheduleSchema.index({ frontman: 1, plannedDate: 1 });
// Товар повторяемый: один товар можно снимать много раз, поэтому индекс НЕ уникальный
VideoScheduleSchema.index({ frontman: 1, product: 1 });

module.exports = model('VideoSchedule', VideoScheduleSchema);
