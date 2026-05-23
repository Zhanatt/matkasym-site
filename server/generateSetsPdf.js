/**
 * Генерирует PDF со всеми сетами — каждый сет на отдельном A4 листе (горизонтально).
 * Жёлтый фон, чёрный текст, название сета по центру большим шрифтом, бренд снизу.
 * Запуск: node server/generateSetsPdf.js
 */
const PDFDocument = require('pdfkit');
const fs          = require('fs');
const path        = require('path');

const FONT_BOLD    = '/Users/zhanat/Library/Fonts/Roboto-Bold_2.ttf';
const FONT_REGULAR = '/Users/zhanat/Library/Fonts/Roboto-Regular.ttf';

const SET_NAMES = {
  'achyk-asman':     'Achyk Asman',
  'baary-oorunda':   'Baary Oorunda',
  'den-sooluk':      'Den Sooluk',
  'jenil-ashkana':   'Jenil Ashkana',
  'konok-keldi':     'Konok Keldi',
  'korkom-aiym':     'Korkom Aiym',
  'kosh-keliniz':    'Kosh Keliniz',
  'sanarip-tv':      'Sanarip TV',
  'shirin-balalyk':  'Shirin Balalyk',
  'taza-kiym':       'Taza Kiym',
  'uydo-ishtoo':     'Uydo Ishtoo',
  'zhashyl-ömür':    'Zhashyl Ömür',
  '0-tashtandy':     '0-Tashtandy',
  'bekem-fasad':     'Bekem Fasad',
  'bilim-kelechek':  'Bilim Kelechek',
  'kooz-koopsuzduk': 'Kooz Koopsuzduk',
  'mazza-seiyl':     'Mazza Seiyl',
  'onoi-sakta':      'Onoi Sakta',
  'uzak-koldon':     'Uzak Koldon',
  'önügüü-set':      'Önügüü Set',
  'dayar-tütük':     'Dayar Tütük',
  'equipment':       'Equipment',
  'misc':            'Misc',
  'nelikvid':        'Неликвид',
  'other':           'Прочее',
  'samples':         'Образцы',
  'small-batch':     'Small Batch',
};

const BRAND_LABELS = {
  'matkasym-home':   'MATKASYM HOME',
  'matkasym-shaar':  'MATKASYM SHAAR',
  'matkasym-kyzmat': 'MATKASYM KYZMAT',
};

// Sorted list: home sets first, then shaar
const SETS = [
  // HOME
  { slug: 'achyk-asman',    brand: 'matkasym-home' },
  { slug: 'baary-oorunda',  brand: 'matkasym-home' },
  { slug: 'den-sooluk',     brand: 'matkasym-home' },
  { slug: 'jenil-ashkana',  brand: 'matkasym-home' },
  { slug: 'konok-keldi',    brand: 'matkasym-home' },
  { slug: 'korkom-aiym',    brand: 'matkasym-home' },
  { slug: 'kosh-keliniz',   brand: 'matkasym-home' },
  { slug: 'sanarip-tv',     brand: 'matkasym-home' },
  { slug: 'shirin-balalyk', brand: 'matkasym-home' },
  { slug: 'taza-kiym',      brand: 'matkasym-home' },
  { slug: 'uydo-ishtoo',    brand: 'matkasym-home' },
  { slug: 'zhashyl-ömür',   brand: 'matkasym-home' },
  { slug: 'nelikvid',       brand: 'matkasym-home' },
  { slug: 'samples',        brand: 'matkasym-home' },
  { slug: 'small-batch',    brand: 'matkasym-home' },
  { slug: 'misc',           brand: 'matkasym-home' },
  { slug: 'equipment',      brand: 'matkasym-home' },
  { slug: 'other',          brand: 'matkasym-home' },
  // SHAAR
  { slug: '0-tashtandy',     brand: 'matkasym-shaar' },
  { slug: 'bekem-fasad',     brand: 'matkasym-shaar' },
  { slug: 'bilim-kelechek',  brand: 'matkasym-shaar' },
  { slug: 'kooz-koopsuzduk', brand: 'matkasym-shaar' },
  { slug: 'mazza-seiyl',     brand: 'matkasym-shaar' },
  { slug: 'onoi-sakta',      brand: 'matkasym-shaar' },
  { slug: 'uzak-koldon',     brand: 'matkasym-shaar' },
];

// A4 landscape in points: 841.89 × 595.28
const W = 841.89;
const H = 595.28;

const outPath = path.join(require('os').homedir(), 'Desktop', 'matkasym-sets.pdf');
const doc     = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, autoFirstPage: false });
const stream  = fs.createWriteStream(outPath);
doc.pipe(stream);

doc.registerFont('bold',    FONT_BOLD);
doc.registerFont('regular', FONT_REGULAR);

SETS.forEach(({ slug, brand }, idx) => {
  doc.addPage();

  // Yellow background
  doc.rect(0, 0, W, H).fill('#FFD700');

  const setName   = SET_NAMES[slug]   || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const brandName = BRAND_LABELS[brand] || brand;

  // Measure text heights to center the block
  const titleSize = 96;
  const brandSize = 36;
  const gap       = 24; // gap between title and brand

  const blockH = titleSize + gap + brandSize;
  const startY = (H - blockH) / 2;

  // Set name — large, bold
  doc.font('bold').fontSize(titleSize).fillColor('#000000');
  doc.text(setName, 0, startY, { width: W, align: 'center', lineBreak: false });

  // Brand name — smaller, below
  doc.font('regular').fontSize(brandSize).fillColor('#1a1a1a');
  doc.text(brandName, 0, startY + titleSize + gap, { width: W, align: 'center', lineBreak: false });
});

doc.end();

stream.on('finish', () => {
  console.log(`✅ PDF сохранён: ${outPath}`);
  console.log(`   Листов: ${SETS.length}`);
});
stream.on('error', err => console.error('❌ Ошибка:', err.message));
