/**
 * Анализирует 188 товаров из БД, не найденных в Excel.
 * Ищет похожие названия, делит на категории, пишет в Excel.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Product  = require('./models/Product');
const xlsx     = require('xlsx');
const path     = require('path');

const MONGO_URI = 'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym?appName=M0';
const EXCEL_IN  = '/Users/zhanat/Downloads/остаток на (07.05.2026) (1).xlsx';
const EXCEL_OUT = path.join(require('os').homedir(), 'Desktop', 'анализ_несовпавших_товаров.xlsx');

function norm(s = '') {
  return s
    .toLowerCase()
    .replace(/[«»"""''`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Простое расстояние Левенштейна (для коротких строк)
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

// Сходство: 0..1
function similarity(a, b) {
  const na = norm(a), nb = norm(b);
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(na, nb) / maxLen;
}

// Проверяем: содержит ли a все слова из b (или наоборот)
function wordsOverlap(a, b) {
  const wa = new Set(norm(a).split(' ').filter(w => w.length > 2));
  const wb = norm(b).split(' ').filter(w => w.length > 2);
  if (wa.size === 0 || wb.length === 0) return 0;
  const matched = wb.filter(w => wa.has(w)).length;
  return matched / Math.max(wa.size, wb.length);
}

function categorize(dbName, bestMatch, score) {
  const dn = norm(dbName);
  const bn = norm(bestMatch || '');

  if (score >= 0.92) return 'Почти одинаковые (опечатка/регистр)';
  if (score >= 0.75) return 'Похожие (небольшое расхождение)';

  // Проверяем перестановку слов
  const overlap = wordsOverlap(dbName, bestMatch || '');
  if (overlap >= 0.7) return 'Перестановка слов / разный порядок';

  // Проверяем если одно имя содержит другое
  if (bn && (dn.includes(bn) || bn.includes(dn))) return 'Одно название содержит другое';

  return 'Не найдено совпадений';
}

async function main() {
  // 1. Читаем Excel
  const wb = xlsx.readFile(EXCEL_IN);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const excelProducts = [];
  for (let i = 7; i < rows.length; i++) {
    const row = rows[i];
    const name = String(row[0] || '').trim();
    if (!name) continue;
    if (row[4] === '' && row[19] === '') continue; // группа
    const osnovnoy = Math.max(0, Math.floor(Number(row[4]) || 0));
    const kommerchesky = Math.max(0, Math.floor(Number(row[19]) || 0));
    excelProducts.push({ name, stock: osnovnoy + kommerchesky });
  }

  console.log(`Excel строк: ${excelProducts.length}`);

  // 2. Подключаемся к БД
  await mongoose.connect(MONGO_URI);
  const allProducts = await Product.find({}).select('fullName name stock inStock category');
  console.log(`БД товаров: ${allProducts.length}`);

  const excelNorms = excelProducts.map(p => norm(p.name));

  // 3. Находим несовпавшие
  const notFound = allProducts.filter(p => {
    const key = norm(p.fullName || p.name || '');
    return !excelNorms.includes(key);
  });

  console.log(`Не найдено: ${notFound.length}`);

  // 4. Для каждого ищем лучшее совпадение в Excel
  const results = [];
  for (const p of notFound) {
    const dbName = p.fullName || p.name || '';
    let bestScore = 0, bestMatch = '', bestStock = '';

    for (const ep of excelProducts) {
      const s = similarity(dbName, ep.name);
      const ov = wordsOverlap(dbName, ep.name);
      const combined = Math.max(s, ov * 0.9);
      if (combined > bestScore) {
        bestScore = combined;
        bestMatch = ep.name;
        bestStock = ep.stock;
      }
    }

    const cat = categorize(dbName, bestMatch, bestScore);

    results.push({
      category: cat,
      dbName,
      dbStock: p.stock ?? 0,
      dbCategory: p.category || '',
      bestMatch: bestScore > 0.5 ? bestMatch : '—',
      excelStock: bestScore > 0.5 ? bestStock : '—',
      score: Math.round(bestScore * 100) + '%',
    });
  }

  // 5. Сортируем: сначала категория, потом по score desc
  const ORDER = [
    'Почти одинаковые (опечатка/регистр)',
    'Похожие (небольшое расхождение)',
    'Перестановка слов / разный порядок',
    'Одно название содержит другое',
    'Не найдено совпадений',
  ];
  results.sort((a, b) => {
    const oi = ORDER.indexOf(a.category) - ORDER.indexOf(b.category);
    if (oi !== 0) return oi;
    return b.score.localeCompare(a.score);
  });

  // 6. Пишем Excel
  const sheetData = [
    ['Категория проблемы', 'Название в БД', 'Остаток в БД', 'Категория товара', 'Похожее название в Excel', 'Остаток в Excel', 'Схожесть'],
    ...results.map(r => [r.category, r.dbName, r.dbStock, r.dbCategory, r.bestMatch, r.excelStock, r.score]),
  ];

  const newWb = xlsx.utils.book_new();

  // Лист с полным списком
  const ws1 = xlsx.utils.aoa_to_sheet(sheetData);
  ws1['!cols'] = [
    { wch: 38 }, { wch: 52 }, { wch: 14 }, { wch: 22 }, { wch: 52 }, { wch: 14 }, { wch: 10 },
  ];
  xlsx.utils.book_append_sheet(newWb, ws1, 'Все несовпавшие');

  // Отдельный лист для каждой категории
  for (const cat of ORDER) {
    const rows2 = results.filter(r => r.category === cat);
    if (!rows2.length) continue;
    const data = [
      ['Название в БД', 'Остаток в БД', 'Категория товара', 'Похожее название в Excel', 'Остаток в Excel', 'Схожесть'],
      ...rows2.map(r => [r.dbName, r.dbStock, r.dbCategory, r.bestMatch, r.excelStock, r.score]),
    ];
    const ws2 = xlsx.utils.aoa_to_sheet(data);
    ws2['!cols'] = [{ wch: 52 }, { wch: 14 }, { wch: 22 }, { wch: 52 }, { wch: 14 }, { wch: 10 }];
    const shortName = cat
      .replace('Почти одинаковые (опечатка/регистр)', '1. Опечатка-регистр')
      .replace('Похожие (небольшое расхождение)', '2. Небольшое расхождение')
      .replace('Перестановка слов / разный порядок', '3. Перестановка слов')
      .replace('Одно название содержит другое', '4. Содержит другое')
      .replace('Не найдено совпадений', '5. Нет совпадений')
      .slice(0, 31);
    xlsx.utils.book_append_sheet(newWb, ws2, shortName);
  }

  xlsx.writeFile(newWb, EXCEL_OUT);
  console.log(`\n✅ Файл сохранён: ${EXCEL_OUT}`);

  // Сводка
  for (const cat of ORDER) {
    const cnt = results.filter(r => r.category === cat).length;
    if (cnt) console.log(`   ${cat}: ${cnt}`);
  }

  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
