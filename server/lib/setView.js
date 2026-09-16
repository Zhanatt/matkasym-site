/**
 * Одна карточка — несколько сетов.
 *
 * Товар лежит в своём сете (Product.set), но может показываться и в чужом:
 * стеллажи ADIK HOME стоят и в Baary Oorunda (Matkasym Home), и в Onoy Sakta
 * (Matkasym Shaar). Копии карточки нет — фото, характеристики, остаток и история
 * общие, правится товар в одном месте. Чужие места лежат в Product.alsoIn.
 *
 * У места может быть своя база 1С: в Baary Oorunda этими стеллажами торгует
 * Make-in, в Onoy Sakta — Matkasym. Тогда на витрине сета стоят остаток и цены
 * именно этой базы, а не сумма по Кыргызстану.
 */
const { BASES } = require('./stockBases');

// Выборка «товары этого сета»: свои плюс те, кого сюда одолжили.
const setMatch = slug => ({ $or: [{ set: slug }, { alsoIn: { $elemMatch: { set: slug } } }] });

// Где товар стоит в этом сете: собственный сет или запись alsoIn. null — не стоит.
function placementOf(product, slug) {
  if (!slug || !product) return null;
  if (product.set === slug) return { set: slug, brand: product.brand, base: product.stockBase || '' };
  const extra = (product.alsoIn || []).find(a => a && a.set === slug);
  return extra ? { set: slug, brand: extra.brand || product.brand, base: extra.base || '' } : null;
}

/**
 * Карточка глазами сета: остаток и цены той базы, что за этот сет отвечает.
 *
 * Остаток берём как есть — ноль у базы значит ноль на её складе.
 * Цену — только если она у базы заполнена: пустая строка прайса почти всегда
 * значит «прайс этой базы ещё не загружали», а карточка без цены продавцу
 * бесполезна. На такой позиции остаётся общая цена товара.
 *
 * Идентичность (brand, set, _id) не трогаем: карточка одна и живёт в своём сете,
 * подменить её поля здесь — значит однажды сохранить подмену обратно в базу.
 *
 * country — каталог какой страны открыт. База обслуживает свою страну, и в
 * казахстанском каталоге кыргызские остатки подставлять нельзя.
 *
 * Работает по простому объекту (lean): mongoose-документ спредом не копируется.
 */
function viewForSet(product, slug, country = 'KG') {
  // Служебные поля нужны только здесь — наружу они лишний вес в каждой карточке.
  const { pricesByBase, bufferByBase, alsoIn, stockBase, ...card } = product;

  const base = placementOf(product, slug)?.base;
  if (!base || BASES[base]?.country !== (country || 'KG')) return card;

  const stock  = product.stockByBase?.[base] || 0;
  const prices = pricesByBase?.[base] || {};
  return {
    ...card,
    stock,
    inStock:        stock > 0,
    bufferStock:    bufferByBase?.[base] || 0,
    price:          prices.retail    || card.price,
    priceWholesale: prices.wholesale || card.priceWholesale,
    priceDealer:    prices.dealer    || card.priceDealer,
    // Чьи это цифры — подпись для витрины.
    _setView: { set: slug, base, baseLabel: BASES[base].label },
  };
}

// Поля, без которых viewForSet не посчитает витрину сета (в BRIEF_FIELDS их нет).
const SET_VIEW_FIELDS = 'alsoIn stockBase pricesByBase bufferByBase';

module.exports = { setMatch, placementOf, viewForSet, SET_VIEW_FIELDS };
