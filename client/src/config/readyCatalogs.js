// Сеты с готовым свёрстанным каталогом: кнопка «PDF» скачивает этот файл, а не собирает
// PDF на лету. Цены в файлах розничные, поэтому для опта и дилеров собираем как раньше.
// Файлы заливают скрипты server/scripts/build-<сет>-catalog.js с флагом --upload.
import { adminCatalogFile } from '../api/index';

const RAW = 'https://res.cloudinary.com/dnbg21ef8/raw/upload/matkasym/catalogs';

const file = (key, name, title) => ({ key, url: `${RAW}/${name}.pdf`, filename: `Каталог ${title}.pdf` });
const setFile = (slug, name, title) => file(`set:${slug}`, name, title);

export const READY_PDF = {
  'uzak-koldon':     setFile('uzak-koldon', 'uzak-koldon', 'UZAK KOLDON'),
  'mazza-seyil':     setFile('mazza-seyil', 'mazza-seyil', 'MAZZA SEYIL'),
  'onoi-sakta':      setFile('onoi-sakta', 'onoy-sakta', 'ONOY SAKTA'),
  '0-tashtandy':     setFile('0-tashtandy', '0-tastandy', '0-TASTANDY'),
  'bilim-kelechek':  setFile('bilim-kelechek', 'bilim-kelechek', 'BILIM KELECHEK'),
  'bekem-fasad':     setFile('bekem-fasad', 'bekem-fasad', 'BEKEM FASAD'),
  'kooz-koopsuzduk': setFile('kooz-koopsuzduk', 'kooz-koopsuzduk', 'KOOZ KOOPSUZDUK'),
  'bekem-tosmo':     setFile('bekem-tosmo', 'bekem-tosmo', 'BEKEM TOSMO'),
};

// Файлы свёрстаны для SHAAR. Ключи сетов у брендов совпадают (kooz-koopsuzduk и bekem-fasad есть
// и в HOME), поэтому без проверки бренда HOME скачивал бы чужой каталог.
export const readyPdfFor = (setSlug, brandKey) => (brandKey === 'matkasym-shaar' ? READY_PDF[setSlug] : undefined) || null;

// Весь бренд, любой тип цены. SHAAR в рознице — общий каталог (лёгкая версия); адрес есть всегда.
// У остальных файла может ещё не быть: тогда кнопка собирает каталог в браузере.
const BRANDS = ['matkasym-home', 'matkasym-shaar', 'matkasym-kyzmat'];
export const brandReadyPdf = (brandKey, priceType) => {
  if (!BRANDS.includes(brandKey)) return null;
  const key = `brand:${brandKey}:${priceType}`;
  return brandKey === 'matkasym-shaar' && priceType === 'price'
    ? file(key, 'shaar', 'MATKASYM SHAAR')
    : { key, url: null, filename: 'Каталог.pdf' };
};

const isPhone = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

function saveFile({ url, filename }) {
  // На телефоне PDF открывает сама система: не грузим файл в память, а blob-скачивание
  // не работает во встроенных браузерах (Telegram и другие)
  if (isPhone()) {
    if (!window.open(url, '_blank')) window.location.href = url;
    return Promise.resolve();
  }
  // Адрес содержит версию файла: один раз скачанное браузер берёт из своего кэша
  return fetch(url).then(res => {
    if (!res.ok) throw new Error(res.status);
    return res.blob();
  }).then(blob => {
    const href = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href, download: filename });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10000);
  }).catch(() => { window.open(url, '_blank'); });
}

const WAIT_MS = 6 * 60 * 1000, POLL_MS = 8000;

// true — файл отдан; false — файла нет, пусть кнопка собирает каталог сама.
// Данные не менялись — сервер сразу отдаёт сохранённый файл. Изменились — идёт сборка: ждём её,
// а если долго или сборка не запустилась, отдаём последний файл, новый будет к следующему разу.
export async function downloadReady(ready, onUpdating) {
  let info;
  try {
    ({ data: info } = await adminCatalogFile(ready.key));
    if (info.status === 'building' && info.instant) {
      onUpdating?.();
      const until = Date.now() + WAIT_MS;
      while (info.status === 'building' && Date.now() < until) {
        await new Promise(r => setTimeout(r, POLL_MS));
        ({ data: info } = await adminCatalogFile(ready.key));
      }
    }
  } catch {
    // Сервер недоступен: у свёрстанных каталогов есть постоянный адрес
    if (!ready.url) return false;
    await saveFile(ready);
    return true;
  }
  const url = info.url || ready.url;
  if (!url) return false;
  await saveFile({ url, filename: info.filename || ready.filename });
  if (info.status !== 'ready') alert('В каталоге есть изменения, новый файл ещё собирается. Сейчас скачана последняя готовая версия.');
  return true;
}
