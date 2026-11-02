// Общая вёрстка отдельных каталогов SHAAR (0-TASTANDY, BEKEM FASAD, BEKEM TOSMO) — та же, что у
// ONOY SAKTA и MAZZA SEYIL: красная плашка цены, размеры стрелками у фото, логотип в подвале.
// Шрифты — только статичные woff2 из catalogFonts (иначе Android не показывает текст).

const { execFileSync } = require('child_process');
const { FONT_CSS, LIGHT_META } = require('./catalogFonts');

const SITE = 'https://matkasym-site.onrender.com';
const CLOUD = 'https://res.cloudinary.com/dnbg21ef8/image/upload';
const LOGO = `${CLOUD}/matkasym/catalog-assets/logo-main.jpg`;
const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = n => n > 0 ? `${n.toLocaleString('ru-RU').replace(/\s|,/g, ' ')} сом` : 'индивидуальный';
const tag = n => `<span class="tag">${money(n)}</span>`;
const fromTag = n => `<span class="tag">от ${money(n)}</span>`;
// studio — вырезанный по белому фону кадр, room — кадр как есть, nobg — фон убирает Cloudinary
const studio = (url, w, flip) => url.replace('/upload/', `/upload/${flip ? 'a_hflip/' : ''}b_white/e_trim:10/f_jpg,q_auto:good,w_${w},c_limit/`);
const nobg = (url, w) => url.replace('/upload/', `/upload/e_background_removal/b_white/e_trim:10/f_jpg,q_auto:good,w_${w},c_limit/`);
const room = (url, w) => url.replace('/upload/', `/upload/f_jpg,q_auto:good,w_${w},c_limit/`);

// Cloudinary убирает фон асинхронно: без прогрева Chrome получит ошибку вместо картинки
async function warm(urls) {
  for (const u of urls) {
    let ok = false;
    for (let i = 0; i < 25 && !ok; i++) {
      const r = await fetch(u);
      ok = r.ok && /image/.test(r.headers.get('content-type') || '');
      if (!ok) await new Promise(s => setTimeout(s, 3000));
    }
    if (!ok) throw new Error('Cloudinary не отдал кадр: ' + u);
  }
}

// Полоса каталога. start — номер, после которого продолжить нумерацию.
const makePage = (name, start = 0) => {
  let n = start;
  const page = (body, cls = '') => {
    n++;
    return `<section class="page ${cls}">${body}
    <footer class="foot"><span class="foot-l"><img src="${LOGO}" alt="MATKASYM"><i>${esc(name)}</i></span><span>${String(n).padStart(2, '0')}</span></footer></section>`;
  };
  page.current = () => n;
  return page;
};

const secHead = s => `<div class="sec"><span class="sec-n">${s.n}</span><span class="sec-t">${esc(s.title)}</span><span class="sec-note">${esc(s.note)}</span></div>`;
const head = (kind, name, lead) => `<div class="s-head"><div><div class="s-kind">${esc(kind)}</div><h2>${esc(name)}</h2></div><p class="s-lead">${esc(lead)}</p></div>`;

// Колонка модели: фото со стрелками размеров, название, описание, цена.
// dims — [ширина, глубина, высота] в см; пустое значение — стрелки нет.
function modelCell(m) {
  const d = m.dims || [];
  return `<div class="mdl${m.tall ? ' mdl--tall' : ''}">
    <div class="m-photo dim" data-w="${d[0] || ''}" data-d="${d[1] || ''}" data-h="${d[2] || ''}"><img src="${m.src}" alt=""></div>
    <div class="m-name">${esc(m.v)}</div>
    <div class="m-desc">${esc(m.desc || '')}</div>
    <div class="m-price">${m.priceHtml || tag(m.price)}</div>
  </div>`;
}
const cols = items => `<div class="mdls" style="--n:${items.length}">${items.map(modelCell).join('')}</div>`;
const grid2 = items => `<div class="g2">${items.map(modelCell).join('')}</div>`;
const series = (kind, name, lead, items, grow = 1) => `<article class="series" style="flex-grow:${grow}">${head(kind, name, lead)}${cols(items)}</article>`;

const orderPage = (page, steps) => page(`
    <div class="end-logo"><img src="${CLOUD}/matkasym/catalog-assets/logo-vertical.jpg" alt="MATKASYM"></div>
    <div class="order">
      <div><h2>Как заказать</h2>
        <ol class="steps">${steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol></div>
      <dl class="contacts">
        <div><dt>Телефон</dt><dd class="big">+996 501 111 726<br>+996 504 200 067</dd></div>
        <div><dt>Instagram</dt><dd>@matkasym_shaar</dd></div>
        <div><dt>Почта</dt><dd>matkasymovllc@gmail.com</dd></div>
        <div><dt>Адрес</dt><dd>с. Маевка, ул. Тепличная, уч. 1/2</dd></div>
      </dl>
    </div>`);

