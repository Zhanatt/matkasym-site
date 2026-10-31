// Шрифты и «только светлая тема» для PDF-каталогов, которые собирает headless Chrome
// (build-uzak-koldon-catalog.js, build-onoy-sakta-catalog.js, build-bilim-kelechek-catalog.js).
//
// Шрифты — статичные файлы @fontsource, НЕ fonts.googleapis.com: Google отдаёт variable-шрифты,
// Chrome вшивает их в PDF как Type 3, и просмотрщики на Android не показывают текст вообще
// (31.10.2026). Проверка готового файла: `pdffonts файл.pdf` — только «CID TrueType».
//
// color-scheme: only light — телефон в тёмной теме не «затемняет» страницу при печати.

const RANGES = [
  ['cyrillic', 'U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116'],
  ['latin', 'U+0000-00FF,U+2000-206F,U+20AC,U+2122,U+2190-21FF,U+2212'],
];
const FAMILIES = [['Roboto', 'roboto', [400, 500, 700]], ['Montserrat', 'montserrat', [500, 600, 700]]];

const FONT_CSS = FAMILIES.flatMap(([fam, pkg, weights]) => weights.flatMap(w => RANGES.map(([sub, range]) =>
  `@font-face { font-family:'${fam}'; font-style:normal; font-weight:${w}; font-display:block;
  src:url('https://cdn.jsdelivr.net/npm/@fontsource/${pkg}@5.1.0/files/${pkg}-${sub}-${w}-normal.woff2') format('woff2'); unicode-range:${range}; }`))).join('\n')
  + '\n:root { color-scheme: only light; }';

const LIGHT_META = '<meta name="color-scheme" content="only light">';

module.exports = { FONT_CSS, LIGHT_META };
