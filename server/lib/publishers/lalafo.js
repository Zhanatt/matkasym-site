/**
 * «Публикация» на Лалафо.
 *
 * У площадки нет открытого API: объявления заливаются файлом заданного формата,
 * поэтому отправить пост, как в Instagram, физически нельзя. Публикатор делает
 * то единственное, что имеет смысл автоматизировать, — собирает готовую карточку
 * объявления в момент публикации и кладёт в очередь на выгрузку. Дальше в журнале
 * скачивается один xlsx со всем накопленным.
 *
 * Собираем именно здесь, а не в момент скачивания: у товара за неделю поменяются
 * фото и описание, а объявление должно уйти таким, каким его выпускали.
 *
 * Формат файла (13 колонок) продиктован импортом Лалафо: название по-русски —
 * по нему ищут; характеристики и описание по-кыргызски — на этом языке читают
 * карточку; цена договорная у всех.
 */
const LalafoItem = require('../../models/LalafoItem');
const { translateSpecKey, translateSpecValue } = require('../postLang');
const { postTitle } = require('../postCaption');

const PRICE_LABEL = 'Келишим боюнча / Договорная';
const MAX_PHOTOS  = 8;

// Характеристики карточки — внутренние: там лежит и себестоимость, и логистика,
// и поставщик. В объявление на площадку это уходить не должно ни при каких
// условиях: «Цена EXW: 395 ¥» — закупочная цена, «Кол-во в коробке: 10» и
// «Вес брутто» — данные для растаможки, «Страна производства» и «Бренд» выдают
// поставщика. Клиенту всё это не адресовано, а конкуренту адресовано вполне.
//
// Список запретов ведём здесь, а не в месте выгрузки: объявление собирается и
// при публикации, и при выгрузке сета — фильтр должен быть один.
const SPEC_BLOCK = [
  /цена|себестоим|закуп|exw/i,        // деньги закупки
  /упаков|брутто/i,                    // «Размер упаковки», «Вес в упаковке», «Вес брутто»
  /кол-?во в коробке|количество в пачке/i,
  /в прайсе|артикул|бренд/i,           // «Название в прайсе (кит.)», «Артикул IKEA»
  /страна производства/i,
];

// «Объём» бывает и свойством товара («Объём: 660 л» у бака), и объёмом коробки
// («0.049 м³»). Первое клиенту нужно, второе нет — различаем по единице.
const isPackingVolume = s => /объ[ёе]м|көлөмү/i.test(s.key) && /м³|m3/i.test(String(s.value));

const isPublicSpec = s =>
  s && s.key && String(s.value).trim()
  && !SPEC_BLOCK.some(re => re.test(s.key))
  && !isPackingVolume(s);

// Характеристики строкой: «Көлөмү: 135 л. Материалы: болот». Ключи и типовые
// значения переводим, числа и модели оставляем как есть.
function specsLine(product) {
  return (product.specs || [])
    .filter(isPublicSpec)
    .map(s => `${translateSpecKey(s.key, 'ky')}: ${translateSpecValue(s.value, 'ky')}`)
    .join('. ');
}

// Лалафо скачивает картинки по ссылке, поэтому трансформации Cloudinary не трогаем:
// в выгрузку идут исходные URL, как в файлах, которые заливали руками.
const photosOf = product => (product.images || []).filter(Boolean).slice(0, MAX_PHOTOS);

// Расшифровка кода вместо описания: «TR=Тумба Рама (чёрная рама + белые ящики)
// · 3=кол-во ящиков». Узнаём по связке «знак равенства + разделитель ·» —
// в человеческом описании так не пишут.
const internalNote = text => {
  const t = String(text || '');
  return t.includes('=') && t.includes('·');
};

function buildItem(product, publication) {
  return {
    product:     product._id,
    publication: publication?._id,
    sku:         product.sku || '',
    // Название — русское, как в каталоге: на площадке ищут по-русски
    title:       product.fullName || product.name || '',
    specs:       specsLine(product),
    // Описание карточки на сайте уже кыргызское — берём его как есть.
    // Кроме случая, когда там лежит расшифровка артикула для своих:
    // «GK=Гардероб кофе/белый · 12=кол-во дверей». Это заметка для каталога,
    // а не текст объявления, и клиенту она ничего не говорит.
    description: internalNote(product.description)
      ? postTitle(product, 'ky')
      : String(product.description || '').trim() || postTitle(product, 'ky'),
    // Цена — розничная, голым числом. Формат «38 465 сом» импорт Лалафо не
    // принимает: toLocaleString разделяет разряды неразрывным пробелом (U+00A0),
    // и вместе со словом «сом» в числовом поле это уже не число.
    // Где розничной цены нет — договорная, как в исходном формате площадки.
    price:       product.price > 0 ? String(Math.round(product.price)) : PRICE_LABEL,
    photos:      photosOf(product),
  };
}

async function publish({ publication }) {
  const product = publication?.product;
  if (!product?._id) {
    return { ok: false, error: 'Лалафо принимает только посты по товару: у свободного поста нечего выгружать' };
  }
  if (!(product.images || []).length) {
    return { ok: false, error: 'У товара нет фото — объявление на Лалафо без картинок не принимают' };
  }

  // Один и тот же товар публикуют повторно; пока прошлая карточка не выгружена,
  // второй строки в файле быть не должно — обновляем ту же запись.
  const fields = buildItem(product, publication);
  const existing = await LalafoItem.findOne({ product: product._id, status: 'queued' });
  const item = existing
    ? await LalafoItem.findByIdAndUpdate(existing._id, { $set: fields }, { new: true })
    : await LalafoItem.create(fields);

  const warning = item.specs ? '' : 'у товара нет характеристик — в объявлении будет пусто';
  return {
    ok: true,
    externalId: String(item._id),
    warning: (existing ? 'обновлено объявление, уже стоявшее в очереди' : '')
      + (existing && warning ? '; ' : '') + warning,
  };
}

// Пока карточка не ушла в файл — её можно просто убрать из очереди.
async function unpublish({ externalId }) {
  const item = externalId ? await LalafoItem.findById(externalId) : null;
  if (!item) return { ok: true };
  if (item.status === 'exported') {
    return { ok: false, manual: true, error: 'Объявление уже выгружено — снимите его на самом Лалафо' };
  }
  await LalafoItem.deleteOne({ _id: item._id });
  return { ok: true };
}

module.exports = { publish, unpublish, buildItem, PRICE_LABEL };
