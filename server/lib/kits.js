// Комплект — карточка, собранная из других карточек (стул ANTILOP = сиденье +
// ножки + поднос). Здесь всё, что происходит при правке состава: детали прячутся
// из каталога, а у зависимого комплекта пересчитывается остаток.
const Product = require('../models/Product');
const { BASE_KEYS, STOCK_SUM_BASES } = require('./stockBases');

// Деталь внутри комплекта не должна попадаться в каталоге, PDF и постах
// отдельной карточкой — её прячет статус kit_part.
const PART_STATUS = 'kit_part';
const FREE_STATUS = 'for_sale';

// Деталь приходит то ссылкой, то populate-объектом — id достаём из обоих видов.
const partIdOf = part => String(part?.product?._id || part?.product || part?._id || part || '');
const idsOf = parts => (parts || []).map(partIdOf).filter(Boolean);

// Сколько комплектов реально соберётся: по каждой базе отдельно (детали разных
// складов в один комплект не собрать), а итог — сумма по базам Кыргызстана.
function kitStockFromParts(kitParts, partById) {
  const usable = (kitParts || []).filter(part => partById.has(partIdOf(part)));
  if (!usable.length || usable.length !== (kitParts || []).length) return null;  // деталь потеряна — остаток не выдумываем

  const byBase = {};
  for (const b of BASE_KEYS) {
    byBase[b] = Math.min(...usable.map(part => {
      const src = partById.get(partIdOf(part)).stockByBase || {};
      return Math.floor((src[b] || 0) / (part.qty || 1));
    }));
  }
  return { byBase, stock: STOCK_SUM_BASES.reduce((n, b) => n + (byBase[b] || 0), 0) };
}

// Статусы деталей после правки состава: вошедшие прячем, выбывшие возвращаем
// в продажу. Прежний статус детали не помним — вернуть её в «на паузе» или
// «неликвид», если она там была, придётся руками.
//
// Прячем только детали зависимого комплекта. У независимого (SKÅDIS, BOAXEL)
// детали и есть товар: доску и крючки покупают порознь, а комплект — витрина.
async function applyPartStatuses(kitId, oldParts, newParts, isKit, kitType) {
  const hides  = isKit && kitType !== 'independent';
  const before = new Set(idsOf(oldParts));
  const after  = new Set(hides ? idsOf(newParts) : []);

  const added   = [...after].filter(id => !before.has(id) && id !== String(kitId));
  const removed = [...before].filter(id => !after.has(id));

  if (added.length) {
    await Product.updateMany({ _id: { $in: added } }, { $set: { productStatus: PART_STATUS } });
  }
  if (removed.length) {
    // деталь могла попасть в другой комплект — тогда она остаётся спрятанной
    const stillUsed = await Product.find(
      { _id: { $ne: kitId }, isKit: true, kitType: { $ne: 'independent' }, 'kitParts.product': { $in: removed } },
      'kitParts.product',
    ).lean();
    const busy = new Set(stillUsed.flatMap(k => idsOf(k.kitParts)));
    const free = removed.filter(id => !busy.has(id));
    if (free.length) {
      await Product.updateMany(
        { _id: { $in: free }, productStatus: PART_STATUS },
        { $set: { productStatus: FREE_STATUS } },
      );
    }
  }
  return { hidden: added.length, released: removed.length };
}

// Остаток зависимого комплекта — сразу после правки состава, не дожидаясь
// ближайшей синхронизации с 1С.
async function recalcKitStock(kit) {
  if (!kit?.isKit || kit.kitType === 'independent' || !kit.kitParts?.length) return null;

  const parts = await Product.find({ _id: { $in: idsOf(kit.kitParts) } }, '_id stockByBase').lean();
  const calc  = kitStockFromParts(kit.kitParts, new Map(parts.map(p => [String(p._id), p])));
  if (!calc) return null;

  await Product.updateOne({ _id: kit._id }, { $set: {
    stock: calc.stock,
    inStock: calc.stock > 0,
    stockStatus: calc.stock > 0 ? 'in_stock' : 'out_of_stock',
    ...Object.fromEntries(BASE_KEYS.map(b => [`stockByBase.${b}`, calc.byBase[b]])),
  } });
  return calc.stock;
}

module.exports = { applyPartStatuses, recalcKitStock, kitStockFromParts, partIdOf, PART_STATUS, FREE_STATUS };
