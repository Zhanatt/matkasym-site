/**
 * importCross.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads /tmp/cross_products.json and imports each product into MongoDB.
 * If a matching photo exists in ~/Desktop/cross_photos/ it is uploaded
 * to Cloudinary first, then stored as images[0].
 *
 * Usage:
 *   MONGO_URI=<atlas-uri> node server/importCross.js [--dry-run]
 *
 * Photos are matched by normalizing the product name (lowercase, spaces→_)
 * and checking for any image file that starts with or contains that slug.
 * Supported extensions: jpg, jpeg, png, webp
 *
 * Duplicates (same name + set) are skipped.
 */

require('dotenv').config();
const mongoose   = require('mongoose');
const cloudinary = require('cloudinary').v2;
const fs         = require('fs');
const path       = require('path');

const CROSS_JSON  = '/tmp/cross_products.json';
const PHOTOS_DIR  = path.join(process.env.HOME, 'Desktop', 'cross_photos');
const DRY_RUN     = process.argv.includes('--dry-run');

// ─── Cloudinary config ───────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ─── Mongoose model ──────────────────────────────────────────────────────────
const Product = require('./models/Product');

// ─── Helpers ─────────────────────────────────────────────────────────────────
function slugify(str) {
  return str.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '_').replace(/^_|_$/g, '');
}

/** Find a photo file whose name (without ext) contains the product name slug */
function findPhoto(productName, photoFiles) {
  const slug = slugify(productName);
  // try exact match first
  for (const f of photoFiles) {
    const base = path.basename(f, path.extname(f));
    if (slugify(base) === slug) return f;
  }
  // then partial match
  for (const f of photoFiles) {
    const base = path.basename(f, path.extname(f));
    if (slugify(base).includes(slug) || slug.includes(slugify(base))) return f;
  }
  return null;
}

async function uploadPhoto(filePath) {
  const result = await cloudinary.uploader.upload(filePath, {
    folder: 'matkasym/cross',
    use_filename: true,
    unique_filename: true,
    overwrite: false,
  });
  return result.secure_url;
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(CROSS_JSON)) {
    console.error('cross_products.json not found. Run extractCross.py first.');
    process.exit(1);
  }

  const crossProducts = JSON.parse(fs.readFileSync(CROSS_JSON, 'utf8'));
  console.log(`Loaded ${crossProducts.length} cross products from JSON`);

  // Collect available photo files
  const photoFiles = fs.existsSync(PHOTOS_DIR)
    ? fs.readdirSync(PHOTOS_DIR)
        .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
        .map(f => path.join(PHOTOS_DIR, f))
    : [];
  console.log(`Found ${photoFiles.length} photo files in ${PHOTOS_DIR}`);

  if (!DRY_RUN) {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
  }

  let inserted = 0, skipped = 0, photosUploaded = 0, errors = 0;

  for (const item of crossProducts) {
    try {
      // Check duplicate
      if (!DRY_RUN) {
        const exists = await Product.exists({ name: item.name, set: item.set });
        if (exists) { skipped++; continue; }
      }

      // Photo lookup + upload
      let imageUrl = '';
      const photoPath = findPhoto(item.name, photoFiles);
      if (photoPath) {
        if (!DRY_RUN) {
          imageUrl = await uploadPhoto(photoPath);
          photosUploaded++;
        } else {
          imageUrl = `[DRY-RUN] would upload ${path.basename(photoPath)}`;
          photosUploaded++;
        }
      }

      const doc = {
        name:          item.name,
        fullName:      item.name,
        brand:         'matkasym-home',
        set:           item.set,
        category:      'other',
        price:         0,
        images:        imageUrl ? [imageUrl] : [],
        inStock:       (item.qty ?? 0) > 0,
        stock:         Math.round(item.qty ?? 0),
        productStatus: 'for_sale',
      };

      if (DRY_RUN) {
        console.log(`[DRY] ${item.set.padEnd(20)} ${item.name}${imageUrl ? ' 📷' : ''}`);
      } else {
        await Product.create(doc);
      }
      inserted++;
    } catch (err) {
      console.error(`Error importing "${item.name}":`, err.message);
      errors++;
    }
  }

  console.log('\n─── Import summary ───────────────────────────────');
  console.log(`  Inserted:  ${inserted}`);
  console.log(`  Skipped:   ${skipped}  (already in DB)`);
  console.log(`  Photos:    ${photosUploaded} uploaded`);
  console.log(`  Errors:    ${errors}`);

  if (!DRY_RUN) await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
