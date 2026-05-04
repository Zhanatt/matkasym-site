/**
 * renameToMatch1C.js
 * Переименовывает товары в БД под имена из 1С (Excel остатки).
 * Старые товары получают правильные 1С-имена.
 * Пустые дубликаты (price=0, images=0) удаляются.
 *
 * Запуск (сухой прогон): node renameToMatch1C.js
 * Запуск (реальное выполнение): node renameToMatch1C.js --execute
 */

const mongoose = require('mongoose');
const Product  = require('./models/Product');

const MONGO_URI = 'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym?appName=M0';
const EXECUTE   = process.argv.includes('--execute');

// ── Маппинг: старый fullName (lower) → новый 1С fullName ────────────────────
// Для MATKASYM HOME — используем `name` поле как доп. ключ для Aria (2 vs 3)
const RENAME_MAP = {
  // ── Вешалки настенные Bosogo ──────────────────────────────────────────────
  'matkasym home — bosogo 5sw (белый)':         'Настенная вешалка "Bosogo 5sw"(Белая)',
  'matkasym home — bosogo 5sw (чёрный)':        'Настенная вешалка "Bosogo 5sw"(Черная)',
  'matkasym home — bosogo 9sw (белый)':         'Настенная вешалка "Bosogo 9sw"(Белая)',
  // Bosogo 9SW черный — нет в 1С, пропускаем

  // ── Temir ilgich ──────────────────────────────────────────────────────────
  'matkasym home — temir ilgich 10s (белый)':   'Настенная вешалка Temir ilgich 10S (Белая)',
  'matkasym home — temir ilgich 10s (чёрный)':  'Настенная вешалка Temir ilgich 10S (Черная)',
  'matkasym home — temir ilgich 5s (белый)':    'Настенная вешалка Temir ilgich 5S (Белая)',
  'matkasym home — temir ilgich 5s (чёрный)':   'Настенная вешалка Temir ilgich 5S (Черная)',

  // ── Вешалки напольные ─────────────────────────────────────────────────────
  'matkasym home — archa (напольная вешалка)':  'Вешалка напольная ARCHA (Черная)',

  // ── Гардеробные вешалки ───────────────────────────────────────────────────
  'matkasym home — enigma (белый)':             'Гардеробная вешалка ENIGMA белый',
  'matkasym home — enigma (чёрный)':            'Гардеробная вешалка ENIGMA черный',
  'matkasym home — fenix (белый)':              'Гардеробная вешалка FENIX белый',
  'matkasym home — fenix (чёрный)':             'Гардеробная вешалка FENIX черный',
  'matkasym home — infinity (белый)':           'Гардеробная вешалка INFINITY белый',
  'matkasym home — infinity (чёрный)':          'Гардеробная вешалка INFINITY черный',
  'matkasym home — kerben (чёрный)':            'Гардеробная вешалка KERBEN черный',

  // ── Обувные полки и банкетка ──────────────────────────────────────────────
  'matkasym home — lion 3 (белый)':             'Полка для обуви LION 3 (Белый)',
  'matkasym home — lion 3 (чёрный)':            'Полка для обуви LION 3 (черный)',
  'matkasym home — lion 4 (белый)':             'Полка для обуви LION 4 (белая)',
  'matkasym home — lion 4 (чёрный)':            'Полка для обуви LION 4 ( Черный)',
  'matkasym home — oturguch (обувная полка с сидушкой)': 'Банкетка OTURGUCH',

  // ── Полки для цветов ──────────────────────────────────────────────────────
  'matkasym home — bagym (полка для цветов)':   'Полка для цветов "Bagym" (черная)',
  'matkasym home — bakcha (полка для цветов)':  'Полка для цветов "Bakcha 3" (черная)',

  // ── Угловые полки (ванная) ────────────────────────────────────────────────
  // Aria 2 (name=Aria 2, color=white) и Aria 3 (name=Aria 3, color='')
  // обрабатываются отдельно в ARIA_MAP

  // ── Гладильные доски ECO ─────────────────────────────────────────────────
  'matkasym home — eco (гладильная доска)':                   'Гладильная доска ECO (Белая)',
  'matkasym home — eco (гладильная доска с удлинителем)':     'Гладильная доска ECO с удлинителем (Белая)',

  // ── Гладильные доски SAKURA ───────────────────────────────────────────────
  'matkasym home — sakura (гладильная доска)':                'Гладильная доска SAKURA',
  'matkasym home — sakura (гладильная доска с удлинителем)':  'Гладильная доска SAKURA с удлинителем',

  // ── Сушилки SAKURA ────────────────────────────────────────────────────────
  'matkasym home — sakura (белый)':             'Сушилка для белья SAKURA',
  'matkasym home — sakura (розовый)':           'Сушилка для белья SAKURA (розовая)',

  // ── Сушилки KEREMET ───────────────────────────────────────────────────────
  'matkasym home — keremet (белый)':            'Сушилка 3х этажная "Keremet" (Белая)',
  'matkasym home — keremet (чёрный)':           'Сушилка 3х этажная "Keremet" (Черная)',

  // ── Сушилки AVANGARD / COMFORT ────────────────────────────────────────────
  'matkasym home — avangard (чёрный)':          'Сушилка для белья AVANGARD',
  'matkasym home — comfort (серый)':            'Сушилка для белья COMFORT(Серая)',
  'matkasym home — comfort (чёрный)':           'Сушилка для белья COMFORT (Черная)',

  // ── Корзина для белья ─────────────────────────────────────────────────────
  'matkasym home — washday (корзина для белья)': 'Корзина для белья WASHDAY',

  // ── Гладильные доски SANIRA ───────────────────────────────────────────────
  'matkasym home — sanira a (гладильная доска)': 'Гладильная доска с двойной ножкой SANIRA(A)',
  'matkasym home — sanira e (гладильная доска)': 'Гладильная доска с большой подставкой SANIRA(E)',
  'matkasym home — sanira m (гладильная доска)': 'Гладильная доска с железный выдвижной SANIRA(M)',
  'matkasym home — sanira s (гладильная доска)': 'Гладильная доска пластиковой выдвижной SANIRA(S)',
  'matkasym home — sanira x (гладильная доска)': 'Гладильная доска железная SANIRA(X)',

  // ── Антенны ───────────────────────────────────────────────────────────────
  'matkasym home — sanarip 10 (антенна наружная)':             'Антенна Санарип 10 м',
  'matkasym home — sanarip 15 (антенна наружная)':             'Антенна Санарип 15 м',
  'matkasym home — sanarip 20 (антенна наружная)':             'Антенна Санарип 20 м',
  'matkasym home — smart (антенна наружная)':                  'Антенна Смарт 10 м',
  'matkasym home — smart с усилителем (антенна наружная)':     'Антенна Смарт 10 м с усилителем',
  'matkasym home — tereze (антенна комнатная)':                'Антенна комнатная TEREZE ',
  'matkasym home — compact (антенна комнатная)':               'Антенна комнатная Компакт',

  // ── Кронштейны ────────────────────────────────────────────────────────────
  'matkasym home — romi 1 15-47 (кронштейн)':  'Кронштейн для ТВ ROMI 1/15-47',
  'matkasym home — romi 2 26-63 (кронштейн)':  'Кронштейн для ТВ ROMI 2/26-63',

  // ── Мангалы ───────────────────────────────────────────────────────────────
  'matkasym home — r6 (мангал)':               'Эко мангал R 6',
  'matkasym home — r8 (мангал)':               'Эко мангал R 8',
  'matkasym home — r10 (мангал)':              'Эко мангал R10',

  // ── Электрощиты (ЩР IP31 → Электрощит) ──────────────────────────────────
  'щит распределительный наружный щр ip31 30х22х12': 'Электрощит 30*22*12',
  'щит распределительный наружный щр ip31 30х30х15': 'Электрощит 30*30*15',
  'щит распределительный наружный щр ip31 35х35х15': 'Электрощит 35*35*15',
  'щит распределительный наружный щр ip31 40х30х15': 'Электрощит 40*30*15',
  'щит распределительный наружный щр ip31 40х40х15': 'Электрощит 40х40х15',
  'щит распределительный наружный щр ip31 43х43х15': 'Электрощит 43*43*15',
  'щит распределительный наружный щр ip31 50х30х15': 'Электрощит 50*30*15',
  'щит распределительный наружный щр ip31 50х40х15': 'Электрощит 50*40*15',
  'щит распределительный наружный щр ip31 50х40х20': 'Электрощит 50х40х20',
  'щит распределительный наружный щр ip31 60х40х15': 'Электрощит 60*40*15',
  'щит распределительный наружный щр ip31 60х40х20': 'Электрощит 60х40х20',
  'щит распределительный наружный щр ip31 65х50х20': 'Электрощит 65*50*20',
  'щит распределительный наружный щр ip31 80х60х20': 'Электрощит 80*60*20',

  // ── Газовые щиты ──────────────────────────────────────────────────────────
  'щит газовый регулирующий щгр вертикальный':  'Щит газовый вертикальный',

  // ── Шкафы Aichurok ────────────────────────────────────────────────────────
  'тумба aichurok t 3':                'Тумба Aichurok T3 ящиками черный ручки (W010A-3 H1020*W460*В600)',
  'тумба aichurok t 4':                'Тумба  Aichurok T4 ящиками черный ручки (W 010A-4 H1320*W472*В600)',
  'шкаф aichurok go 2 (glass office)': 'Шкаф  Aichurok GO2 (W052 H1850*W850*D400)',
  'шкаф aichurok мo 2 (metall office)': 'Шкаф  Aichurok MO2 для документов (W060H1850*W850*D400 (5 полок))',
  'шкаф aichurok мr 3 (metall razdevalka)': 'Шкаф  Aichurok MR3 дверцами (W001-3 H1850*W380*D420)',
  'шкаф aichurok мr 4 (metall razdevalka)': 'Шкаф Aichurok MR4 дверцами (W001-4 H1850*W380*D420)',
  'шкаф aichurok мr 6 (metall razdevalka)': 'Шкаф Aichurok MR 6 (W078  H1850*W900*D420)',

  // ── Интерактивные столы ────────────────────────────────────────────────────
  'интерактивный стол i 1 r модель 01': 'Стол I 1 R модель - 01',
  'интерактивный стол i 1 r модель 03': 'Стол I 1 R модель - 03',

  // ── Промышленные стеллажи ─────────────────────────────────────────────────
  'промышленный стеллаж adik storage light':  'стеллаж промышленный ADIK STORAGE LIGHT 150х50х200',
  'промышленный стеллаж adik storage medium': 'стеллаж промышленный ADIK STORAGE MEDIUM 200х60х200',

  // ── Кронштейны для кондиционера ────────────────────────────────────────────
  'кронштейн для кондиционера melis pro': 'Кронштейн для кондиционера MAX 18 (Белый 1,8)',
  'кронштейн для кондиционера middle 12': 'Кронштейн для кондиционера MIDDLE 12 (Белый 1.8)',
  'кронштейн для кондиционера mini 9':    'Кронштейн для кондиционера MINI 7-9 (Белый 1,8)',
};

