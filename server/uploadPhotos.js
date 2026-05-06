require('dotenv').config();
const mongoose   = require('mongoose');
const cloudinary = require('cloudinary').v2;
const Product    = require('./models/Product');
const fs         = require('fs');

const MONGO_URI = 'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym?appName=M0';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function norm(s) {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ DB connected');

  const imageMap = JSON.parse(fs.readFileSync('/tmp/pdf_product_images.json', 'utf8'));
  console.log(`PDF images available: ${Object.keys(imageMap).length}`);

  // Get products without photos
  const noPhotoProducts = await Product.find({
    brand: 'matkasym-home',
    $or: [
      { images: { $exists: false } },
      { images: { $size: 0 } },
      { images: null },
    ],
  }).select('name images').lean();

  console.log(`Products without photos: ${noPhotoProducts.length}`);

  // Build normalized lookup for PDF images
  const normMap = new Map();
  for (const [name, path] of Object.entries(imageMap)) {
    normMap.set(norm(name), { path, original: name });
  }

  let uploaded = 0;
  let notFound = 0;

  for (const p of noPhotoProducts) {
    const dbNorm = norm(p.name);
    let imgInfo = null;

    // 1. Exact normalized match
    if (normMap.has(dbNorm)) {
      imgInfo = normMap.get(dbNorm);
    }

    // 2. Prefix match (DB name is prefix of PDF name)
    if (!imgInfo) {
      for (const [pdfNorm, info] of normMap) {
        if (pdfNorm.startsWith(dbNorm + ' ') || pdfNorm.startsWith(dbNorm + '(')) {
          imgInfo = info;
          break;
        }
      }
    }

    // 3. PDF name is prefix of DB name
    if (!imgInfo) {
      for (const [pdfNorm, info] of normMap) {
        if (dbNorm.startsWith(pdfNorm + ' ') || dbNorm.startsWith(pdfNorm + '(')) {
          imgInfo = info;
          break;
        }
      }
    }

    if (!imgInfo || !fs.existsSync(imgInfo.path)) {
      notFound++;
      continue;
    }

    try {
      const result = await cloudinary.uploader.upload(imgInfo.path, {
        folder: 'matkasym',
        transformation: [{ width: 1024, height: 1024, crop: 'limit', quality: 'auto' }],
      });

      await Product.updateOne(
        { _id: p._id },
        { $set: { images: [result.secure_url] } },
      );
      uploaded++;
      console.log(`✅ [${uploaded}] ${p.name}`);
    } catch (err) {
      console.error(`❌ ${p.name}: ${err.message}`);
    }
  }

  console.log(`\n✅ Загружено: ${uploaded}`);
  console.log(`⚠️ Не найдено в PDF: ${notFound}`);

  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
