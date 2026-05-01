/**
 * importWarehouse.js
 * ──────────────────────────────────────────────────────────────────────────
 * Imports all 842 products from /tmp/all_products.json into MongoDB.
 *
 * Logic:
 *  - If product with same (name + set) exists → update stock only
 *  - If new → create with full data
 *
 * Usage:
 *   MONGO_URI=mongodb+srv://... node server/importWarehouse.js [--dry-run]
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs       = require('fs');

const JSON_FILE = '/tmp/all_products.json';
const DRY_RUN   = process.argv.includes('--dry-run');

const Product = require('./models/Product');

async function main() {
  const items = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
  console.log(`Loaded ${items.length} products from JSON`);

  if (!DRY_RUN) {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB\n');
  }

  let created = 0, updated = 0, skipped = 0, errors = 0;

  for (const item of items) {
    try {
      if (DRY_RUN) {
        console.log(`[DRY] ${item.brand.padEnd(16)} ${item.set.padEnd(28)} ${item.stock.toString().padStart(5)} шт.  ${item.name.slice(0,50)}`);
        created++;
        continue;
      }

      const existing = await Product.findOne({ name: item.name, set: item.set });

      if (existing) {
        // Update stock only
        await Product.updateOne(
          { _id: existing._id },
          {
            $set: {
              stock:      item.stock,
              stockKom:   item.stockKom,
              stockOsn:   item.stockOsn,
              inStock:    item.inStock,
              stockStatus: item.inStock ? 'in_stock' : 'out_of_stock',
            }
          }
        );
        updated++;
      } else {
        // Create new product
        await Product.create({
          name:         item.name,
          fullName:     item.fullName,
          brand:        item.brand,
          set:          item.set,
          category:     item.category,
          color:        item.color || '',
          dimensions:   item.dimensions || '',
          specs:        item.specs || [],
          price:        0,
          stock:        item.stock,
          inStock:      item.inStock,
          stockStatus:  item.inStock ? 'in_stock' : 'out_of_stock',
          productStatus:'for_sale',
          images:       [],
          driveImages:  [],
          tags:         [item.subcat, item.setDisplay].filter(Boolean),
        });
        created++;
      }
    } catch (err) {
      console.error(`Error: "${item.name}" — ${err.message}`);
      errors++;
    }
  }

  console.log('\n─── Import summary ───────────────────────────────────────');
  console.log(`  Created:  ${created}`);
  console.log(`  Updated:  ${updated}  (stock refreshed)`);
  console.log(`  Errors:   ${errors}`);

  if (!DRY_RUN) await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
