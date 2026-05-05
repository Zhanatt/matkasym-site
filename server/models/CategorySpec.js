const mongoose = require('mongoose');

// Stores custom specs added by admins to specific categories
const categorySpecSchema = new mongoose.Schema({
  category: { type: String, required: true, unique: true },
  label:    { type: String, default: '' },   // human-readable name, set when category is user-created
  customSpecs: [
    {
      key:     { type: String, required: true },
      type:    { type: String, default: 'text' },   // 'text' | 'select'
      options: [{ type: String }],
    }
  ],
}, { timestamps: true });

module.exports = mongoose.model('CategorySpec', categorySpecSchema);
