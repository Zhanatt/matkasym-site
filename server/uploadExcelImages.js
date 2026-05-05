/**
 * Upload product images from Excel extraction to Cloudinary and update DB.
 * Source: /tmp/product_images.json + /tmp/product_images/*.png
 *
 * Usage:
 *   node server/uploadExcelImages.js          # dry-run: show matches only
 *   node server/uploadExcelImages.js --execute # upload and update DB
 *   node server/uploadExcelImages.js --execute --overwrite  # also replace existing images
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const mongoose   = require('mongoose');
const cloudinary = require('./lib/cloudinary');
const Product    = require('./models/Product');
const fs         = require('fs');
const path       = require('path');

const MONGO_URI     = 'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym?appName=M0';
const JSON_FILE     = '/tmp/product_images.json';
const IMG_DIR       = '/tmp/product_images';
const EXECUTE       = process.argv.includes('--execute');
const SKIP_EXISTING = !process.argv.includes('--overwrite');
const MIN_IMG_SIZE  = 200;   // bytes — skip tiny placeholder images
const CONCURRENCY   = 8;     // parallel Cloudinary uploads

function norm(s) {
  return (s || '').toLowerCase()
    .replace(/ё/g, 'е')
    // Map Cyrillic lookalikes → correct Latin equivalents
    .replace(/а/g, 'a').replace(/е/g, 'e').replace(/о/g, 'o')
    .replace(/р/g, 'r').replace(/с/g, 's').replace(/х/g, 'x')
    // Keep both Latin a-z AND remaining Cyrillic а-я so words like Стул≠Стол
    .replace(/[^a-zа-я0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarity(a, b) {
  const na = norm(a), nb = norm(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  const ta = new Set(na.split(' ').filter(Boolean));
  const tb = new Set(nb.split(' ').filter(Boolean));
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  return (2 * common) / (ta.size + tb.size);
}

async function uploadFile(imgFile) {
  const result = await cloudinary.uploader.upload(imgFile, {
    folder: 'matkasym/home',
    use_filename: false,
    unique_filename: true,
  });
  return result.secure_url;
}

async function processInBatches(tasks, concurrency) {
  let i = 0, done = 0;
  const total = tasks.length;
  async function worker() {
    while (i < total) {
      const task = tasks[i++];
      await task();
      done++;
      if (done % 50 === 0) console.log(`  Progress: ${done}/${total}`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
}

async function main() {
  const excelData = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
  console.log(`Excel products: ${excelData.length}`);

  await mongoose.connect(MONGO_URI);
  const products = await Product.find({}, 'name fullName images').lean();
  console.log(`DB products: ${products.length}`);

  let matched = 0, skipped = 0, noMatch = 0, uploaded = 0;
  const toUpload = [];   // { entry, best, imgFiles }
  const results  = [];

  for (const entry of excelData) {
    if (!entry.images || entry.images.length === 0) continue;

    let best = null, bestScore = 0;
    for (const p of products) {
      const s = Math.max(similarity(entry.name, p.fullName), similarity(entry.name, p.name));
      if (s > bestScore) { bestScore = s; best = p; }
    }

    const imgFiles = entry.images.map(f => path.join(IMG_DIR, f))
      .filter(f => fs.existsSync(f) && fs.statSync(f).size >= MIN_IMG_SIZE);

    if (imgFiles.length === 0) { skipped++; continue; }

    if (!best || bestScore < 0.4) {
      results.push({ status: 'NO_MATCH', name: entry.name, score: bestScore });
      noMatch++;
      continue;
    }

    const needsImages = !(SKIP_EXISTING && best.images && best.images.length > 0);

    if (!EXECUTE) {
      results.push({
        status: 'MATCH',
        excelName: entry.name,
        dbName:    best.fullName || best.name,
        price:     entry.price,
        score:     Math.round(bestScore * 100),
        images:    entry.images,
        alreadyHasImages: !!(best.images && best.images.length),
        willUploadImages: needsImages,
      });
      matched++;
      continue;
    }

    toUpload.push({ entry, best, imgFiles, needsImages });
    matched++;
  }

  if (!EXECUTE) {
    console.log('\n=== DRY RUN ===');
    console.log(`Would upload: ${matched}`);
    console.log(`No match:     ${noMatch}`);
    console.log(`Skip:         ${skipped}`);

    const lowScore = results.filter(r => r.status === 'MATCH' && r.score < 70);
    if (lowScore.length) {
      console.log('\nLow-confidence matches (review before executing):');
      lowScore.forEach(r => console.log(`  [${r.score}%] "${r.excelName}" → "${r.dbName}"`));
    }
    const noMatchList = results.filter(r => r.status === 'NO_MATCH');
    if (noMatchList.length) {
      console.log('\nNo DB match found:');
      noMatchList.forEach(r => console.log(`  "${r.name}"`));
    }
    console.log('\nRun with --execute to upload.');
    await mongoose.disconnect();
    return;
  }

  console.log(`\nUploading ${toUpload.length} products (concurrency ${CONCURRENCY})...`);

  let priceUpdated = 0;
  const tasks = toUpload.map(({ entry, best, imgFiles, needsImages }) => async () => {
    const update = {};

    if (needsImages) {
      const urls = [];
      for (const f of imgFiles) {
        try { urls.push(await uploadFile(f)); }
        catch (e) { console.error(`  ✗ ${path.basename(f)}: ${e.message}`); }
      }
      if (urls.length > 0) {
        update.images = urls;
        uploaded++;
      }
    }

    if (entry.price) {
      update.price = Number(entry.price);
      priceUpdated++;
    }

    if (Object.keys(update).length > 0) {
      await Product.updateOne({ _id: best._id }, { $set: update });
      const tag = needsImages && update.images ? '📷+💰' : '💰';
      console.log(`  ${tag} ${entry.name.slice(0, 40)} цена=${entry.price}`);
    }
  });

  await processInBatches(tasks, CONCURRENCY);

  console.log('\n=== REPORT ===');
  console.log(`Photos uploaded: ${uploaded} products`);
  console.log(`Prices updated:  ${priceUpdated} products`);
  console.log(`No match:        ${noMatch}`);
  console.log(`Skipped (no real image, placeholder): ${skipped}`);

  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
