// Комплект — карточка, собранная из других карточек (стул ANTILOP = сиденье +
// ножки + поднос). Здесь всё, что происходит при правке состава: детали прячутся
// из каталога, комплекту складываются цены по деталям, а у зависимого комплекта
// пересчитывается ещё и остаток.
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

// Три прайса комплекта считаем одинаково: цена детали умножается на её
// количество в комплекте. Себестоимость сюда не берём — её ведут отдельно
// и показывают только владельцу.
const PRICE_FIELDS = ['price', 'priceWholesale', 'priceDealer'];

// Цена комплекта = сумма деталей по каждому прайсу. Если хоть одна деталь
// потерялась, цену не выдумываем: пусть лучше останется прежняя, чем неполная.
function kitPricesFromParts(kitParts, partById) {
  const usable = (kitParts || []).filter(part => partById.has(partIdOf(part)));
  if (!usable.length || usable.length !== (kitParts || []).length) return null;

  return Object.fromEntries(PRICE_FIELDS.map(field => [
    field,
    usable.reduce((sum, part) => sum + (partById.get(partIdOf(part))[field] || 0) * (part.qty || 1), 0),
  ]));
}

// Пересчёт комплекта после правки состава — сразу, не дожидаясь ближайшей
// синхронизации с 1С.
//
// Только зависимый комплект: у независимого (SKÅDIS, BOAXEL) детали
// самодостаточны, у него не показывают ни цену комплекта, ни «сколько
// соберётся» — складывать там нечего.
async function recalcKit(kit) {
  if (!kit?.isKit || kit.kitType === 'independent' || !kit.kitParts?.length) return null;

  const parts = await Product.find(
    { _id: { $in: idsOf(kit.kitParts) } },
    ['_id', 'stockByBase', ...PRICE_FIELDS].join(' '),
  ).lean();
  const partById = new Map(parts.map(p => [String(p._id), p]));

  const prices = kitPricesFromParts(kit.kitParts, partById);
  const calc   = kitStockFromParts(kit.kitParts, partById);

  // Нулевую сумму в комплект не записываем. У деталей прайс заполнен не всегда
  // (в 1С их ведут как номенклатуру, без розницы и дилерской), и пустой прайс
  // деталей затёр бы живую цену комплекта — то есть цену на сайте.
  const $set = Object.fromEntries(Object.entries(prices || {}).filter(([, sum]) => sum > 0));
  if (calc) Object.assign($set, {
    stock: calc.stock,
    inStock: calc.stock > 0,
    stockStatus: calc.stock > 0 ? 'in_stock' : 'out_of_stock',
    ...Object.fromEntries(BASE_KEYS.map(b => [`stockByBase.${b}`, calc.byBase[b]])),
  });
  if (!Object.keys($set).length) return null;

  await Product.updateOne({ _id: kit._id }, { $set });
  return { stock: calc ? calc.stock : null, prices };
}

module.exports = {
  applyPartStatuses, recalcKit, kitStockFromParts, kitPricesFromParts,
  partIdOf, PRICE_FIELDS, PART_STATUS, FREE_STATUS,
};
