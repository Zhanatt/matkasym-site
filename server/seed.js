const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Product = require('./models/Product');

// Helper: extract Google Drive file ID from share URL
const driveId = (url) => {
  if (!url) return null;
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
};

// ─────────────────────────────────────────────────────────────────────────────
// MATKASYM HOME — TAZA KIYM (Таза кийим) сеты
// Стандарт / VIP / Премиум × Белый / Чёрный
// ─────────────────────────────────────────────────────────────────────────────

const products = [

  // ═══════════════════════════════════════════════════════════
  // КОРЗИНА ДЛЯ БЕЛЬЯ
  // ═══════════════════════════════════════════════════════════
  {
    name: 'Washday',
    fullName: 'Корзина для белья Washday',
    brand: 'matkasym-home',
    set: 'taza-kiym',
    category: 'laundry-basket',
    price: 600, priceWholesale: 600, priceDealer: 530,
    description: 'Лёгкая и вместительная корзина для белья. Входит в наборы TAZA KIYM Standard, VIP и Premium.',
    tags: ['taza-kiym', 'washday', 'корзина'],
    driveImages: [driveId('https://drive.google.com/file/d/1sEnuZV4crg7jdi7WAiVWZitZ3QrEXnXG/view?usp=sharing')],
    isNew: false, inStock: true, stock: 100, rating: 4.6, reviewCount: 42,
  },
  {
    name: 'Washday ECO',
    fullName: 'Корзина для белья Washday ECO',
    brand: 'matkasym-home',
    set: 'taza-kiym',
    category: 'laundry-basket',
    price: 650, priceWholesale: 650, priceDealer: 600,
    description: 'Эко-версия корзины Washday из переработанных материалов.',
    tags: ['taza-kiym', 'washday', 'eco', 'корзина'],
    driveImages: [],
    isNew: true, inStock: true, stock: 30, rating: 4.3, reviewCount: 5,
  },

  // ═══════════════════════════════════════════════════════════
  // СУШИЛКА ДЛЯ БЕЛЬЯ
  // ═══════════════════════════════════════════════════════════
  {
    name: 'Comfort',
    fullName: 'Сушилка для белья Comfort (серый)',
    brand: 'matkasym-home',
    set: 'taza-kiym', setLevel: 'standard', color: 'grey',
    category: 'clothes-dryer',
    price: 930, priceWholesale: 930, priceDealer: 900,
    description: 'Компактная складная сушилка серого цвета. Входит в набор TAZA KIYM Standard.',
    tags: ['taza-kiym', 'standard', 'comfort', 'серый'],
    driveImages: [driveId('https://drive.google.com/file/d/1QnmW_4DPCSHOdNvWbgW2_ZFifPPsg7OH/view?usp=sharing')],
    isNew: false, inStock: true, stock: 40, rating: 4.6, reviewCount: 28,
  },
  {
    name: 'Comfort',
    fullName: 'Сушилка для белья Comfort (чёрный)',
    brand: 'matkasym-home',
    set: 'taza-kiym', setLevel: 'standard', color: 'black',
    category: 'clothes-dryer',
    price: 930, priceWholesale: 930, priceDealer: 900,
    description: 'Компактная складная сушилка чёрного цвета. Входит в набор TAZA KIYM Standard (чёрный).',
    tags: ['taza-kiym', 'standard', 'comfort', 'чёрный'],
    driveImages: [driveId('https://drive.google.com/file/d/1QnmW_4DPCSHOdNvWbgW2_ZFifPPsg7OH/view?usp=sharing')],
    isNew: false, inStock: true, stock: 35, rating: 4.6, reviewCount: 19,
  },
  {
    name: 'Sakura',
    fullName: 'Сушилка для белья Sakura',
    brand: 'matkasym-home',
    set: 'taza-kiym', setLevel: 'vip',
    category: 'clothes-dryer',
    price: 1150, priceWholesale: 1150, priceDealer: 1100,
    description: 'Сушилка Sakura с увеличенной площадью сушки. Входит в набор TAZA KIYM VIP.',
    tags: ['taza-kiym', 'vip', 'sakura'],
    driveImages: [driveId('https://drive.google.com/file/d/1knzfaV9XZrLDy_aPUKY-ukDPhuoc2rQo/view?usp=sharing')],
    isNew: false, inStock: true, stock: 25, rating: 4.7, reviewCount: 34,
  },
  {
    name: 'Avangard',
    fullName: 'Сушилка для белья Avangard',
    brand: 'matkasym-home',
    set: 'taza-kiym', setLevel: 'vip',
    category: 'clothes-dryer',
    price: 1350, priceWholesale: 1350, priceDealer: 1250,
    description: 'Сушилка Avangard с широкими планками для больших семей. Входит в набор TAZA KIYM VIP.',
    tags: ['taza-kiym', 'vip', 'avangard'],
    driveImages: [driveId('https://drive.google.com/file/d/1vJsLMxRGArgEWEJ23WtW6jrWN1SR9ULN/view?usp=sharing')],
    isNew: false, inStock: true, stock: 20, rating: 4.8, reviewCount: 41,
  },
  {
    name: 'Keremet',
    fullName: 'Сушилка для белья Keremet (белый)',
    brand: 'matkasym-home',
    set: 'taza-kiym', setLevel: 'premium', color: 'white',
    category: 'clothes-dryer',
    price: 2200, priceWholesale: 2200, priceDealer: 2100,
    description: 'Премиальная трёхъярусная сушилка Keremet белого цвета. Входит в набор TAZA KIYM Premium.',
    tags: ['taza-kiym', 'premium', 'keremet', 'белый'],
    driveImages: [driveId('https://drive.google.com/file/d/1bvcSg0HnjiQwuTqAbOado1ifFcFJ8EFQ/view?usp=sharing')],
    isNew: false, inStock: true, stock: 15, rating: 4.9, reviewCount: 52,
  },
  {
    name: 'Keremet',
    fullName: 'Сушилка для белья Keremet (чёрный)',
    brand: 'matkasym-home',
    set: 'taza-kiym', setLevel: 'premium', color: 'black',
    category: 'clothes-dryer',
    price: 2200, priceWholesale: 2200, priceDealer: 2100,
    description: 'Премиальная трёхъярусная сушилка Keremet чёрного цвета. Входит в набор TAZA KIYM Premium (чёрный).',
    tags: ['taza-kiym', 'premium', 'keremet', 'чёрный'],
    driveImages: [driveId('https://drive.google.com/file/d/1bvcSg0HnjiQwuTqAbOado1ifFcFJ8EFQ/view?usp=sharing')],
    isNew: true, inStock: true, stock: 12, rating: 4.9, reviewCount: 18,
  },

  // ═══════════════════════════════════════════════════════════
  // ГЛАДИЛЬНАЯ ДОСКА
  // ═══════════════════════════════════════════════════════════
  {
    name: 'Eco',
    fullName: 'Гладильная доска Eco',
    brand: 'matkasym-home',
    set: 'taza-kiym', setLevel: 'standard',
    category: 'ironing-board',
    price: 1090, priceWholesale: 1090, priceDealer: 1050,
    description: 'Лёгкая гладильная доска с регулируемой высотой. Входит в набор TAZA KIYM Standard.',
    tags: ['taza-kiym', 'standard', 'eco', 'гладильная доска'],
    driveImages: [driveId('https://drive.google.com/file/d/1F8z0Aq1M7nzfpcYANOFIq7q2GYLPxJso/view?usp=sharing')],
    isNew: false, inStock: true, stock: 30, rating: 4.4, reviewCount: 22,
  },
  {
    name: 'Eco с удлинителем',
    fullName: 'Гладильная доска Eco с удлинителем',
    brand: 'matkasym-home',
    set: 'taza-kiym',
    category: 'ironing-board',
    price: 1190, priceWholesale: 1190, priceDealer: 1150,
    description: 'Гладильная доска Eco с дополнительным удлинителем для брюк.',
    tags: ['taza-kiym', 'eco', 'удлинитель'],
    driveImages: [driveId('https://drive.google.com/file/d/1QI1ibynmmoYQBvxfU-5pFlevG-Ki0eeH/view?usp=sharing')],
    isNew: false, inStock: true, stock: 25, rating: 4.5, reviewCount: 16,
  },
  {
    name: 'Sakura',
    fullName: 'Гладильная доска Sakura',
    brand: 'matkasym-home',
    set: 'taza-kiym', setLevel: 'vip',
    category: 'ironing-board',
    price: 1370, priceWholesale: 1370, priceDealer: 1270,
    description: 'Гладильная доска Sakura с широкой рабочей поверхностью. Входит в набор TAZA KIYM VIP.',
    tags: ['taza-kiym', 'vip', 'sakura', 'гладильная доска'],
    driveImages: [driveId('https://drive.google.com/file/d/12-oYXlVQYVK1dlZfKYfZfhWxwXQKQBmO/view?usp=sharing')],
    isNew: false, inStock: true, stock: 20, rating: 4.7, reviewCount: 29,
  },
  {
    name: 'Sakura с удлинителем',
    fullName: 'Гладильная доска Sakura с удлинителем',
    brand: 'matkasym-home',
    set: 'taza-kiym', setLevel: 'vip',
    category: 'ironing-board',
    price: 1470, priceWholesale: 1470, priceDealer: 1370,
    description: 'Гладильная доска Sakura с удлинителем — профессиональное глажение дома.',
    tags: ['taza-kiym', 'vip', 'sakura', 'удлинитель'],
    driveImages: [driveId('https://drive.google.com/file/d/1UBqEWsC7Oc3vaMfnPpzVijgSdYsuFT86/view?usp=sharing')],
    isNew: false, inStock: true, stock: 18, rating: 4.8, reviewCount: 37,
  },
  {
    name: 'Sanira S',
    fullName: 'Гладильная доска Sanira S',
    brand: 'matkasym-home',
    set: 'taza-kiym', setLevel: 'premium',
    category: 'ironing-board',
    price: 2500, priceWholesale: 2500, priceDealer: 2350,
    description: 'Профессиональная гладильная доска Sanira S с усиленной рамой. Входит в набор TAZA KIYM Premium.',
    tags: ['taza-kiym', 'premium', 'sanira'],
    driveImages: [],
    isNew: false, inStock: true, stock: 10, rating: 4.9, reviewCount: 14,
  },
  {
    name: 'Sanira X',
    fullName: 'Гладильная доска Sanira X',
    brand: 'matkasym-home',
    set: 'taza-kiym', setLevel: 'premium',
    category: 'ironing-board',
    price: 2600, priceWholesale: 2600, priceDealer: 2450,
    description: 'Гладильная доска Sanira X с крестообразным основанием — максимальная устойчивость.',
    tags: ['taza-kiym', 'premium', 'sanira'],
    driveImages: [],
    isNew: false, inStock: true, stock: 8, rating: 4.9, reviewCount: 11,
  },
  {
    name: 'Sanira A',
    fullName: 'Гладильная доска Sanira A',
    brand: 'matkasym-home',
    set: 'taza-kiym',
    category: 'ironing-board',
    price: 1500, priceWholesale: 1500, priceDealer: 1400,
    description: 'Гладильная доска Sanira A — оптимальное соотношение цены и качества.',
    tags: ['taza-kiym', 'sanira'],
    driveImages: [],
    isNew: false, inStock: true, stock: 12, rating: 4.6, reviewCount: 9,
  },
  {
    name: 'Sanira M',
    fullName: 'Гладильная доска Sanira M',
    brand: 'matkasym-home',
    set: 'taza-kiym',
    category: 'ironing-board',
    price: 2300, priceWholesale: 2300, priceDealer: 2150,
    description: 'Гладильная доска Sanira M среднего размера с надёжным основанием.',
    tags: ['taza-kiym', 'sanira'],
    driveImages: [],
    isNew: false, inStock: true, stock: 10, rating: 4.7, reviewCount: 8,
  },
  {
    name: 'Sanira E',
    fullName: 'Гладильная доска Sanira E',
    brand: 'matkasym-home',
    set: 'taza-kiym',
    category: 'ironing-board',
    price: 2000, priceWholesale: 2000, priceDealer: 1900,
    description: 'Компактная гладильная доска Sanira E.',
    tags: ['taza-kiym', 'sanira'],
    driveImages: [],
    isNew: false, inStock: true, stock: 10, rating: 4.6, reviewCount: 7,
  },

  // ═══════════════════════════════════════════════════════════
  // ГАРДЕРОБНАЯ ВЕШАЛКА
  // ═══════════════════════════════════════════════════════════
  {
    name: 'Enigma',
    fullName: 'Гардеробная вешалка Enigma (белый)',
    brand: 'matkasym-home',
    set: 'taza-kiym', setLevel: 'standard', color: 'white',
    category: 'wardrobe-rack',
    price: 1420, priceWholesale: 1420, priceDealer: 1330,
    description: 'Гардеробная вешалка Enigma, нагрузка 100 кг. Входит в набор TAZA KIYM Standard (белый).',
    tags: ['taza-kiym', 'standard', 'enigma', 'белый'],
    driveImages: [driveId('https://drive.google.com/file/d/1Vam45RhbnI8f_gIOiiMweAklXDiZZV6q/view?usp=sharing')],
    isNew: false, inStock: true, stock: 20, rating: 4.7, reviewCount: 31,
  },
  {
    name: 'Enigma',
    fullName: 'Гардеробная вешалка Enigma (чёрный)',
    brand: 'matkasym-home',
    set: 'taza-kiym', setLevel: 'standard', color: 'black',
    category: 'wardrobe-rack',
    price: 1420, priceWholesale: 1420, priceDealer: 1330,
    description: 'Гардеробная вешалка Enigma, нагрузка 100 кг. Входит в набор TAZA KIYM Standard (чёрный).',
    tags: ['taza-kiym', 'standard', 'enigma', 'чёрный'],
    driveImages: [driveId('https://drive.google.com/file/d/1Vam45RhbnI8f_gIOiiMweAklXDiZZV6q/view?usp=sharing')],
    isNew: false, inStock: true, stock: 18, rating: 4.7, reviewCount: 24,
  },
  {
    name: 'Infinity',
    fullName: 'Гардеробная вешалка Infinity (белый)',
    brand: 'matkasym-home',
    set: 'taza-kiym', setLevel: 'vip', color: 'white',
    category: 'wardrobe-rack',
    price: 1790, priceWholesale: 1790, priceDealer: 1725,
    description: 'Двойная перекладина, нагрузка 100 кг. Входит в набор TAZA KIYM VIP (белый).',
    tags: ['taza-kiym', 'vip', 'infinity', 'белый'],
    driveImages: [driveId('https://drive.google.com/file/d/16pAJ7GnnTiKtGkhZQ00MtCHphFBg0XCt/view?usp=sharing')],
    isNew: false, inStock: true, stock: 15, rating: 4.8, reviewCount: 27,
  },
  {
    name: 'Infinity',
    fullName: 'Гардеробная вешалка Infinity (чёрный)',
    brand: 'matkasym-home',
    set: 'taza-kiym', setLevel: 'vip', color: 'black',
    category: 'wardrobe-rack',
    price: 1790, priceWholesale: 1790, priceDealer: 1725,
    description: 'Двойная перекладина, нагрузка 100 кг. Входит в набор TAZA KIYM VIP (чёрный).',
    tags: ['taza-kiym', 'vip', 'infinity', 'чёрный'],
    driveImages: [driveId('https://drive.google.com/file/d/16pAJ7GnnTiKtGkhZQ00MtCHphFBg0XCt/view?usp=sharing')],
    isNew: false, inStock: true, stock: 14, rating: 4.8, reviewCount: 19,
  },
  {
    name: 'Fenix',
    fullName: 'Гардеробная вешалка Fenix (белый)',
    brand: 'matkasym-home',
    set: 'taza-kiym', setLevel: 'premium', color: 'white',
    category: 'wardrobe-rack',
    price: 2200, priceWholesale: 2200, priceDealer: 2110,
    description: 'Премиальная вешалка Fenix с полочным блоком, нагрузка 100 кг. Входит в TAZA KIYM Premium (белый).',
    tags: ['taza-kiym', 'premium', 'fenix', 'белый'],
    driveImages: [driveId('https://drive.google.com/file/d/1qoyHVKeW7S1LEuIqEalV2ZOBkRPZJA1e/view?usp=sharing')],
    isNew: false, inStock: true, stock: 10, rating: 4.9, reviewCount: 33,
  },
  {
    name: 'Fenix',
    fullName: 'Гардеробная вешалка Fenix (чёрный)',
    brand: 'matkasym-home',
    set: 'taza-kiym', setLevel: 'premium', color: 'black',
    category: 'wardrobe-rack',
    price: 2200, priceWholesale: 2200, priceDealer: 2110,
    description: 'Премиальная вешалка Fenix с полочным блоком. Входит в TAZA KIYM Premium (чёрный).',
    tags: ['taza-kiym', 'premium', 'fenix', 'чёрный'],
    driveImages: [driveId('https://drive.google.com/file/d/1qoyHVKeW7S1LEuIqEalV2ZOBkRPZJA1e/view?usp=sharing')],
    isNew: false, inStock: true, stock: 8, rating: 4.9, reviewCount: 21,
  },
  {
    name: 'Kerben',
    fullName: 'Гардеробная вешалка Kerben (белый)',
    brand: 'matkasym-home',
    set: 'taza-kiym', color: 'white',
    category: 'wardrobe-rack',
    price: 1600, priceWholesale: 1600, priceDealer: 1500,
    description: 'Гардеробная вешалка Kerben с боковыми крюками.',
    tags: ['taza-kiym', 'kerben', 'белый'],
    driveImages: [driveId('https://drive.google.com/file/d/1D_bgFCsWN24lNauFMtivn0SJFBJoAhlf/view?usp=sharing')],
    isNew: true, inStock: true, stock: 10, rating: 4.6, reviewCount: 4,
  },
  {
    name: 'Kerben',
    fullName: 'Гардеробная вешалка Kerben (чёрный)',
    brand: 'matkasym-home',
    set: 'taza-kiym', color: 'black',
    category: 'wardrobe-rack',
    price: 1600, priceWholesale: 1600, priceDealer: 1500,
    description: 'Гардеробная вешалка Kerben с боковыми крюками.',
    tags: ['taza-kiym', 'kerben', 'чёрный'],
    driveImages: [driveId('https://drive.google.com/file/d/1D_bgFCsWN24lNauFMtivn0SJFBJoAhlf/view?usp=sharing')],
    isNew: true, inStock: true, stock: 10, rating: 4.6, reviewCount: 3,
  },

  // ═══════════════════════════════════════════════════════════
  // КОСТЮМНАЯ ВЕШАЛКА
  // ═══════════════════════════════════════════════════════════
  {
    name: 'Muras',
    fullName: 'Костюмная вешалка Muras (белый)',
    brand: 'matkasym-home',
    set: 'taza-kiym', setLevel: 'premium', color: 'white',
    category: 'coat-hanger',
    price: 980, priceWholesale: 980, priceDealer: 900,
    description: 'Костюмная вешалка Muras для прихожей. Входит в набор TAZA KIYM Premium (белый).',
    tags: ['taza-kiym', 'premium', 'muras', 'белый'],
    driveImages: [driveId('https://drive.google.com/file/d/1dQYosvaEmnIsSnRpSlMMDgFaYI0ur3GS/view?usp=sharing')],
    isNew: false, inStock: true, stock: 25, rating: 4.5, reviewCount: 17,
  },
  {
    name: 'Muras',
    fullName: 'Костюмная вешалка Muras (чёрный)',
    brand: 'matkasym-home',
    set: 'taza-kiym', setLevel: 'premium', color: 'black',
    category: 'coat-hanger',
    price: 980, priceWholesale: 980, priceDealer: 900,
    description: 'Костюмная вешалка Muras для прихожей. Входит в набор TAZA KIYM Premium (чёрный).',
    tags: ['taza-kiym', 'premium', 'muras', 'чёрный'],
    driveImages: [driveId('https://drive.google.com/file/d/1dQYosvaEmnIsSnRpSlMMDgFaYI0ur3GS/view?usp=sharing')],
    isNew: false, inStock: true, stock: 22, rating: 4.5, reviewCount: 13,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// СЕТЫ (для отдельной коллекции или виртуальных данных)
// ─────────────────────────────────────────────────────────────────────────────
// Структура TAZA KIYM:
//   Standard (белый): Comfort (grey) + Washday + Eco + Enigma (white)
//   Standard (чёрный): Comfort (black) + Washday + Eco + Enigma (black)
//   VIP (белый): Infinity (white) + Sakura (dryer) + Avangard + Washday + Sakura (ironing)
//   VIP (чёрный): Infinity (black) + Sakura (dryer) + Avangard + Washday + Sakura (ironing)
//   Premium (белый): Keremet (white) + Fenix (white) + Muras (white) + Sanira S + Washday
//   Premium (чёрный): Keremet (black) + Fenix (black) + Muras (black) + Sanira S + Washday

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected');

    await Product.deleteMany({});
    console.log('Old products cleared');

    const inserted = await Product.insertMany(products);
    console.log(`✅ Inserted ${inserted.length} products\n`);

    console.log('By set:');
    const bySet = inserted.reduce((acc, p) => {
      const key = `${p.set || 'no-set'} / ${p.setLevel || '-'}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    Object.entries(bySet).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

    console.log('\nBy category:');
    const byCat = inserted.reduce((acc, p) => {
      acc[p.category] = (acc[p.category] || 0) + 1;
      return acc;
    }, {});
    Object.entries(byCat).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  } catch (err) {
    console.error('Seed error:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('\nDone.');
  }
}

seed();
