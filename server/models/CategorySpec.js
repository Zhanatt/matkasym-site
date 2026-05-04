const mongoose = require('mongoose');

// Stores custom specs added by admins to specific categories
const categorySpecSchema = new mongoose.Schema({
  category: { type: String, required: true, unique: true },
  customSpecs: [
    {
      key:     { type: String, required: true },
      type:    { type: String, default: 'text' },   // 'text' | 'select'
      options: [{ type: String }],
    }
  ],
}, { timestamps: true });

module.exports = mongoose.model('CategorySpec', categorySpecSchema);
