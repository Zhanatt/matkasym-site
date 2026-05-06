/**
 * Помечает товары не найденные в 1С тегом 'not-in-1c'
 * Убирает тег у тех, кто теперь найден в 1С
 * Запуск: node server/tagNotIn1C.js [--execute]
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Product  = require('./models/Product');
const fs       = require('fs');

const MONGO_URI = 'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym?appName=M0';
const EXECUTE   = process.argv.includes('--execute');

function norm(s = '') {
  return s
    .toLowerCase()
    .replace(/[«»"""''`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  const raw = JSON.parse(fs.readFileSync('/tmp/stock_map.json', 'utf8'));
  const stockKeys = new Set(Object.keys(raw).map(norm));

  await mongoose.connect(MONGO_URI);
  console.log('✅ MongoDB подключено\n');

  const products = await Product.find({});

  let tagged = 0, untagged = 0;

  for (const p of products) {
    const key = norm(p.fullName || p.name || '');
    const inMap = stockKeys.has(key);
    const hasTag = (p.tags || []).includes('not-in-1c');

    if (!inMap && !hasTag) {
      if (EXECUTE) await Product.updateOne({ _id: p._id }, { $addToSet: { tags: 'not-in-1c' } });
      tagged++;
    } else if (inMap && hasTag) {
      if (EXECUTE) await Product.updateOne({ _id: p._id }, { $pull: { tags: 'not-in-1c' } });
      untagged++;
    }
  }

  if (EXECUTE) {
    console.log(`✅ Помечено 'not-in-1c': ${tagged}`);
    console.log(`✅ Снят тег (теперь в 1С): ${untagged}`);
  } else {
    console.log(`⚠️  DRY RUN`);
    console.log(`   Будет помечено: ${tagged}`);
    console.log(`   Будет снят тег: ${untagged}`);
    console.log('   Запустите с --execute для записи в БД');
  }

  await mongoose.disconnect();
  console.log('\n✅ Готово');
}

main().catch(err => { console.error(err); process.exit(1); });