// Специальная обработка ARIA (у них одинаковый fullName, но разный name)
const ARIA_MAP = {
  'aria 2': 'Уголок для ванны "ARIA" 2х с крючком (Белый) 4мм',
  'aria 3': 'Уголок для ванны "ARIA" 3х (Белый)',
};

// Функция: базовое имя из fullName (убирает цветовой суффикс)
function baseName(fullName) {
  return (fullName || '')
    .replace(/\s*\((?:Белая|Белый|белый|белая|Черная|Черный|черный|черная|Серая|Серый|Розовая|розовый|розовая|чёрный|чёрная|белая|белый)\)\s*$/i, '')
    .replace(/\s+белый$|\s+черный$/i, '')
    .trim();
}

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Подключено к MongoDB Atlas\n');

  const products = await Product.find({});
  const byFullNameLower = new Map();
  products.forEach(p => {
    const key = (p.fullName || '').toLowerCase();
    if (!byFullNameLower.has(key)) byFullNameLower.set(key, []);
    byFullNameLower.get(key).push(p);
  });

  let renamed = 0;
  let deleted = 0;
  let skipped = 0;
  const notFound = [];

  console.log(`📋 Режим: ${EXECUTE ? '🔴 ВЫПОЛНЕНИЕ' : '🟡 СУХОЙ ПРОГОН (добавьте --execute для реального выполнения)'}\n`);

  for (const product of products) {
    const fnLower = (product.fullName || '').toLowerCase();
    let newFullName = RENAME_MAP[fnLower];

    // Специальная обработка ARIA
    if (!newFullName && fnLower.includes('aria (угловая полка)')) {
      const nameLower = (product.name || '').toLowerCase();
      newFullName = ARIA_MAP[nameLower];
    }

    if (!newFullName) {
      if (fnLower.includes('matkasym home') || fnLower.includes('щр ip31')) {
        notFound.push(product.fullName);
      }
      continue;
    }

    // Базовое имя для поля `name` (убираем цвет)
    const newName = baseName(newFullName);

    console.log(`🔄 ПЕРЕИМЕНОВАНИЕ:`);
    console.log(`   БД:  ${product.fullName}`);
    console.log(`   1С:  ${newFullName}`);

    if (EXECUTE) {
      await Product.updateOne(
        { _id: product._id },
        { $set: { name: newName, fullName: newFullName } }
      );
    }
    renamed++;

    // Ищем пустой дубликат с новым именем (price=0, нет изображений)
    const dupKey = newFullName.toLowerCase();
    const dups = byFullNameLower.get(dupKey) || [];
    for (const dup of dups) {
      if (dup._id.toString() === product._id.toString()) continue;
      const hasData = (dup.price > 0) || ((dup.images || []).length > 0) || ((dup.driveImages || []).length > 0);
      if (!hasData) {
        console.log(`   🗑️  Удаляем пустой дубликат: ${dup.fullName} (id: ${dup._id})`);
        if (EXECUTE) {
          await Product.deleteOne({ _id: dup._id });
        }
        deleted++;
      } else {
        console.log(`   ⚠️  Дубликат с данными — не удаляем: ${dup.fullName} (price: ${dup.price}, images: ${(dup.images || []).length})`);
        skipped++;
      }
    }
    console.log();
  }

  console.log('════════════════════════════════════════');
  console.log(`✅ Переименовано:      ${renamed}`);
  console.log(`🗑️  Удалено дубликатов: ${deleted}`);
  console.log(`⚠️  Пропущено (данные): ${skipped}`);

  if (notFound.length) {
    console.log(`\n🔴 Не нашли 1С-имя для (${notFound.length}):`);
    notFound.forEach(n => console.log(`   • ${n}`));
  }

  if (!EXECUTE) {
    console.log('\n💡 Запустите с флагом --execute для реального переименования:');
    console.log('   node renameToMatch1C.js --execute');
  }

  await mongoose.disconnect();
  console.log('\n✅ Готово');
}

main().catch(err => { console.error(err); process.exit(1); });