const coverPage = (page, photos, title, sub) => page(`
    <div class="cover-grid">${photos.map(u => `<div><img src="${u}" alt=""></div>`).join('')}</div>
    <div class="cover-tab"><img src="${CLOUD}/f_jpg,q_90,w_600,c_limit/matkasym/catalog-assets/logo-tab" alt="MATKASYM"></div>
    <div class="cover-plate">${esc(title)}<small>${esc(sub)}</small></div>`, 'cover');

// Размерные линии со стрелками (как в ONOY SAKTA): высота слева, ширина снизу, глубина наклонно справа.
const DIM_JS = `
window.addEventListener('load', () => {
  const MM = 96 / 25.4, C = '#7d96a0', T = '#4d4d4d';
  const arrow = (x1, y1, x2, y2) => {
    const a = Math.atan2(y2 - y1, x2 - x1), s = 1.6 * MM, w = 0.45;
    const hd = (x, y, ang) => '<path d="M' + x + ' ' + y + ' L' + (x - s * Math.cos(ang - w)) + ' ' + (y - s * Math.sin(ang - w)) +
      ' L' + (x - s * Math.cos(ang + w)) + ' ' + (y - s * Math.sin(ang + w)) + ' Z" fill="' + C + '"/>';
    return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + C + '" stroke-width="0.9"/>' + hd(x2, y2, a) + hd(x1, y1, a + Math.PI);
  };
  const label = (x, y, t, rot) => { const bw = (t.length * 1.45 + 1.6) * MM, bh = 3.6 * MM, tr = rot ? ' transform="rotate(-90 ' + x + ' ' + y + ')"' : '';
    return '<g' + tr + '><rect x="' + (x - bw / 2) + '" y="' + (y - bh / 2) + '" width="' + bw + '" height="' + bh + '" fill="#fff"/>' +
      '<text x="' + x + '" y="' + y + '" fill="' + T + '" font-family="Roboto, Helvetica, Arial" font-size="' + (2.7 * MM) + '" font-weight="500" text-anchor="middle" dominant-baseline="middle">' + t + '</text></g>'; };
  document.querySelectorAll('.dim').forEach(box => {
    const img = box.querySelector('img'); if (!img || !img.naturalWidth) return;
    const { w, d, h } = box.dataset;
    box.style.position = 'relative'; box.style.padding = '0';
    const W = box.clientWidth, H = box.clientHeight;
    const L = h ? 8 * MM : 0, B = w ? 7 * MM : 0, R = d ? 11 * MM : 0, TOP = 1 * MM;
    const k = Math.min((W - L - R) / img.naturalWidth, (H - B - TOP) / img.naturalHeight);
    const iw = img.naturalWidth * k, ih = img.naturalHeight * k;
    const x0 = L + (W - L - R - iw) / 2, y0 = H - B - ih;
    Object.assign(img.style, { position: 'absolute', left: x0 + 'px', top: y0 + 'px', width: iw + 'px', height: ih + 'px', maxWidth: 'none', maxHeight: 'none' });
    const hx = x0 - 4 * MM, wy = y0 + ih + 4 * MM;
    const dx = 5 * MM, dy = dx * 0.55, ox = 1.5 * MM;
    const d1 = [x0 + iw + ox, y0 + ih + 1 * MM], d2 = [x0 + iw + ox + dx, y0 + ih + 1 * MM - dy];
    let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" style="position:absolute;left:0;top:0;overflow:visible">';
    if (h) svg += arrow(hx, y0, hx, y0 + ih) + label(hx, y0 + ih / 2, h + ' см', true);
    if (w) svg += arrow(x0, wy, x0 + iw, wy) + label(x0 + iw / 2, wy, w + ' см');
    if (d) svg += arrow(d1[0], d1[1], d2[0], d2[1]) + label(d2[0] - 0.5 * MM, d2[1] - 2.6 * MM, d + ' см');
    box.insertAdjacentHTML('beforeend', svg + '</svg>');
  });
});`;

