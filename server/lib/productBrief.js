// Краткий вид товара: то, что отдаёт список админки с brief=1 и на чём печатается PDF-каталог.
// Вынесено из routes/admin.js: то же самое нужно сборщику каталогов (scripts/build-generated-catalog.js).
const Product = require('../models/Product');

// Список сета рисует карточку: фото, название, цену, остаток и пару характеристик.
// Полный товар — описание, вся галерея, ТЗ, цены по базам — весит вчетверо больше
// и нужен только в самой карточке, а её открывают по клику и грузят отдельно.
const BRIEF_FIELDS = [
  'name', 'fullName', 'sku', 'brand', 'set', 'setLevel', 'color', 'category', 'dimensions', 'unit',
  'price', 'priceWholesale', 'priceDealer', 'priceCost', 'costCurrency', 'priceUndefined', 'currency',
  'stock', 'stockByBase', 'inBase', 'inStock', 'stockStatus', 'bufferStock',
  'isOnOrder', 'inTransit', 'inTransitQty', 'pendingReceive', 'pendingReceiveQty',
  'productStatus', 'isKit', 'kitType', 'kitParts', 'isSupplied', 'supplier', 'maker', 'hideInPdf', 'pdfGroup', 'pdfVariant', 'pdfSeries', 'pdfNote', 'pdfRange', 'pdfOrder', 'pdfPage', 'pdfRangeExtra', 'isNew', 'hasVideo',
  'images', 'specs', 'updatedAt', 'createdAt',
].join(' ');

// Комплект без своей цены — цену по уровню считаем суммой деталей, как
// «Итого за комплект» в карточке товара. Иначе в каталоге сета у него прочерк
// (ANTILOP, ALA-TOO парта+стул). Нет цены хоть у одной детали — уровень не трогаем.
const KIT_PRICE_TIERS = ['price', 'priceWholesale', 'priceDealer'];
async function attachKitPrices(products) {
  const kits = products.filter(p => p.isKit && p.kitParts?.length
    && KIT_PRICE_TIERS.some(t => !(p[t] > 0)));
  if (!kits.length) return;
  const ids = [...new Set(kits.flatMap(k => k.kitParts.map(part => String(part.product))))];
  const parts = await Product.find({ _id: { $in: ids } }).select(KIT_PRICE_TIERS.join(' ')).lean();
  const byId = new Map(parts.map(p => [String(p._id), p]));
  kits.forEach(kit => {
    KIT_PRICE_TIERS.forEach(tier => {
      if (kit[tier] > 0) return;
      let sum = 0;
      for (const part of kit.kitParts) {
        const price = byId.get(String(part.product))?.[tier];
        if (!(price > 0)) return;
        sum += price * (part.qty || 1);
      }
      kit[tier] = sum;
    });
  });
}

module.exports = { BRIEF_FIELDS, attachKitPrices };
