const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name:      { type: String, required: true, trim: true },
  email:     { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:  { type: String, required: true, minlength: 6 },
  phone:     { type: String, default: '' },
  address:   {
    city:    { type: String, default: '' },
    street:  { type: String, default: '' },
    apt:     { type: String, default: '' },
  },
  favorites:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  role:       { type: String, enum: ['user','owner','editor','viewer','navigator','warehouse','banned'], default: 'user' },
  isPending:  { type: Boolean, default: false },
  resetPasswordToken:   { type: String },
  resetPasswordExpires: { type: Date },
  lastSeen: { type: Date, default: null },
  telegramChatId: { type: String, default: '' },
  canViewUsers: { type: Boolean, default: false },
  canSetBufferStock: { type: Boolean, default: false }, // может менять буферный запас
  canOrderProducts: { type: Boolean, default: false }, // видит инбокс заявок фронтменов на заказ товаров (Джипар)
  // Зона ответственности за буферный запас: получает алерты и видит страницу только по своим товарам
  bufferZone: { type: String, enum: ['', 'ikea', 'home', 'shaar'], default: '' },

}, { timestamps: true });

// Hash password before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare password
userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Never return password
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