const CSS = `
${FONT_CSS}
@page { size: A4; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
:root { --ink:#000; --text:#4d4d4d; --mute:#7d96a0; --metal:#7d96a0; --line:#dfe5e7; --red:#e10523; --pad:16mm; color-scheme: only light; }
html, body { background:#fff; color:var(--ink); font-family:Roboto, Helvetica, Arial, sans-serif; font-size:8.6pt; line-height:1.4;
  -webkit-print-color-adjust:exact; print-color-adjust:exact; }
img { display:block; max-width:100%; }
.page { width:210mm; height:297mm; padding:var(--pad) var(--pad) 22mm; position:relative; overflow:hidden;
  break-after:page; display:flex; flex-direction:column; gap:7mm; }
.page:last-child { break-after:auto; }
.foot { position:absolute; left:var(--pad); right:var(--pad); bottom:10mm; display:flex; justify-content:space-between;
  font-size:6.8pt; letter-spacing:.12em; color:var(--mute); text-transform:uppercase; }
.foot-l { display:flex; align-items:center; gap:3mm; }
.foot-l img { height:3.4mm; width:auto; }
.foot-l i { font-style:normal; }
h2 { font-family:Montserrat, Helvetica, sans-serif; font-weight:600; font-size:17pt; letter-spacing:.01em; line-height:1.1; }
.s-kind { font-size:6.8pt; letter-spacing:.14em; text-transform:uppercase; color:var(--mute); margin-bottom:1.5mm; }
.tag { display:inline-block; background:var(--red); color:#fff; font-weight:500; font-size:9pt; line-height:1;
  padding:1.5mm 2.4mm; border-radius:.8mm; white-space:nowrap; }

.sec { display:flex; align-items:baseline; gap:4mm; padding-bottom:3mm; border-bottom:1px solid var(--metal); }
.sec-n { font-family:Montserrat, Helvetica, sans-serif; font-weight:600; font-size:9pt; color:var(--red); }
.sec-t { font-family:Montserrat, Helvetica, sans-serif; font-weight:600; font-size:9pt; letter-spacing:.14em; text-transform:uppercase; }
.sec-note { margin-left:auto; color:var(--mute); font-size:7.6pt; }

.series { display:flex; flex-direction:column; gap:4mm; flex:1 1 0; min-height:0; }
.series + .series { border-top:1px solid var(--line); padding-top:6mm; }
.s-head { display:grid; grid-template-columns:1fr 1fr; gap:8mm; align-items:end; }
.s-lead { color:var(--text); max-width:82mm; justify-self:end; }

.mdls { display:grid; grid-template-columns:repeat(var(--n), minmax(0, 1fr)); flex:1 1 0; min-height:0; }
.g2 { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); grid-template-rows:repeat(2, minmax(0, 1fr)); row-gap:6mm; flex:1 1 0; min-height:0; }
.mdl { display:flex; flex-direction:column; min-height:0; min-width:0; padding:0 4mm; }
.mdls .mdl:first-child, .g2 .mdl:nth-child(odd) { padding-left:0; }
.mdls .mdl:last-child, .g2 .mdl:nth-child(even) { padding-right:0; }
.mdl + .mdl { border-left:1px solid var(--line); }
.g2 .mdl:nth-child(odd) { border-left:0; }
.g2 .mdl--tall { grid-column:2; grid-row:1 / span 2; }
.g2.g2--side .mdl { padding:0 4mm 0 0; border-left:0; }
.g2.g2--side .mdl--tall { padding:0 0 0 4mm; border-left:1px solid var(--line); }
.m-photo { flex:1 1 0; min-height:0; display:flex; align-items:flex-end; justify-content:center; padding-bottom:4mm; }
.m-photo img { max-height:100%; max-width:100%; width:auto; object-fit:contain; }
.m-name { font-family:Montserrat, Helvetica, sans-serif; font-weight:600; font-size:11pt; padding-top:2.6mm; border-top:1px solid var(--metal); }
.m-desc { color:var(--text); margin-top:.6mm; min-height:2.8em; }
.m-price { margin-top:1.6mm; }

.band { flex:0 0 auto; display:grid; gap:4mm; overflow:hidden; }
.band div { overflow:hidden; min-height:0; }
.band img { width:100%; height:100%; object-fit:cover; }
.fill { flex:1 1 0; min-height:0; overflow:hidden; }
.fill img { width:100%; height:100%; object-fit:cover; }

.split { display:grid; grid-template-columns:64% 1fr; gap:9mm; flex:1 1 0; min-height:0; align-items:center; }
.s-photo { height:100%; min-height:0; }
.dl { display:grid; grid-template-columns:auto 1fr; margin-top:4mm; border-top:1px solid var(--metal); }
.dl dt, .dl dd { padding:1.7mm 0; border-bottom:1px solid var(--line); }
.dl dt { color:var(--mute); font-size:7.4pt; text-transform:uppercase; letter-spacing:.1em; padding-right:8mm; }
.dl dd { text-align:right; font-weight:600; }

.swatches { display:grid; grid-template-columns:repeat(var(--n), minmax(0, 1fr)); gap:4mm; flex:0 0 auto; border-top:1px solid var(--line); padding-top:5mm; }
.swatches figure { display:flex; flex-direction:column; align-items:center; gap:2mm; }
.swatches img { height:50mm; width:auto; max-width:100%; object-fit:contain; }
.swatches figcaption { color:var(--text); }

.purp { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); grid-auto-rows:auto; align-content:space-between; gap:4mm 7mm; flex:1 1 0; min-height:0; }
.pp { border-top:1px solid var(--metal); padding-top:3mm; display:flex; flex-direction:column; min-height:0; }
.pp--wide { grid-column:span 2; }
.pp--wide ul { grid-template-columns:1fr 1fr; column-gap:7mm; }
.pp h3 { font-family:Montserrat, Helvetica, sans-serif; font-weight:600; font-size:11pt; line-height:1.2; }
.pp > p { color:var(--mute); font-size:7.6pt; margin:.8mm 0 2mm; min-height:2.6em; }
.pp ul { list-style:none; display:grid; gap:1.4mm; align-content:start; }
.pp li { display:grid; grid-template-columns:13mm 1fr auto; gap:2.4mm; align-items:center; padding-bottom:1.4mm; border-bottom:1px solid var(--line); }
.pp-img { width:13mm; height:13mm; display:flex; align-items:center; justify-content:center; }
.pp-img img { max-width:100%; max-height:100%; width:auto; height:auto; }
.pp-n b { display:block; font-family:Montserrat, Helvetica, sans-serif; font-weight:600; font-size:8pt; }
.pp-n i { display:block; font-style:normal; color:var(--red); font-size:7.4pt; font-weight:500; margin-top:.4mm; }
.pp-p { color:var(--mute); font-size:8pt; }

.cust-top { display:grid; grid-template-columns:1fr 70mm; gap:10mm; align-items:center; }
.cust-h { font-size:24pt; font-weight:700; margin-bottom:5mm; }
.cust-lead { color:var(--text); font-size:10pt; line-height:1.55; }
.cust-ask { margin-top:6mm; display:flex; justify-content:space-between; align-items:center; padding-top:2.4mm; border-top:1px solid var(--line); color:var(--mute); }
.cust-draw svg { width:100%; height:auto; display:block; }
.cust-cols { display:grid; grid-template-columns:1fr 1fr; gap:10mm; }
.cust-stats { display:grid; grid-template-columns:repeat(4,1fr); border-top:1px solid var(--metal); }
.cust-stats div { padding:4mm 4mm 0 0; }
.cust-stats div + div { padding-left:4mm; border-left:1px solid var(--line); }
.cust-stats b { display:block; font-family:Montserrat, Helvetica, sans-serif; font-weight:600; font-size:10.5pt; line-height:1.2; }
.cust-stats span { display:block; margin-top:1.5mm; color:var(--mute); font-size:7.6pt; }
.list { list-style:none; display:grid; margin-top:1.5mm; border-top:1px solid var(--metal); }
.list li { padding:2.4mm 0; border-bottom:1px solid var(--line); font-size:9pt; }

.cover { padding:0; gap:0; }
.cover .foot { display:none; }
.cover-grid { position:absolute; inset:0; display:grid; grid-template-columns:1fr 1fr; grid-template-rows:1fr 1fr; }
.cover-grid div { overflow:hidden; }
.cover-grid img { width:100%; height:100%; object-fit:cover; }
.cover-tab { position:absolute; top:0; left:50%; transform:translateX(-50%); }
.cover-tab img { width:36mm; height:auto; display:block; clip-path:polygon(0 0, 100% 0, 100% 85%, 50% 100%, 0 85%); }
.cover-plate { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); background:var(--metal); color:#fff;
  font-family:Montserrat, Helvetica, sans-serif; font-weight:700; font-size:30pt; letter-spacing:.04em; line-height:1;
  padding:5mm 10mm; border-radius:3mm; white-space:nowrap; text-align:center; }
.cover-plate small { display:block; font-size:9pt; font-weight:600; letter-spacing:.16em; margin-top:2.4mm; text-transform:uppercase; }

.intro { display:grid; grid-template-columns:1fr 1fr; gap:10mm; align-items:end; padding-bottom:5mm; border-bottom:1px solid var(--metal); }
.intro h2 { font-size:28pt; font-weight:700; }
.intro p { color:var(--text); font-size:10pt; line-height:1.5; }
.toc-row { display:grid; grid-template-columns:12mm 1fr auto; padding:1.6mm 0; border-bottom:1px solid var(--line); align-items:baseline; }
.toc-row .n { font-family:Montserrat, Helvetica, sans-serif; font-weight:600; color:var(--red); font-size:11pt; }
.toc-row .t { font-family:Montserrat, Helvetica, sans-serif; font-weight:600; font-size:12pt; }
.toc-row .p { color:var(--mute); font-size:11pt; }

.end-logo { flex:1 1 0; display:flex; align-items:center; justify-content:center; }
.end-logo img { width:70mm; height:auto; }
.order { display:grid; grid-template-columns:1fr 1fr; gap:10mm; border-top:1px solid var(--metal); padding-top:7mm; }
.order h2 { margin-bottom:4mm; }
.steps { counter-reset:s; display:grid; gap:3mm; }
.steps li { list-style:none; display:grid; grid-template-columns:7mm 1fr; }
.steps li::before { counter-increment:s; content:counter(s, decimal-leading-zero); font-family:Montserrat, Helvetica, sans-serif; font-weight:600; color:var(--red); font-size:8pt; }
.contacts { display:grid; gap:3.4mm; }
.contacts div { display:grid; grid-template-columns:24mm 1fr; padding-bottom:3mm; border-bottom:1px solid var(--line); }
.contacts dt { color:var(--mute); font-size:7.2pt; text-transform:uppercase; letter-spacing:.1em; }
.contacts dd { font-weight:500; }
.contacts .big { font-family:Montserrat, Helvetica, sans-serif; font-weight:600; font-size:12pt; }
`;

