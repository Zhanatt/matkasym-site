/**
 * Печать заявок на заказ: фото, название, количество — то, с чем закупщик
 * идёт к поставщику и сверяет привезённое.
 *
 * PDF снимает печатный движок браузера, как в каталоге (catalogPrint.js):
 * лист собирается обычным HTML, в диалоге печати выбирают «Сохранить как PDF».
 */

import { cloudinaryOpt } from '../../utils/drive';

const NO_PHOTO = '/logos/no-photo.png';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const day = d => d ? new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

const css = `
  @page { size: A4; margin: 12mm 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #111; }
  .bar { position: sticky; top: 0; display: flex; gap: 12px; align-items: center;
         background: #111; color: #fff; padding: 10px 16px; font-size: 13px; }
  .bar button { margin-left: auto; padding: 7px 16px; border: none; border-radius: 6px;
                background: #fff; color: #111; font-weight: 700; font-size: 13px; cursor: pointer; }
  .sheet { padding: 0 2mm; }
  h1 { font-size: 19px; margin: 18px 0 2px; letter-spacing: -.2px; }
  .sub { font-size: 12px; color: #6b7280; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; }
  th { font-size: 10px; text-transform: uppercase; letter-spacing: .4px; color: #6b7280;
       text-align: left; padding: 0 8px 6px; border-bottom: 1.5px solid #111; }
  th.num, td.num { text-align: right; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  td { padding: 8px; border-bottom: 1px solid #e5e7eb; vertical-align: middle; }
  .idx { font-size: 12px; color: #9ca3af; width: 26px; }
  .pic { width: 74px; }
  .pic img { width: 66px; height: 66px; object-fit: cover; border-radius: 6px;
             border: 1px solid #e5e7eb; background: #f8fafc; display: block; }
  .name { font-size: 13.5px; font-weight: 700; line-height: 1.3; }
  .meta { font-size: 11px; color: #6b7280; margin-top: 3px; }
  .qty { font-size: 16px; font-weight: 800; white-space: nowrap; }
  .qty span { font-size: 11px; font-weight: 600; color: #6b7280; }
  .dash { color: #c3c9d2; font-weight: 600; }
  h2 { font-size: 15px; margin: 22px 0 8px; padding-top: 4px; }
  h2.first { margin-top: 6px; }
  .total { display: flex; justify-content: space-between; padding: 8px 8px 0;
           font-size: 12px; color: #6b7280; break-inside: avoid; }
  .total b { color: #111; font-size: 13px; }
  .grand { display: flex; justify-content: space-between; margin-top: 16px; padding: 10px 8px 0;
           border-top: 1.5px solid #111; font-size: 13px; color: #111; break-inside: avoid; }
  @media print { .bar { display: none; } }
`;

function rowHtml(r, i) {
  const pic  = r.photos?.[0] || r.photo || '';
  // ref — откуда строка взялась: «№67 · из заявки №62» у карточек тестовой продажи.
  const meta = [r.ref, r.color, r.dimensions, r.sku].filter(Boolean).map(esc).join(' · ');
  const who  = [r.createdByName, day(r.createdAt)].filter(Boolean).map(esc).join(' · ');
  return `<tr>
    <td class="idx">${i + 1}</td>
    <td class="pic"><img src="${esc(pic ? cloudinaryOpt(pic, 200) : NO_PHOTO)}" alt=""
      onerror="this.onerror=null;this.src='${NO_PHOTO}'"></td>
    <td>
      <div class="name">${esc(r.name || 'Без названия')}</div>
      ${meta ? `<div class="meta">${meta}</div>` : ''}
      ${who ? `<div class="meta">${who}</div>` : ''}
    </td>
    <td class="num qty">${r.quantity ? `${Number(r.quantity).toLocaleString('ru-RU')} <span>шт</span>` : '<span class="dash">—</span>'}</td>
  </tr>`;
}

/**
 * Разметка листа — отдельно от печати: её можно собрать и вне браузера,
 * например разовой выгрузкой из базы.
 *
 * Разделов может быть несколько: закупщик берёт с собой один лист, где
 * повторные заказы и новинки идут подряд. Новый раздел начинается сразу за
 * предыдущим — страницу под него не переворачиваем, пустых половин не остаётся.
 *
 * @param {Array} sections [{ heading, items }] — разделы листа
 * @param {{title: string, subtitle: string, origin: string}} opts шапка листа
 */
export function buildSheetHtml(sections, { title = 'Заявки на заказ', subtitle = '', origin = '' } = {}) {
  const qty = list => list.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
  const all = sections.flatMap(s => s.items);

  const sectionHtml = (sec, i) => `
  ${sec.heading ? `<h2${i === 0 ? ' class="first"' : ''}>${esc(sec.heading)}</h2>` : ''}
  <table>
    <thead><tr><th></th><th></th><th>Товар</th><th class="num">Кол-во</th></tr></thead>
    <tbody>${sec.items.map(rowHtml).join('')}</tbody>
  </table>
  <div class="total">
    <span>Позиций: <b>${sec.items.length}</b></span>
    <span>Всего: <b>${qty(sec.items).toLocaleString('ru-RU')} шт</b></span>
  </div>`;

  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<base href="${origin}/">
<title>${esc(title)}</title>
<style>${css}</style>
</head><body>
<div class="bar"><b>В диалоге печати выберите «Сохранить как PDF»</b>
  <button type="button" onclick="window.print()">Сохранить PDF</button></div>
<div class="sheet">
  <h1>${esc(title)}</h1>
  <div class="sub">MATKASYM${subtitle ? ` · ${esc(subtitle)}` : ''} · ${day(new Date())}</div>
  ${sections.map(sectionHtml).join('')}
  ${sections.length > 1 ? `<div class="grand">
    <span>Итого позиций: <b>${all.length}</b></span>
    <span>Итого: <b>${qty(all).toLocaleString('ru-RU')} шт</b></span>
  </div>` : ''}
</div></body></html>`;
}

/** Лист из одного списка — как было до появления разделов. */
export function buildRequestsHtml(list, title = 'Заявки на заказ', origin = '', subtitle = 'заявки на заказ товара') {
  return buildSheetHtml([{ items: list }], { title, subtitle, origin });
}

/**
 * Открывает лист заявок отдельной вкладкой и вызывает печать; в диалоге
 * выбирают «Сохранить как PDF».
 */
export async function printRequests(requests, title = 'Заявки на заказ', subtitle = 'заявки на заказ товара') {
  const list = requests || [];
  if (!list.length) throw new Error('Нет заявок для выгрузки');
  const html = buildRequestsHtml(list, title, location.origin, subtitle);

  const win = window.open('', '_blank');
  if (!win) throw new Error('Браузер заблокировал новое окно — разрешите всплывающие окна для сайта');
  win.document.open();
  win.document.write(html);
  win.document.close();

  await new Promise(resolve => {
    if (win.document.readyState === 'complete') queueMicrotask(resolve);
    else win.addEventListener('load', resolve, { once: true });
  });

  // Chrome печатает то, что отрисовано на момент вызова: без ожидания снимков
  // половина строк уйдёт с пустыми рамками.
  await Promise.all(Array.from(win.document.images).map(img => img.complete
    ? Promise.resolve()
    : new Promise(res => {
        img.addEventListener('load', res, { once: true });
        img.addEventListener('error', res, { once: true });
      })));
  if (win.document.fonts?.ready) await win.document.fonts.ready;

  win.focus();
  win.print();
}
