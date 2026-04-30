/**
 * Seed MATKASYM SHAAR products from matkasym_shaar.xlsx
 * Запуск: node seedShaar.js
 */
const mongoose = require('mongoose');
const Product  = require('./models/Product');

const MONGO_URI = 'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym?appName=M0';

const BASE = {
  brand:         'matkasym-shaar',
  price:         0,
  priceCost:     0,
  priceWholesale:0,
  priceDealer:   0,
  inStock:       false,
  stock:         0,
  stockStatus:   'out_of_stock',
  productStatus: 'planned',
  isNew:         false,
  rating:        0,
  reviewCount:   0,
};

const products = [

  // ══════════════════════════════════════════════════════════════════════════
  // 0-TASHTANDY — Урны и контейнеры
  // ══════════════════════════════════════════════════════════════════════════

  // ── Офисные урны ───────────────────────────────────────────────────────
  { set: '0-tashtandy', category: 'waste-bin', name: 'О 8',  fullName: 'Офисная урна О 8' },
  { set: '0-tashtandy', category: 'waste-bin', name: 'О 12', fullName: 'Офисная урна О 12' },
  { set: '0-tashtandy', category: 'waste-bin', name: 'О 16', fullName: 'Офисная урна О 16' },
  { set: '0-tashtandy', category: 'waste-bin', name: '40 литров 2х камерная',  fullName: 'Офисная урна 40 л 2х камерная (cross)' },
  { set: '0-tashtandy', category: 'waste-bin', name: '20 литров 2х камерная',  fullName: 'Офисная урна 20 л 2х камерная (cross)' },

  // ── Эко урны G — graund ────────────────────────────────────────────────
  { set: '0-tashtandy', category: 'waste-bin-eco', name: 'G Tegerek', fullName: 'Эко урна G Tegerek (graund)' },
  { set: '0-tashtandy', category: 'waste-bin-eco', name: 'G2',        fullName: 'Эко урна G2 (graund)' },
  { set: '0-tashtandy', category: 'waste-bin-eco', name: 'G3',        fullName: 'Эко урна G3 (graund)' },
  { set: '0-tashtandy', category: 'waste-bin-eco', name: 'G4',        fullName: 'Эко урна G4 (graund)' },

  // ── Эко урны G — graund wood ───────────────────────────────────────────
  { set: '0-tashtandy', category: 'waste-bin-eco', name: 'GW',  fullName: 'Эко урна GW (graund wood)' },
  { set: '0-tashtandy', category: 'waste-bin-eco', name: 'GW2', fullName: 'Эко урна GW2 (graund wood)' },
  { set: '0-tashtandy', category: 'waste-bin-eco', name: 'GW3', fullName: 'Эко урна GW3 (graund wood)' },

  // ── Эко урны G — GWR series ────────────────────────────────────────────
  { set: '0-tashtandy', category: 'waste-bin-eco', name: 'GWR',  fullName: 'Эко урна GWR' },
  { set: '0-tashtandy', category: 'waste-bin-eco', name: 'GWR2', fullName: 'Эко урна GWR2' },
  { set: '0-tashtandy', category: 'waste-bin-eco', name: 'GWR3', fullName: 'Эко урна GWR3' },

  // ── Эко урны S — asma ──────────────────────────────────────────────────
  { set: '0-tashtandy', category: 'waste-bin-eco', name: 'A',  fullName: 'Эко урна A (asma)' },
  { set: '0-tashtandy', category: 'waste-bin-eco', name: 'AW', fullName: 'Эко урна AW (asma wood)' },

  // ── Эко урны S — square wood ───────────────────────────────────────────
  { set: '0-tashtandy', category: 'waste-bin-eco', name: 'SW',  fullName: 'Эко урна SW (square wood)' },
  { set: '0-tashtandy', category: 'waste-bin-eco', name: 'SW2', fullName: 'Эко урна SW2 (square wood)' },
  { set: '0-tashtandy', category: 'waste-bin-eco', name: 'SW3', fullName: 'Эко урна SW3 (square wood)' },

  // ── Эко урны KARAKOL — bishkek petroleum ──────────────────────────────
  { set: '0-tashtandy', category: 'waste-bin-eco', name: 'BP',       fullName: 'Эко урна BP (bishkek petroleum)' },
  { set: '0-tashtandy', category: 'waste-bin-eco', name: 'BP Pro',   fullName: 'Эко урна BP Pro (bishkek petroleum)' },
  { set: '0-tashtandy', category: 'waste-bin-eco', name: 'Plaza',    fullName: 'Эко урна Plaza' },
  { set: '0-tashtandy', category: 'waste-bin-eco', name: 'Karakol 2', fullName: 'Эко урна Karakol 2' },
  { set: '0-tashtandy', category: 'waste-bin-eco', name: 'Karakol 3', fullName: 'Эко урна Karakol 3' },
  { set: '0-tashtandy', category: 'waste-bin-eco', name: 'Karakol 4', fullName: 'Эко урна Karakol 4' },
  { set: '0-tashtandy', category: 'waste-bin-eco', name: 'Novotel 3', fullName: 'Эко урна Novotel 3' },

  // ── ЭКО КОНТЕЙНЕРЫ ────────────────────────────────────────────────────
  { set: '0-tashtandy', category: 'waste-container', name: 'ECO Mayak',       fullName: 'Эко контейнер ECO Mayak' },
  { set: '0-tashtandy', category: 'waste-container', name: 'Tazalyk 1100 L',  fullName: 'Эко контейнер Tazalyk 1100 L',   dimensions: '1100 л' },
  { set: '0-tashtandy', category: 'waste-container', name: 'Tazalyk 660 L',   fullName: 'Эко контейнер Tazalyk 660 L',    dimensions: '660 л'  },
  { set: '0-tashtandy', category: 'waste-container', name: 'Tazalyk R 1100 L', fullName: 'Эко контейнер Tazalyk R 1100 L', dimensions: '1100 л' },

  // ── ПЛАСТИКОВЫЕ ЭКО КОНТЕЙНЕРЫ ────────────────────────────────────────
  { set: '0-tashtandy', category: 'waste-container', name: '1100 литров',           fullName: 'Пластиковый контейнер 1100 л (cross)',          dimensions: '1100 л' },
  { set: '0-tashtandy', category: 'waste-container', name: '660 литров',            fullName: 'Пластиковый контейнер 660 л (cross)',           dimensions: '660 л'  },
  { set: '0-tashtandy', category: 'waste-container', name: '330 литров',            fullName: 'Пластиковый контейнер 330 л (cross)',           dimensions: '330 л'  },
  { set: '0-tashtandy', category: 'waste-container', name: '240 литров с педалью',  fullName: 'Пластиковый контейнер 240 л с педалью (cross)', dimensions: '240 л'  },
  { set: '0-tashtandy', category: 'waste-container', name: '120 литров с педалью',  fullName: 'Пластиковый контейнер 120 л с педалью (cross)', dimensions: '120 л'  },
  { set: '0-tashtandy', category: 'waste-container', name: '240 литров',            fullName: 'Пластиковый контейнер 240 л (cross)',           dimensions: '240 л'  },
  { set: '0-tashtandy', category: 'waste-container', name: '120 литров',            fullName: 'Пластиковый контейнер 120 л (cross)',           dimensions: '120 л'  },
  { set: '0-tashtandy', category: 'waste-container', name: '80 литров',             fullName: 'Пластиковый контейнер 80 л (cross)',            dimensions: '80 л'   },
  { set: '0-tashtandy', category: 'waste-container', name: '50 литров',             fullName: 'Пластиковый контейнер 50 л (cross)',            dimensions: '50 л'   },

  // ══════════════════════════════════════════════════════════════════════════
  // SEIYL — Уличная мебель и освещение
  // ══════════════════════════════════════════════════════════════════════════

  { set: 'seiyl', category: 'street-bench', name: 'Скамейка Model A', fullName: 'Уличная скамейка SEIYL Model A' },
  { set: 'seiyl', category: 'street-bench', name: 'Скамейка Model B', fullName: 'Уличная скамейка SEIYL Model B' },
  { set: 'seiyl', category: 'street-bench', name: 'Скамейка Model C', fullName: 'Уличная скамейка SEIYL Model C' },

  { set: 'seiyl', category: 'street-light', name: 'Светильник Model A', fullName: 'Уличный светильник SEIYL Model A' },
  { set: 'seiyl', category: 'street-light', name: 'Светильник Model B', fullName: 'Уличный светильник SEIYL Model B' },
  { set: 'seiyl', category: 'street-light', name: 'Светильник Model C', fullName: 'Уличный светильник SEIYL Model C' },

  // ══════════════════════════════════════════════════════════════════════════
  // ELECTRO BOX — Электрощиты
  // ══════════════════════════════════════════════════════════════════════════

  // ── ЩРн — Щит распределительный наружный IP31 ─────────────────────────
  { set: 'electro-box', category: 'electric-panel-outdoor', name: 'ЩР IP31 30х22х12', fullName: 'Щит распределительный наружный ЩР IP31 30х22х12', dimensions: '300x220x120 мм' },
  { set: 'electro-box', category: 'electric-panel-outdoor', name: 'ЩР IP31 30х30х15', fullName: 'Щит распределительный наружный ЩР IP31 30х30х15', dimensions: '300x300x150 мм' },
  { set: 'electro-box', category: 'electric-panel-outdoor', name: 'ЩР IP31 35х35х15', fullName: 'Щит распределительный наружный ЩР IP31 35х35х15', dimensions: '350x350x150 мм' },
  { set: 'electro-box', category: 'electric-panel-outdoor', name: 'ЩР IP31 40х30х15', fullName: 'Щит распределительный наружный ЩР IP31 40х30х15', dimensions: '400x300x150 мм' },
  { set: 'electro-box', category: 'electric-panel-outdoor', name: 'ЩР IP31 40х30х155', fullName: 'Щит распределительный наружный ЩР IP31 40х30х155', dimensions: '400x300x155 мм' },
  { set: 'electro-box', category: 'electric-panel-outdoor', name: 'ЩР IP31 40х40х15', fullName: 'Щит распределительный наружный ЩР IP31 40х40х15', dimensions: '400x400x150 мм' },
  { set: 'electro-box', category: 'electric-panel-outdoor', name: 'ЩР IP31 43х43х15', fullName: 'Щит распределительный наружный ЩР IP31 43х43х15', dimensions: '430x430x150 мм' },
  { set: 'electro-box', category: 'electric-panel-outdoor', name: 'ЩР IP31 50х30х15', fullName: 'Щит распределительный наружный ЩР IP31 50х30х15', dimensions: '500x300x150 мм' },
  { set: 'electro-box', category: 'electric-panel-outdoor', name: 'ЩР IP31 50х40х15', fullName: 'Щит распределительный наружный ЩР IP31 50х40х15', dimensions: '500x400x150 мм' },
  { set: 'electro-box', category: 'electric-panel-outdoor', name: 'ЩР IP31 50х40х20', fullName: 'Щит распределительный наружный ЩР IP31 50х40х20', dimensions: '500x400x200 мм' },
  { set: 'electro-box', category: 'electric-panel-outdoor', name: 'ЩР IP31 60х40х15', fullName: 'Щит распределительный наружный ЩР IP31 60х40х15', dimensions: '600x400x150 мм' },
  { set: 'electro-box', category: 'electric-panel-outdoor', name: 'ЩР IP31 60х40х20', fullName: 'Щит распределительный наружный ЩР IP31 60х40х20', dimensions: '600x400x200 мм' },
  { set: 'electro-box', category: 'electric-panel-outdoor', name: 'ЩР IP31 65х50х20', fullName: 'Щит распределительный наружный ЩР IP31 65х50х20', dimensions: '650x500x200 мм' },
  { set: 'electro-box', category: 'electric-panel-outdoor', name: 'ЩР IP31 80х60х20', fullName: 'Щит распределительный наружный ЩР IP31 80х60х20', dimensions: '800x600x200 мм' },

  // ── ЩМП — Щит с монтажной панелью IP31 ───────────────────────────────
  { set: 'electro-box', category: 'electric-panel-mount', name: 'ЩМП IP31 50х40х20', fullName: 'Щит с монтажной панелью ЩМП IP31 50х40х20', dimensions: '500x400x200 мм' },
  { set: 'electro-box', category: 'electric-panel-mount', name: 'ЩМП IP31 60х40х20', fullName: 'Щит с монтажной панелью ЩМП IP31 60х40х20', dimensions: '600x400x200 мм' },

  // ── ЩГР — Щит газовый регулирующий ───────────────────────────────────
  { set: 'electro-box', category: 'electric-panel-gas', name: 'ЩГР Вертикальный 240х300х220', fullName: 'Щит газовый регулирующий ЩГР Вертикальный', dimensions: '240x300x220 мм' },
  { set: 'electro-box', category: 'electric-panel-gas', name: 'ЩГР Горизонтальный',           fullName: 'Щит газовый регулирующий ЩГР Горизонтальный' },

  // ── ЩЭ — Щит этажный ──────────────────────────────────────────────────
  { set: 'electro-box', category: 'electric-panel-floor', name: 'ЩЭ 1 дверный',              fullName: 'Щит этажный ЩЭ 1-дверный' },
  { set: 'electro-box', category: 'electric-panel-floor', name: 'ЩЭ 2х дверный',             fullName: 'Щит этажный ЩЭ 2-дверный' },
  { set: 'electro-box', category: 'electric-panel-floor', name: 'ЩЭ 3х дверный',             fullName: 'Щит этажный ЩЭ 3-дверный' },
  { set: 'electro-box', category: 'electric-panel-floor', name: 'ЩЭ 2х дверный 900х900х150', fullName: 'Щит этажный ЩЭ 2-дверный 900х900х150 (окошки инд.)', dimensions: '900x900x150 мм' },
  { set: 'electro-box', category: 'electric-panel-floor', name: 'ЩЭ 3х дверный 900х900х150', fullName: 'Щит этажный ЩЭ 3-дверный 900х900х150 (окошки инд.)', dimensions: '900x900x150 мм' },
  { set: 'electro-box', category: 'electric-panel-floor', name: 'ЩЭ 2х дверный 1200х900х150', fullName: 'Щит этажный ЩЭ 2-дверный 1200х900х150 (окошки инд.)', dimensions: '1200x900x150 мм' },
  { set: 'electro-box', category: 'electric-panel-floor', name: 'ЩЭ 3х дверный 1200х900х150', fullName: 'Щит этажный ЩЭ 3-дверный 1200х900х150 (окошки инд.)', dimensions: '1200x900x150 мм' },

  // ── ЩС — Щит сантехнический ───────────────────────────────────────────
  { set: 'electro-box', category: 'electric-panel-plumbing', name: 'ЩС 1 дверный', fullName: 'Щит сантехнический ЩС 1-дверный (разм. инд.)' },
  { set: 'electro-box', category: 'electric-panel-plumbing', name: 'ЩС 2 дверный', fullName: 'Щит сантехнический ЩС 2-дверный (разм. инд.)' },

  // ══════════════════════════════════════════════════════════════════════════
  // BEKEM FASAD — Фасадные аксессуары для кондиционеров
  // ══════════════════════════════════════════════════════════════════════════

  { set: 'bekem-fasad', category: 'ac-basket', name: 'Begimay',   fullName: 'Корзина для кондиционера Begimay (закруглённый угол)' },
  { set: 'bekem-fasad', category: 'ac-basket', name: 'Beksultan', fullName: 'Корзина для кондиционера Beksultan (прямоугольный угол)' },

  { set: 'bekem-fasad', category: 'ac-mount', name: 'Melis PRO', fullName: 'Кронштейн для кондиционера Melis PRO' },
  { set: 'bekem-fasad', category: 'ac-mount', name: 'Mini 9',    fullName: 'Кронштейн для кондиционера Mini 9' },
  { set: 'bekem-fasad', category: 'ac-mount', name: 'Middle 12', fullName: 'Кронштейн для кондиционера Middle 12' },
  { set: 'bekem-fasad', category: 'ac-mount', name: 'Max 18',    fullName: 'Кронштейн для кондиционера Max 18' },

  // ══════════════════════════════════════════════════════════════════════════
  // UZAK KOLDON — Тумбы и шкафы
  // ══════════════════════════════════════════════════════════════════════════

  { set: 'uzak-koldon', category: 'storage-tumba', name: 'Aichurok T 3', fullName: 'Тумба AICHUROK T 3' },
  { set: 'uzak-koldon', category: 'storage-tumba', name: 'Aichurok T 4', fullName: 'Тумба AICHUROK T 4' },

  { set: 'uzak-koldon', category: 'storage-cabinet', name: 'Aichurok GO 2', fullName: 'Шкаф AICHUROK GO 2 (Glass Office)' },
  { set: 'uzak-koldon', category: 'storage-cabinet', name: 'Aichurok MO 2', fullName: 'Шкаф AICHUROK МO 2 (Metall Office)' },
  { set: 'uzak-koldon', category: 'storage-cabinet', name: 'Aichurok MR 3', fullName: 'Шкаф AICHUROK МR 3 (Metall Razdevalka)' },
  { set: 'uzak-koldon', category: 'storage-cabinet', name: 'Aichurok MR 4', fullName: 'Шкаф AICHUROK МR 4 (Metall Razdevalka)' },
  { set: 'uzak-koldon', category: 'storage-cabinet', name: 'Aichurok MR 6', fullName: 'Шкаф AICHUROK МR 6 (Metall Razdevalka)' },

  // ══════════════════════════════════════════════════════════════════════════
  // BILIM KELECHEK — Школьная мебель
  // ══════════════════════════════════════════════════════════════════════════

  { set: 'bilim-kelechek', category: 'school-desk', name: 'Парта S2',   fullName: 'Школьная парта S2 (стандартная)' },
  { set: 'bilim-kelechek', category: 'school-desk', name: 'Парта S2R',  fullName: 'Школьная парта S2R (стандарт регулируемый)' },
  { set: 'bilim-kelechek', category: 'school-desk', name: 'Парта S1',   fullName: 'Школьная парта S1' },
  { set: 'bilim-kelechek', category: 'school-desk', name: 'Стол I 1 R', fullName: 'Интерактивный стол I 1 R (регулируемый)' },
  { set: 'bilim-kelechek', category: 'school-desk', name: 'Стол I 2',   fullName: 'Интерактивный стол I 2' },
  { set: 'bilim-kelechek', category: 'school-desk', name: 'Стол E 2 R', fullName: 'Электрорегулируемый стол E 2 R' },
  { set: 'bilim-kelechek', category: 'school-desk', name: 'Столы G 6',  fullName: 'Групповые столы G 6 (комплект 6 столов)' },

  // ══════════════════════════════════════════════════════════════════════════
  // ONOI SAKTA — Промышленные стеллажи
  // ══════════════════════════════════════════════════════════════════════════

  { set: 'onoi-sakta', category: 'industrial-shelf', name: 'Adik Storage Light',  fullName: 'Промышленный стеллаж ADIK STORAGE LIGHT',  color: 'black' },
  { set: 'onoi-sakta', category: 'industrial-shelf', name: 'Adik Storage Medium', fullName: 'Промышленный стеллаж ADIK STORAGE MEDIUM', color: 'white' },
];

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Подключено к MongoDB Atlas\n');

  // Удаляем существующие SHAAR товары чтобы избежать дублей
  const deleted = await Product.deleteMany({ brand: 'matkasym-shaar' });
  if (deleted.deletedCount > 0) {
    console.log(`🗑  Удалено старых SHAAR товаров: ${deleted.deletedCount}`);
  }

  const docs = products.map(p => ({ ...BASE, ...p }));
  const result = await Product.insertMany(docs);
  console.log(`✅ Добавлено SHAAR товаров: ${result.length}`);

  // Статистика по сетам
  const bySets = {};
  products.forEach(p => { bySets[p.set] = (bySets[p.set] || 0) + 1; });
  console.log('\n📦 По сетам:');
  Object.entries(bySets).forEach(([s, n]) => console.log(`   ${s}: ${n}`));

  await mongoose.disconnect();
  console.log('\n✅ Готово');
}

main().catch(err => { console.error(err); process.exit(1); });