const wrapHtml = (title, pages, extraCss = '') => `<!doctype html><html lang="ru"><head><meta charset="utf-8">${LIGHT_META}<title>${esc(title)}</title>
<style>${CSS}${extraCss}</style></head><body>${pages.join('\n')}<script>${DIM_JS}</script></body></html>`;

const renderPdf = (htmlFile, pdf) => execFileSync(CHROME, [...(process.env.CI ? ['--no-sandbox'] : []),
  '--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--virtual-time-budget=120000',
  `--print-to-pdf=${pdf}`, `file://${htmlFile}`], { stdio: 'ignore', timeout: 300000 });

// Сжатие фото для телефона. Без перевода в RGB Ghostscript пишет пустой ICC-профиль: на iPhone (PDFKit)
// фото пропадают («invalid image ColorSpace»). Ссылки и закладки ставить ПОСЛЕ сжатия.
const compressPdf = (input, output, dpi = 130) => execFileSync('gs', ['-q', '-dNOPAUSE', '-dBATCH', '-dSAFER', '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.6',
  '-sColorConversionStrategy=RGB', '-dProcessColorModel=/DeviceRGB',
  '-dEmbedAllFonts=true', '-dSubsetFonts=true', '-dPassThroughJPEGImages=false', '-dDetectDuplicateImages=true',
  '-dDownsampleColorImages=true', '-dColorImageDownsampleType=/Bicubic', `-dColorImageResolution=${dpi}`, '-dColorImageDownsampleThreshold=1.0',
  '-dDownsampleGrayImages=true', '-dGrayImageDownsampleType=/Bicubic', `-dGrayImageResolution=${dpi}`, '-dGrayImageDownsampleThreshold=1.0',
  '-dAutoFilterColorImages=false', '-dColorImageFilter=/DCTEncode', '-dAutoFilterGrayImages=false', '-dGrayImageFilter=/DCTEncode',
  `-sOutputFile=${output}`, '-c', '<</ColorImageDict <</QFactor 0.7 /HSamples [2 1 1 2] /VSamples [2 1 1 2]>> /GrayImageDict <</QFactor 0.7 /HSamples [2 1 1 2] /VSamples [2 1 1 2]>>>> setdistillerparams', '-f', input], { stdio: 'inherit', timeout: 900000 });

module.exports = { compressPdf, SITE, CLOUD, esc, money, tag, fromTag, studio, nobg, room, warm, makePage, secHead, head,
  modelCell, cols, grid2, series, orderPage, coverPage, wrapHtml, renderPdf };
