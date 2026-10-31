// Сеты с готовым свёрстанным каталогом: кнопка «PDF» скачивает этот файл, а не собирает
// PDF на лету. Цены в файлах розничные, поэтому для опта и дилеров собираем как раньше.
// Файлы заливают скрипты server/scripts/build-<сет>-catalog.js с флагом --upload.
const RAW = 'https://res.cloudinary.com/dnbg21ef8/raw/upload/matkasym/catalogs';

export const READY_PDF = {
  'uzak-koldon':    { url: `${RAW}/uzak-koldon.pdf`,    filename: 'Каталог UZAK KOLDON.pdf' },
  'onoi-sakta':     { url: `${RAW}/onoy-sakta.pdf`,     filename: 'Каталог ONOY SAKTA.pdf' },
  'bilim-kelechek': { url: `${RAW}/bilim-kelechek.pdf`, filename: 'Каталог BILIM KELECHEK.pdf' },
  'mazza-seyil':    { url: `${RAW}/mazza-seyil.pdf`,    filename: 'Каталог MAZZA SEYIL.pdf' },
};

export async function downloadReady({ url, filename }) {
  try {
    // ?t= — не отдавать из кэша браузера прошлую версию файла
    const res = await fetch(`${url}?t=${Date.now()}`);
    if (!res.ok) throw new Error(res.status);
    const href = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href, download: filename });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10000);
  } catch {
    window.open(url, '_blank');
  }
}
