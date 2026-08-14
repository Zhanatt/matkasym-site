import { cloudinaryOpt, driveThumb } from '../../utils/drive';

export const NO_PHOTO = '/logos/no-photo.png';

// Фото товара: сперва Cloudinary, потом Google Drive, потом заглушка.
// Порядок тот же, что в админке, — иначе в магазине и в карточке разные картинки.
export const photoOf = (p, width = 500) => {
  const cloud = (p?.images || []).find(Boolean);
  if (cloud) return cloudinaryOpt(cloud, width);
  const drive = (p?.driveImages || []).find(Boolean);
  if (drive) return driveThumb(drive, width);
  return NO_PHOTO;
};

// Все фото товара для галереи карточки
export const photosOf = (p, width = 900) => {
  const list = [
    ...(p?.images || []).filter(Boolean).map(u => cloudinaryOpt(u, width)),
    ...(p?.driveImages || []).filter(Boolean).map(id => driveThumb(id, width)),
  ];
  return list.length ? list.slice(0, 8) : [NO_PHOTO];
};

export const money = n => `${Number(n || 0).toLocaleString('ru')} сом`;

// «kosh-keliniz» → «Kosh Keliniz»: имена сетов латиницей и читаются как есть
export const setLabel = s => String(s || '')
  .replace(/-/g, ' ')
  .replace(/\b\w/g, c => c.toUpperCase());

// Наличие показываем словами: точный остаток — внутренняя цифра, покупателю она
// ничего не говорит, а «осталось 2 шт.» подталкивает не тянуть с заявкой.
export const stockLabel = stock => {
  const n = Number(stock || 0);
  if (n <= 0) return 'Нет в наличии';
  if (n <= 3) return `Осталось ${n} шт.`;
  return 'В наличии';
};

export const STATUS_LABELS = {
  new:          'Ждёт менеджера',
  in_stock:     'Есть в наличии',
  out_of_stock: 'Нет в наличии',
  done:         'Обработана',
  canceled:     'Отменена',
};
