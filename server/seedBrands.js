require('dotenv').config();
const mongoose = require('mongoose');
const Brand    = require('./models/Brand');

const BRANDS = [
  {
    key: 'matkasym-home',
    label: 'MATKASYM HOME',
    tagline: 'Дом в порядке — жизнь в радость',
    desc: 'Всё для ухода за домом и одеждой. Наши продукты созданы так, чтобы ежедневные задачи решались легко и быстро.',
    color: '#7d96a0',
    order: 1,
    sets: [
      { key: 'taza-kiym',   label: 'TAZA KIYM',   labelRu: 'Чистая одежда',     desc: 'Комплект для стирки и ухода за одеждой: сушилка, корзина, гладильная доска и гардеробная вешалка.', levels: ['Standard', 'VIP', 'Premium'], order: 1 },
      { key: 'kosh-kelniz', label: 'KOSH KELNIZ', labelRu: 'Добро пожаловать',  desc: 'Гардеробные системы и системы хранения для прихожей и спальни.', levels: ['Lion', 'Queen', 'Novel', 'Archa', 'Bosogo'], order: 2 },
      { key: 'achyk-asman', label: 'ACHYK ASMAN', labelRu: 'Открытое небо',     desc: 'Уличные сушилки и системы хранения для балкона и двора.', levels: ['R6', 'R8', 'R10'], order: 3 },
      { key: 'den-sooluk',  label: 'DEN SOOLUK',  labelRu: 'Здоровье',          desc: 'Специализированные изделия для здорового образа жизни.', levels: ['Asyl', 'Taitemir', 'Aria'], order: 4 },
    ],
  },
  {
    key: 'matkasym-shaar',
    label: 'MATKASYM SHAAR',
    tagline: 'Чистый город — гордый народ',
    desc: 'Урны, уличная мебель и элементы городского благоустройства. Производим для акиматов, ЖК и бизнеса.',
    color: '#4d4d4d',
    order: 2,
    sets: [
      { key: 'otashtandy',    label: 'O TASHTANDY',   labelRu: 'Урны',                 desc: 'Линейка уличных урн разных объёмов: G2, G3, G4, GW1, GW2, GW4, Karakol, Novotel, Tegerek.', levels: ['G2', 'G3', 'G4', 'GW1', 'GW2', 'GW4'], order: 1 },
      { key: 'tazalyk',       label: 'TAZALYK',       labelRu: 'Чистота',              desc: 'Экологические мусорные станции и контейнеры для раздельного сбора.', levels: ['Eco Mayak'], order: 2 },
      { key: 'kelecek-bilim', label: 'KELECEK BILIM', labelRu: 'Будущее. Знание.',     desc: 'Оснащение для учебных учреждений и детских площадок.', levels: [], order: 3 },
      { key: 'onoy-sakta',    label: 'ONOY SAKTA',    labelRu: 'Удобное хранение',     desc: 'Уличные системы хранения и велопарковки.', levels: [], order: 4 },
      { key: 'bekem-fasad',   label: 'BEKEM FASAD',   labelRu: 'Прочный фасад',        desc: 'Фасадные и архитектурные элементы для зданий.', levels: [], order: 5 },
      { key: 'mazza-seyil',   label: 'MAZZA SEYIL',   labelRu: 'Прогулка с удовольствием', desc: 'Скамейки, навесы и малые архитектурные формы для прогулочных зон.', levels: [], order: 6 },
    ],
  },
];

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await Brand.deleteMany({});
  await Brand.insertMany(BRANDS);
  console.log('✅ Бренды загружены:', BRANDS.map(b => b.key).join(', '));
  await mongoose.disconnect();
})();
