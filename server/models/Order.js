const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product:  { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name:     { type: String, required: true },
  price:    { type: Number, required: true },
  qty:      { type: Number, required: true, min: 1 },
});

const orderSchema = new mongoose.Schema({
  user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  // Guest order info
  guestName:   { type: String, default: '' },
  guestPhone:  { type: String, default: '' },
  guestEmail:  { type: String, default: '' },

  items:       [orderItemSchema],
  address: {
    city:    { type: String, required: true },
    street:  { type: String, required: true },
    apt:     { type: String, default: '' },
    floor:   { type: String, default: '' },
  },
  payment:     {
    type: String,
    enum: ['card','kaspi','cash','credit'],
    required: true,
  },
  comment:     { type: String, default: '' },
  subtotal:    { type: Number, required: true },
  delivery:    { type: Number, required: true, default: 0 },
  total:       { type: Number, required: true },
  status: {
    type: String,
    enum: ['pending','confirmed','processing','shipped','delivered','cancelled'],
    default: 'pending',
  },
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
