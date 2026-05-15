const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  // Identity
  name:     { type: String, required: true },
  fullName: { type: String, required: true },
  sku:      { type: String, default: '' },

  // Brand & Set
  brand:    { type: String, required: true, default: 'matkasym-home' },
  set:      { type: String, default: '' },   // e.g. 'taza-kiym', 'kosh-kelniz'
  setLevel: { type: String, default: '' },   // 'standard' | 'vip' | 'premium'
  color:    { type: String, default: '' },   // 'white' | 'black' | 'grey'

  // Category (product type) — open string, managed from admin
  category: { type: String, required: true, default: 'other' },

  // Pricing
  priceCost:         { type: Number, default: 0 },   // Себестоимость
  priceWholesale:    { type: Number, default: 0 },   // Оптовая цена
  priceDealer:       { type: Number, default: 0 },   // Дилерская цена
  price:             { type: Number, required: true, min: 0 }, // Розничная цена (на сайте)

  // Dimensions
  dimensions: { type: String, default: '' },  // e.g. "134x55x108 см"

  // Specs — dynamic key-value per category
  specs: [
    {
      key:     { type: String },          // e.g. "Макс. нагрузка"
      value:   { type: String },          // e.g. "10 кг"
      options: [{ type: String }],        // if set → renders as dropdown in admin
    }
  ],

  // Content
  description: { type: String, default: '' },
  tags:        [{ type: String }],

  // Media — Google Drive file IDs only (URLs built in frontend)
  driveImages: [{ type: String }],  // Google Drive file IDs
  images:      [{ type: String }],  // fallback static URLs

  // Status
  isNew:         { type: Boolean, default: false },
  inStock:       { type: Boolean, default: true },
  stock:         { type: Number, default: 50 },
  stockStatus:      { type: String, enum: ['in_stock', 'out_of_stock', 'expected'], default: 'in_stock' },
  productStatus:    { type: String, enum: ['planned', 'improvement', 'discontinued', 'for_sale', 'in_development', 'liquidation'], default: 'for_sale' },
  developmentStage: { type: String, default: '' },  // e.g. 'производство', 'моделирование', 'чертеж'

  // TZ data for in_development
  developmentTZ: {
    description: { type: String, default: '' },
    files: [{ name: { type: String }, url: { type: String } }],
  },

  // TZ data for improvement
  improvementTZ: {
    problem:  { type: String, default: '' },
    solution: { type: String, default: '' },
    files: [{ name: { type: String }, url: { type: String } }],
  },

  // Tender
  tenderCompleted:   { type: Boolean, default: false },
  tenderCompletedAt: { type: Date,    default: null  },
  tenderAssignee: {
    userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    userName:   { type: String, default: '' },
    userEmail:  { type: String, default: '' },
    assignedAt: { type: Date, default: null },
  },

  // Stats
  rating:      { type: Number, default: 0, min: 0, max: 5 },
  reviewCount: { type: Number, default: 0 },
}, { timestamps: true });

productSchema.virtual('discount').get(function () {
  if (!this.oldPrice) return 0;
  return Math.round(((this.oldPrice - this.price) / this.oldPrice) * 100);
});

productSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Product', productSchema);
