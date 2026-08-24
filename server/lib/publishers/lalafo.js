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

// Характеристики строкой: «Көлөмү: 135 л. Материалы: болот». Ключи и типовые
// значения переводим, числа и модели оставляем как есть.
function specsLine(product) {
  return (product.specs || [])
    .filter(s => s && s.key && String(s.value).trim())
    .map(s => `${translateSpecKey(s.key, 'ky')}: ${translateSpecValue(s.value, 'ky')}`)
    .join('. ');
}

// Лалафо скачивает картинки по ссылке, поэтому трансформации Cloudinary не трогаем:
// в выгрузку идут исходные URL, как в файлах, которые заливали руками.
const photosOf = product => (product.images || []).filter(Boolean).slice(0, MAX_PHOTOS);

function buildItem(product, publication) {
  return {
    product:     product._id,
    publication: publication?._id,
    sku:         product.sku || '',
    // Название — русское, как в каталоге: на площадке ищут по-русски
    title:       product.fullName || product.name || '',
    specs:       specsLine(product),
    // Описание карточки на сайте уже кыргызское — берём его как есть
    description: String(product.description || '').trim() || postTitle(product, 'ky'),
    price:       PRICE_LABEL,
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
