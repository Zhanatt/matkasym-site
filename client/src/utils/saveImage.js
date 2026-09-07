// Saving product photos to a phone.
// `a.download` puts the file into Downloads, and the gallery doesn't index that
// folder — so on touch devices we hand the file to the system share sheet instead:
// there it's "Save to Google Photos" on Android and "Save Image" on iOS.

// Убираем трансформации Cloudinary — нужен оригинал во весь размер, но просим
// его сжать: f_auto отдаёт формат, который понимает браузер, q_auto подбирает
// качество. Размер картинки не меняется, а весит она в разы меньше исходного
// PNG — это решает не только ожидание, но и главное: на iOS кнопка «Поделиться»
// работает лишь пока свежо касание пользователя, и загрузка на три мегабайта
// съедала это время. Из-за неё телефон предлагал «Файлы» и «Диск» вместо
// «Сохранить изображение».
export const imgOriginal = (url) => {
  if (!url) return url;
  if (url.includes('cloudinary.com')) {
    return url.replace(/\/upload\/[^/]+\//, '/upload/').replace('/upload/', '/upload/f_auto,q_auto:good/');
  }
  return url;
};

const EXT = { 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };

// The extension has to match the actual bytes: a .jpg holding webp data
// is what makes Android's gallery skip the file.
const fileName = (base, type) => {
  const safe = String(base || 'photo').replace(/[\\/:*?"<>|]/g, '_');
  return `${safe}.${EXT[type] || 'jpg'}`;
};

export const fetchImageFile = async (url, base) => {
  const blob = await fetch(imgOriginal(url)).then(r => r.blob());
  const type = blob.type?.startsWith('image/') ? blob.type : 'image/jpeg';
  return new File([blob], fileName(base, type), { type });
};

const saveToDisk = (file) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  // Revoking straight away can cut the download short in some browsers
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
};

// Держим уже скачанные файлы: карточку открывают, смотрят фото и только потом
// жмут «скачать». К этому моменту файл обычно уже лежит здесь, и «Поделиться»
// вызывается сразу — жест не успевает протухнуть.
const cache = new Map();

// Больше держать незачем: за раз смотрят одну карточку, а файлы это байты
// в памяти вкладки. Выкидываем самый старый.
const CACHE_MAX = 12;

export const prefetchImageFile = (url, base) => {
  if (!url || cache.has(url)) return;
  cache.set(url, fetchImageFile(url, base).catch(() => { cache.delete(url); return null; }));
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
};

export const getImageFile = (url, base) => {
  if (!cache.has(url)) prefetchImageFile(url, base);
  return cache.get(url) || fetchImageFile(url, base);
};

// Phones get the share sheet, desktop keeps the plain download
export const saveImageFiles = async (files) => {
  if (!files.length) return;
  const touch = window.matchMedia?.('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files })) {
    try {
      await navigator.share({ files });
      return;
    } catch (e) {
      // User closed the sheet — don't fall back to a download they didn't ask for
      if (e.name === 'AbortError') return;
      // NotAllowedError (iOS drops the user gesture across await) — fall through
    }
  }
  files.forEach(saveToDisk);
};
