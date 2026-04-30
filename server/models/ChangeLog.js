const mongoose = require('mongoose');

const changeLogSchema = new mongoose.Schema({
  productId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productName: { type: String, required: true },
  changedBy: {
    id:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name:  { type: String },
    email: { type: String },
  },
  changes: [{
    field: { type: String },
    from:  { type: mongoose.Schema.Types.Mixed },
    to:    { type: mongoose.Schema.Types.Mixed },
  }],
}, { timestamps: true });

module.exports = mongoose.model('ChangeLog', changeLogSchema);
