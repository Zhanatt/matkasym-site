const mongoose = require('mongoose');

const loginLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  date: { type: String, required: true, index: true },
  count: { type: Number, default: 1 },
}, { timestamps: true });

loginLogSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('LoginLog', loginLogSchema);
