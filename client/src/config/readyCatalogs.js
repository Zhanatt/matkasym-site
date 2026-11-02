// Сеты с готовым свёрстанным каталогом: кнопка «PDF» скачивает этот файл, а не собирает
// PDF на лету. Цены в файлах розничные, поэтому для опта и дилеров собираем как раньше.
// Файлы заливают скрипты server/scripts/build-<сет>-catalog.js с флагом --upload.
const RAW = 'https://res.cloudinary.com/dnbg21ef8/raw/upload/matkasym/catalogs';

const file = (name, title) => ({ url: `${RAW}/${name}.pdf`, filename: `Каталог ${title}.pdf` });

export const READY_PDF = {
  'uzak-koldon':     file('uzak-koldon', 'UZAK KOLDON'),
  'mazza-seyil':     file('mazza-seyil', 'MAZZA SEYIL'),
  'onoi-sakta':      file('onoy-sakta', 'ONOY SAKTA'),
  '0-tashtandy':     file('0-tastandy', '0-TASTANDY'),
  'bilim-kelechek':  file('bilim-kelechek', 'BILIM KELECHEK'),
  'bekem-fasad':     file('bekem-fasad', 'BEKEM FASAD'),
  'kooz-koopsuzduk': file('kooz-koopsuzduk', 'KOOZ KOOPSUZDUK'),
  'bekem-tosmo':     file('bekem-tosmo', 'BEKEM TOSMO'),
};

// Общий каталог бренда: кнопка «PDF» при всех незамороженных сетах и розничных ценах.
// Лёгкая версия, её собирает server/scripts/build-shaar-catalog.js --upload.
export const READY_BRAND_PDF = {
  'matkasym-shaar': file('shaar', 'MATKASYM SHAAR'),
};

// Файлы свёрстаны для SHAAR. Ключи сетов у брендов совпадают (kooz-koopsuzduk и bekem-fasad есть
// и в HOME), поэтому без проверки бренда HOME скачивал бы чужой каталог.
export const readyPdfFor = (setSlug, brandKey) => (brandKey === 'matkasym-shaar' ? READY_PDF[setSlug] : undefined) || null;

const isPhone = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

export async function downloadReady({ url, filename }) {
  // На телефоне PDF открывает сама система: не грузим файл в память, а blob-скачивание
  // не работает во встроенных браузерах (Telegram и другие)
  if (isPhone()) {
    if (!window.open(url, '_blank')) window.location.href = url;
    return;
  }
  try {
    // no-cache — браузер спрашивает, менялся ли файл, и повторно не качает, если нет
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    const href = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href, download: filename });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10000);
  } catch {
    window.open(url, '_blank');
  }
}
