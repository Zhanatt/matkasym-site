require('dotenv').config();
const mongoose   = require('mongoose');
const cloudinary = require('./lib/cloudinary');
const Product    = require('./models/Product');
const path       = require('path');

const MONGO_URI = 'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym?appName=M0';
const DIR = '/Users/zhanat/Desktop/фото для продакт матрикс';

// filename → { public_id, namePatterns (substring match on fullName, case-insensitive) }
const PHOTOS = [
  {
    file:       'LIGHT.png',
    public_id:  'industrial-shelf-light',
    folder:     'matkasym/shaar',
    patterns:   ['ADIK STORAGE LIGHT'],
  },
  {
    file:       'MEDIUM.png',
    public_id:  'industrial-shelf-medium',
    folder:     'matkasym/shaar',
    patterns:   ['ADIK STORAGE MEDIUM'],
  },
  {
    file:       'ROUND s3.png',
    public_id:  'adik-round-s3',
    folder:     'matkasym/home',
    patterns:   ['ROUND S3'],
  },
  {
    file:       'ROUND X3.png',
    public_id:  'adik-round-x3',
    folder:     'matkasym/home',
    patterns:   ['ROUND X3'],
  },
  {
    file:       'ROUND X4.png',
    public_id:  'adik-round-x4',
    folder:     'matkasym/home',
    patterns:   ['ROUND X4'],
  },
  {
    file:       'ROUND X5.png',
    public_id:  'adik-round-x5',
    folder:     'matkasym/home',
    patterns:   ['ROUND X5'],
  },
  {
    file:       'SLOTTED A5.png',
    public_id:  'adik-slotted-a5',
    folder:     'matkasym/home',
    patterns:   ['SLOTTED A5'],
  },
  {
    file:       'SLOTTED B3.png',
    public_id:  'adik-slotted-b3',
    folder:     'matkasym/home',
    patterns:   ['SLOTTED B3'],
  },
];

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Подключено к MongoDB\n');

  for (const { file, public_id, folder, patterns } of PHOTOS) {
    const filePath = path.join(DIR, file);
    console.log(`📤 Загружаем ${file}...`);

    const result = await cloudinary.uploader.upload(filePath, {
      folder,
      public_id,
      overwrite: true,
    });
    const imageUrl = result.secure_url;
    console.log(`   ✅ ${imageUrl}`);

    // Find products matching any of the patterns
    const regex = new RegExp(patterns.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');
    const products = await Product.find({
      $or: [{ fullName: regex }, { name: regex }],
    });

    if (products.length === 0) {
      console.log(`   ⚠️  Товары не найдены для паттернов: ${patterns.join(', ')}\n`);
      continue;
    }

    for (const p of products) {
      await Product.updateOne({ _id: p._id }, { $set: { images: [imageUrl] } });
      console.log(`   → ${p.fullName || p.name}`);
    }
    console.log();
  }

  await mongoose.disconnect();
  console.log('✅ Готово');
}

main().catch(err => { console.error(err); process.exit(1); });
