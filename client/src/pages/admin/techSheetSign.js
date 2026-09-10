/**
 * Подстановка менеджера и заказчика в таблицу согласования технического листа.
 *
 * Техлисты приходят картинкой в PDF — текстового слоя в них нет, вписать по
 * имени поля нечего. Зато таблица согласования всегда нарисована линиями, и
 * её видно на пикселях: находим сетку, берём строки, у которых первый столбец
 * отделён своей вертикалью (у шапки таблицы её нет), и пишем в соседнюю
 * пустую ячейку. Поэтому таблица может стоять где угодно на листе и в любом
 * масштабе — ищем её каждый раз заново, а не по фиксированным координатам.
 */

import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { maskFromRGBA, findApprovalRows } from './techSheetGrid';

// Ширина рендера страницы. Мельче — тонкие линии таблицы рвутся и она
// перестаёт находиться; крупнее — лист разбирается заметно дольше без пользы.
const RENDER_W = 1600;

const FONT_URL = '/fonts/Roboto-Regular.ttf';

// Кого вписываем и как строка подписана в таблице. Порядок важен: если
// текстового слоя нет, строки разбираются сверху вниз именно в этом порядке.
const ROLES = [
  { key: 'manager',  words: ['менеджер'] },
  { key: 'customer', words: ['заказчик', 'клиент'] },
];

// Если у листа всё же есть текстовый слой — доверяем ему: строка ищется по
// слову «Менеджер»/«Заказчик», а не по порядку сверху вниз.
function matchRowsByText(rows, textItems, viewport) {
  const found = {};
  for (const item of textItems) {
    const raw = String(item.str || '').toLowerCase().trim();
    if (!raw) continue;
    const role = ROLES.find(r => r.words.some(w => raw.startsWith(w)));
    if (!role || found[role.key]) continue;
    // transform[5] — базовая линия текста в PDF-координатах, переводим в пиксели
    const [, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
    const row = rows.find(r => y >= r.y0 - 2 && y <= r.y1 + 2);
    if (row) found[role.key] = row;
  }
  return found;
}

/**
 * Вписывает подписантов в техлист.
 * @param {ArrayBuffer} pdfBytes исходный файл
 * @param {{manager?: string, customer?: string}} values
 * @returns {Promise<{bytes: Uint8Array, filled: string[]}>}
 */
export async function signTechSheet(pdfBytes, values) {
  const wanted = ROLES.filter(r => (values[r.key] || '').trim());
  if (!wanted.length) return { bytes: new Uint8Array(pdfBytes), filled: [] };

  // Ставим свой воркер, даже если его уже задали в другом месте: чужой адрес
  // может указывать на версию, которой нет, и разбор упадёт на первом же файле.
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

  // pdf.js забирает буфер себе, а pdf-lib потом читает исходник — копируем.
  const forRender = pdfBytes.slice(0);
  const task = pdfjsLib.getDocument({ data: forRender });
  const doc = await task.promise;

  let target = null;
  for (let n = 1; n <= doc.numPages && !target; n++) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const scale = RENDER_W / base.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;

    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const mask = maskFromRGBA(data, canvas.width, canvas.height);
    const table = findApprovalRows(mask, canvas.width, canvas.height);
    if (!table) continue;

    const text = await page.getTextContent().catch(() => ({ items: [] }));
    target = { pageIndex: n - 1, viewport, table, byText: matchRowsByText(table.rows, text.items || [], viewport) };
  }
  await task.destroy();
  if (!target) return { bytes: new Uint8Array(pdfBytes), filled: [] };

  const out = await PDFDocument.load(pdfBytes);
  out.registerFontkit(fontkit);
  const fontBytes = await fetch(FONT_URL).then(r => {
    if (!r.ok) throw new Error('Шрифт не загрузился');
    return r.arrayBuffer();
  });
  const font = await out.embedFont(fontBytes, { subset: true });
  const page = out.getPages()[target.pageIndex];

  const { rows } = target.table;
  const filled = [];
  wanted.forEach((role, i) => {
    // Порядок ролей в бланке постоянный, поэтому запасной путь — i-я строка
    // сверху; текстовый слой, если он есть, эту догадку уточняет.
    const row = target.byText[role.key] || rows[ROLES.findIndex(r => r.key === role.key)] || rows[i];
    if (!row) return;

    const [px0, py0] = target.viewport.convertToPdfPoint(row.x0, row.y0);
    const [px1, py1] = target.viewport.convertToPdfPoint(row.x1, row.y1);
    const left  = Math.min(px0, px1), right = Math.max(px0, px1);
    const top   = Math.max(py0, py1), bottom = Math.min(py0, py1);
    const cellW = right - left, cellH = top - bottom;

    const text = values[role.key].trim();
    let size = Math.min(cellH * 0.42, 14);
    const maxW = cellW * 0.9;
    while (size > 5 && font.widthOfTextAtSize(text, size) > maxW) size -= 0.5;

    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, {
      x: left + (cellW - w) / 2,
      y: bottom + (cellH - size * 0.72) / 2,
      size, font, color: rgb(0.05, 0.05, 0.12),
    });
    filled.push(role.key);
  });

  return { bytes: await out.save(), filled };
}
