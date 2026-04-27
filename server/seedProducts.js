/**
 * Seed script — добавляет все товары из каталога MATKASYM HOME
 * Запуск: node seedProducts.js
 * ВНИМАНИЕ: удаляет существующие товары бренда matkasym-home перед вставкой!
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Product  = require('./models/Product');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/matkasym';

// ─── Helpers ────────────────────────────────────────────────────────────────

const clothes_dryer = (konstruktsiya, kol_strun, tsvet, nagruzka) => [
  { key: 'Конструкция',    value: konstruktsiya || '' },
  { key: 'Цвет',           value: tsvet         || '' },
  { key: 'Макс. нагрузка', value: nagruzka      || '' },
  { key: 'Кол-во струн',   value: kol_strun     || '' },
];

const ironing_board = (konstruktsiya, tsvet, ves) => [
  { key: 'Конструкция', value: konstruktsiya || '' },
  { key: 'Цвет',        value: tsvet         || '' },
  { key: 'Вес',         value: ves           || '' },
];

const laundry_basket = (obem, tsvet, nagruzka) => [
  { key: 'Объём',           value: obem     || '' },
  { key: 'Цвет',            value: tsvet    || '' },
  { key: 'Макс. нагрузка',  value: nagruzka || '' },
];

const wardrobe_rack = (kol_polok, tsvet, nagruzka) => [
  { key: 'Кол-во полок',    value: kol_polok || '' },
  { key: 'Цвет',            value: tsvet     || '' },
  { key: 'Макс. нагрузка',  value: nagruzka  || '' },
];

const wall_hanger = (kol_kryuchkov, tsvet, nagruzka) => [
  { key: 'Кол-во крючков',  value: kol_kryuchkov || '' },
  { key: 'Цвет',            value: tsvet         || '' },
  { key: 'Макс. нагрузка',  value: nagruzka      || '' },
];

const floor_hanger = (kol_kryuchkov, tsvet, nagruzka, ves) => [
  { key: 'Кол-во крючков',  value: kol_kryuchkov || '' },
  { key: 'Цвет',            value: tsvet         || '' },
  { key: 'Макс. нагрузка',  value: nagruzka      || '' },
  { key: 'Вес',             value: ves           || '' },
];

const shoe_rack = (konstruktsiya, tsvet, vmestimost) => [
  { key: 'Конструкция', value: konstruktsiya || '' },
  { key: 'Цвет',        value: tsvet         || '' },
  { key: 'Вместимость', value: vmestimost    || '' },
];

const shoe_bench = (kol_polok, tsvet, nagruzka) => [
  { key: 'Кол-во полок',    value: kol_polok || '' },
  { key: 'Цвет',            value: tsvet     || '' },
  { key: 'Макс. нагрузка',  value: nagruzka  || '' },
];

const shelf_toilet = (konstruktsiya, tsvet, kol_polok) => [
  { key: 'Конструкция',  value: konstruktsiya || '' },
  { key: 'Цвет',         value: tsvet         || '' },
  { key: 'Кол-во полок', value: kol_polok     || '' },
];

const shelf_corner = (kol_polok, tsvet, nagruzka) => [
  { key: 'Кол-во полок',    value: kol_polok || '' },
  { key: 'Цвет',            value: tsvet     || '' },
  { key: 'Макс. нагрузка',  value: nagruzka  || '' },
];

const shelf_flowers = (kol_polok, tsvet, nagruzka, konstruktsiya) => [
  { key: 'Кол-во полок',    value: kol_polok     || '' },
  { key: 'Цвет',            value: tsvet         || '' },
  { key: 'Макс. нагрузка',  value: nagruzka      || '' },
  { key: 'Конструкция',     value: konstruktsiya || '' },
];

const mirror_floor = (tsvet_ramy, ves, uderzh_ves) => [
  { key: 'Цвет рамы',        value: tsvet_ramy  || '' },
  { key: 'Вес',              value: ves         || '' },
  { key: 'Удерживаемый вес', value: uderzh_ves  || '' },
];

const bbq_grill = (konstruktsiya, material, kol_pazov) => [
  { key: 'Конструкция',      value: konstruktsiya || '' },
  { key: 'Материал корпуса', value: material      || '' },
  { key: 'Кол-во пазов',    value: kol_pazov     || '' },
];

const antenna = (sopr, diapazon, razem, kabel) => [
  { key: 'Сопротивление',   value: sopr     || '' },
  { key: 'Диапазон частот', value: diapazon || '' },
  { key: 'Разъём',          value: razem    || '' },
  { key: 'Длина кабеля',    value: kabel    || '' },
];

const tv_mount = (konstruktsiya, diagonal, nagruzka) => [
  { key: 'Конструкция',    value: konstruktsiya || '' },
  { key: 'Макс. диагональ', value: diagonal    || '' },
  { key: 'Макс. нагрузка', value: nagruzka     || '' },
];

// ─── Products ───────────────────────────────────────────────────────────────

const PRODUCTS = [

  // ═══ Сушилки для белья ═══════════════════════════════════════════════════

  { name: 'Comfort',        fullName: 'MATKASYM HOME — Comfort (чёрный)',
    category: 'clothes-dryer', color: 'black', dimensions: '134x55x108 см',
    images: ['https://i.ibb.co/fYG5GKM4/Comfort.png'],
    specs: clothes_dryer('складная', '', 'чёрный', '10'),
  },
  { name: 'Comfort',        fullName: 'MATKASYM HOME — Comfort (серый)',
    category: 'clothes-dryer', color: 'grey', dimensions: '134x55x108 см',
    images: ['https://i.ibb.co/mFDrzSjq/736b869f-8a2d-483c-ad3d-e6ca41d6c4e5.jpg'],
    specs: clothes_dryer('складная', '', 'серый', '11'),
  },
  { name: 'Avangard',       fullName: 'MATKASYM HOME — Avangard (чёрный)',
    category: 'clothes-dryer', color: 'black', dimensions: '134x55x108 см',
    images: ['https://i.ibb.co/847Zwz40/Avangard.png'],
    specs: clothes_dryer('', '17', 'чёрный', '20'),
  },
  { name: 'Sakura',         fullName: 'MATKASYM HOME — Sakura (белый)',
    category: 'clothes-dryer', color: 'white', dimensions: '134x55x108 см',
    images: ['https://i.ibb.co/DTP7mVH/sakura.png'],
    specs: clothes_dryer('', '17', 'белый', '15'),
  },
  { name: 'Sakura',         fullName: 'MATKASYM HOME — Sakura (розовый)',
    category: 'clothes-dryer', color: 'pink', dimensions: '134x55x108 см',
    images: ['https://i.ibb.co/KcLG2D3X/a8f519a4-b394-4af7-9be5-7dee5eb4eb15.jpg'],
    specs: clothes_dryer('', '17', 'розовый', '15'),
  },
  { name: 'Keremet',        fullName: 'MATKASYM HOME — Keremet (белый)',
    category: 'clothes-dryer', color: 'white', dimensions: '76x73x140 см',
    images: ['https://i.ibb.co/XxnyPtpH/keremet.png'],
    specs: clothes_dryer('складная', '', 'белый', '20'),
  },
  { name: 'Keremet',        fullName: 'MATKASYM HOME — Keremet (чёрный)',
    category: 'clothes-dryer', color: 'black', dimensions: '76x73x140 см',
    images: ['https://i.ibb.co/YBx2bfZh/96482f76-386f-4784-b09a-067204572586.jpg'],
    specs: clothes_dryer('складная', '', 'чёрный', '21'),
  },

  // ═══ Гладильные доски ════════════════════════════════════════════════════

  { name: 'Eco',            fullName: 'MATKASYM HOME — Eco (гладильная доска)',
    category: 'ironing-board', color: 'white', dimensions: '104х34х78 см',
    images: ['https://i.ibb.co/mC4mV9yD/ECO.png'],
    specs: ironing_board('складная', 'белый', '4'),
  },
  { name: 'Sakura',         fullName: 'MATKASYM HOME — Sakura (гладильная доска)',
    category: 'ironing-board', dimensions: '122х36х86 см',
    images: ['https://i.ibb.co/39F3hyL7/Sakura.png'],
    specs: ironing_board('складная', 'белый, чёрный', '5'),
  },
  { name: 'Sanira E',       fullName: 'MATKASYM HOME — Sanira E (гладильная доска)',
    category: 'ironing-board',
    images: ['https://i.ibb.co/JwWznyVS/image.png'],
    specs: ironing_board('складная', '', ''),
  },
  { name: 'Sanira A',       fullName: 'MATKASYM HOME — Sanira A (гладильная доска)',
    category: 'ironing-board',
    images: ['https://i.ibb.co/PsPKpM9k/image.png'],
    specs: ironing_board('складная', '', ''),
  },
  { name: 'Sanira M',       fullName: 'MATKASYM HOME — Sanira M (гладильная доска)',
    category: 'ironing-board',
    images: ['https://i.ibb.co/C5gLbVv7/image.png'],
    specs: ironing_board('складная', '', ''),
  },
  { name: 'Sanira S',       fullName: 'MATKASYM HOME — Sanira S (гладильная доска)',
    category: 'ironing-board',
    images: ['https://i.ibb.co/LhdR3g4j/image.png'],
    specs: ironing_board('складная', '', ''),
  },
  { name: 'Sanira X',       fullName: 'MATKASYM HOME — Sanira X (гладильная доска)',
    category: 'ironing-board',
    images: ['https://i.ibb.co/mrr4cDfM/image.png'],
    specs: ironing_board('складная', '', ''),
  },

  // ═══ Гладильные доски с удлинителем ═════════════════════════════════════

  { name: 'Sakura',         fullName: 'MATKASYM HOME — Sakura (гладильная доска с удлинителем)',
    category: 'ironing-board-ext', dimensions: '122х36х86 см',
    images: ['https://i.ibb.co/N2c8rNwP/Sakura.png'],
    specs: ironing_board('складная', 'белый, чёрный', '5'),
  },
  { name: 'Eco',            fullName: 'MATKASYM HOME — Eco (гладильная доска с удлинителем)',
    category: 'ironing-board-ext', color: 'white', dimensions: '104х34х78 см',
    images: ['https://i.ibb.co/4nxqj2dP/ECO.png'],
    specs: ironing_board('складная', 'белый', '4'),
  },

  // ═══ Корзины для белья ═══════════════════════════════════════════════════

  { name: 'Washday',        fullName: 'MATKASYM HOME — Washday (корзина для белья)',
    category: 'laundry-basket', color: 'white', dimensions: '60х44х54 см',
    images: ['https://i.ibb.co/NdsJ0232/washday.png'],
    specs: laundry_basket('80', 'белый', '5'),
  },

  // ═══ Гардеробные вешалки ═════════════════════════════════════════════════

  { name: 'Enigma',         fullName: 'MATKASYM HOME — Enigma (чёрный)',
    category: 'wardrobe-rack', color: 'black', dimensions: '115x45x170 см',
    images: ['https://i.ibb.co/4wV5pQWc/Enigma.png'],
    specs: wardrobe_rack('0', 'чёрный', '25'),
  },
  { name: 'Enigma',         fullName: 'MATKASYM HOME — Enigma (белый)',
    category: 'wardrobe-rack', color: 'white', dimensions: '115x45x170 см',
    images: ['https://i.ibb.co/xKrDYBfG/Enigma.png'],
    specs: wardrobe_rack('0', 'белый', '25'),
  },
  { name: 'Infinity',       fullName: 'MATKASYM HOME — Infinity (чёрный)',
    category: 'wardrobe-rack', color: 'black', dimensions: '115x44x170 см',
    images: ['https://i.ibb.co/sd6Kg3fz/Infitity.png'],
    specs: wardrobe_rack('1', 'чёрный', '40'),
  },
  { name: 'Infinity',       fullName: 'MATKASYM HOME — Infinity (белый)',
    category: 'wardrobe-rack', color: 'white', dimensions: '115x44x170 см',
    images: ['https://i.ibb.co/Rnx0Tgw/Infinyti.png'],
    specs: wardrobe_rack('1', 'белый', '40'),
  },
  { name: 'Fenix',          fullName: 'MATKASYM HOME — Fenix (чёрный)',
    category: 'wardrobe-rack', color: 'black', dimensions: '115x44x179 см',
    images: ['https://i.ibb.co/B2bCSKds/Fenix.png'],
    specs: wardrobe_rack('2', 'чёрный', '40'),
  },
  { name: 'Fenix',          fullName: 'MATKASYM HOME — Fenix (белый)',
    category: 'wardrobe-rack', color: 'white', dimensions: '115x44x179 см',
    images: ['https://i.ibb.co/b5rWXmf4/Fenix.png'],
    specs: wardrobe_rack('2', 'белый', '40'),
  },

  // ═══ Антенны наружные ════════════════════════════════════════════════════

  { name: 'Sanarip 10',     fullName: 'MATKASYM HOME — Sanarip 10 (антенна наружная)',
    category: 'antenna-outdoor',
    images: ['https://i.ibb.co/vCfXVZ4K/sanarip.png'],
    specs: antenna('75', '470-790 МГц', 'F-connector', '10 ярд'),
  },
  { name: 'Sanarip 15',     fullName: 'MATKASYM HOME — Sanarip 15 (антенна наружная)',
    category: 'antenna-outdoor',
    images: ['https://i.ibb.co/vCfXVZ4K/sanarip.png'],
    specs: antenna('75', '470-790 МГц', 'F-connector', '15 ярд'),
  },
  { name: 'Sanarip 20',     fullName: 'MATKASYM HOME — Sanarip 20 (антенна наружная)',
    category: 'antenna-outdoor',
    images: ['https://i.ibb.co/vCfXVZ4K/sanarip.png'],
    specs: antenna('75', '470-790 МГц', 'F-connector', '20 ярд'),
  },
  { name: 'Smart',          fullName: 'MATKASYM HOME — Smart (антенна наружная)',
    category: 'antenna-outdoor',
    images: ['https://i.ibb.co/ZRn1z5kn/smart.png'],
    specs: antenna('75', '470-790 МГц', 'F-connector', '10 ярд'),
  },
  { name: 'Smart с усилителем', fullName: 'MATKASYM HOME — Smart с усилителем (антенна наружная)',
    category: 'antenna-outdoor',
    images: ['https://i.ibb.co/ZRn1z5kn/smart.png'],
    specs: antenna('75', '470-790 МГц', 'F-connector', '10, 15, 20 ярд'),
  },

  // ═══ Антенны комнатные ═══════════════════════════════════════════════════

  { name: 'Tereze',         fullName: 'MATKASYM HOME — Tereze (антенна комнатная)',
    category: 'antenna-indoor',
    images: ['https://i.ibb.co/LDxcf8w8/tereze.png'],
    specs: antenna('75', '470-790 МГц', 'F-connector', '5 ярд'),
  },
  { name: 'Compact',        fullName: 'MATKASYM HOME — Compact (антенна комнатная)',
    category: 'antenna-indoor',
    images: ['https://i.ibb.co/mVRPkD3R/compact.png'],
    specs: antenna('76', '470-790 МГц', 'F-connector', '5 ярд'),
  },

  // ═══ Кронштейны для TV ═══════════════════════════════════════════════════

  { name: 'Romi 1',         fullName: 'MATKASYM HOME — Romi 1 15-47 (кронштейн)',
    sku: 'ROMI-1-15-47', category: 'tv-mount', dimensions: '24х22х2 см',
    images: ['https://i.ibb.co/0y96XvfQ/Romi-1-15-47.png'],
    specs: tv_mount('разборно-сборная', '47"', '20'),
  },
  { name: 'Romi 2',         fullName: 'MATKASYM HOME — Romi 2 26-63 (кронштейн)',
    sku: 'ROMI-2-26-63', category: 'tv-mount', dimensions: '47х43х2 см',
    images: ['https://i.ibb.co/ZprJM4YS/Romi-2-26-63.png'],
    specs: tv_mount('разборно-сборная', '63"', '50'),
  },

  // ═══ Над-унитазные полки ═════════════════════════════════════════════════

  { name: 'Taitemir',       fullName: 'MATKASYM HOME — Taitemir (над-унитазная полка)',
    category: 'shelf-toilet', dimensions: '47x26x161 см',
    images: ['https://i.ibb.co/CcHDWY3/taitemir.png'],
    specs: shelf_toilet('разборно-сборная', 'белый, чёрный', '3'),
  },

  // ═══ Над-стиральные полки ════════════════════════════════════════════════

  { name: 'Asyl',           fullName: 'MATKASYM HOME — Asyl (над-стиральная полка)',
    category: 'shelf-washer', dimensions: '67x26x161 см',
    images: ['https://i.ibb.co/wrwBtXpX/Asyl.png'],
    specs: shelf_toilet('разборно-сборная', 'белый, чёрный', '3'),
  },

  // ═══ Угловые полки ═══════════════════════════════════════════════════════

  { name: 'Orion',          fullName: 'MATKASYM HOME — Orion (угловая полка)',
    category: 'shelf-corner', dimensions: '26х25х57 см',
    images: ['https://i.ibb.co/1YJbyvGy/orion.png'],
    specs: shelf_corner('3', 'белый, чёрный', '10'),
  },
  { name: 'Aria',           fullName: 'MATKASYM HOME — Aria (угловая полка)',
    category: 'shelf-corner', dimensions: '24х24х57 см',
    images: ['https://i.ibb.co/zWWFYjDb/aria.png'],
    specs: shelf_corner('3', 'белый, чёрный', '10'),
  },

  // ═══ Обувные полки ═══════════════════════════════════════════════════════

  { name: 'Lion 3',         fullName: 'MATKASYM HOME — Lion 3 (чёрный)',
    category: 'shoe-rack', color: 'black', dimensions: '67х28х61 см',
    images: ['https://i.ibb.co/9H2T08LD/lion3.png'],
    specs: shoe_rack('разборно-сборная', 'чёрный', '9'),
  },
  { name: 'Lion 3',         fullName: 'MATKASYM HOME — Lion 3 (белый)',
    category: 'shoe-rack', color: 'white', dimensions: '67х28х61 см',
    images: ['https://i.ibb.co/Dgm6ZwbM/6fa625fa-1a7f-4995-8d7e-ccecfa02f919.jpg'],
    specs: shoe_rack('разборно-сборная', 'белый', '9'),
  },
  { name: 'Lion 4',         fullName: 'MATKASYM HOME — Lion 4 (чёрный)',
    category: 'shoe-rack', color: 'black', dimensions: '67х28х95 см',
    images: ['https://i.ibb.co/5WhXmKvj/lion4.png'],
    specs: shoe_rack('разборно-сборная', 'чёрный', '12'),
  },
  { name: 'Lion 4',         fullName: 'MATKASYM HOME — Lion 4 (белый)',
    category: 'shoe-rack', color: 'white', dimensions: '67х28х95 см',
    images: ['https://i.ibb.co/HLHSc33b/1f89296d-a0aa-483b-8188-f6c594a7a67d.jpg'],
    specs: shoe_rack('разборно-сборная', 'белый', '12'),
  },
  { name: 'Queen 3',        fullName: 'MATKASYM HOME — Queen 3 (обувная полка)',
    category: 'shoe-rack', dimensions: '76х28х61 см',
    images: ['https://i.ibb.co/zVWLZgTB/queen3.png'],
    specs: shoe_rack('разборно-сборная', 'белый, чёрный', '9'),
  },
  { name: 'Queen 4',        fullName: 'MATKASYM HOME — Queen 4 (обувная полка)',
    category: 'shoe-rack', dimensions: '78х28х95 см',
    images: ['https://i.ibb.co/4RBscXsq/queen4.png'],
    specs: shoe_rack('разборно-сборная', 'белый, чёрный', '12'),
  },

  // ═══ Обувные полки с сидушкой ════════════════════════════════════════════

  { name: 'Oturguch',       fullName: 'MATKASYM HOME — Oturguch (обувная полка с сидушкой)',
    category: 'shoe-bench', color: 'black', dimensions: '78x24x51 см',
    images: ['https://i.ibb.co/S4qdMd7f/oturguch.png'],
    specs: shoe_bench('2', 'чёрный', '100'),
  },

  // ═══ Настенные вешалки ═══════════════════════════════════════════════════

  { name: 'Bosogo 9SW',     fullName: 'MATKASYM HOME — Bosogo 9SW (чёрный)',
    category: 'wall-hanger', color: 'black', dimensions: '69х25х47 см',
    images: ['https://i.ibb.co/nN6G4VDN/bosogo9sw.png'],
    specs: wall_hanger('9', 'чёрный', '40'),
  },
  { name: 'Bosogo 9SW',     fullName: 'MATKASYM HOME — Bosogo 9SW (белый)',
    category: 'wall-hanger', color: 'white', dimensions: '69х25х47 см',
    images: ['https://i.ibb.co/tTBHdmhC/f36b1ca9-8d63-4f6f-b9a5-6c1bc4602c75-1.png'],
    specs: wall_hanger('9', 'белый', '40'),
  },
  { name: 'Bosogo 5SW',     fullName: 'MATKASYM HOME — Bosogo 5SW (чёрный)',
    category: 'wall-hanger', color: 'black', dimensions: '69х28х25 см',
    images: ['https://i.ibb.co/gZM0XYwC/bosogo5sw.png'],
    specs: wall_hanger('5', 'чёрный', '25'),
  },
  { name: 'Bosogo 5SW',     fullName: 'MATKASYM HOME — Bosogo 5SW (белый)',
    category: 'wall-hanger', color: 'white', dimensions: '69х28х25 см',
    images: ['https://i.ibb.co/V043YHxs/7d825347-f11f-4e45-a646-7f011859b37c-1.png'],
    specs: wall_hanger('5', 'белый', '25'),
  },
  { name: 'Temir ilgich 10S', fullName: 'MATKASYM HOME — Temir ilgich 10S (чёрный)',
    category: 'wall-hanger', color: 'black', dimensions: '73х66х24 см',
    images: ['https://i.ibb.co/1fx217Cy/temir-ilgich10s.png'],
    specs: wall_hanger('10', 'чёрный', '40'),
  },
  { name: 'Temir ilgich 10S', fullName: 'MATKASYM HOME — Temir ilgich 10S (белый)',
    category: 'wall-hanger', color: 'white', dimensions: '73х66х24 см',
    images: ['https://i.ibb.co/gM5crs0s/c9410ab7-b6f3-4403-884c-21d3821efcb8-1.png'],
    specs: wall_hanger('10', 'белый', '40'),
  },
  { name: 'Temir ilgich 5S', fullName: 'MATKASYM HOME — Temir ilgich 5S (чёрный)',
    category: 'wall-hanger', color: 'black', dimensions: '56х36х26 см',
    images: ['https://i.ibb.co/39R19rZd/temir-ilgich5s.png'],
    specs: wall_hanger('5', 'чёрный', '25'),
  },
  { name: 'Temir ilgich 5S', fullName: 'MATKASYM HOME — Temir ilgich 5S (белый)',
    category: 'wall-hanger', color: 'white', dimensions: '56х36х26 см',
    images: ['https://i.ibb.co/6cnhWKxQ/5a9acaf2-df0e-4cfd-9ae8-57d6d1bbc8b7-1.png'],
    specs: wall_hanger('5', 'белый', '25'),
  },

  // ═══ Напольные вешалки ═══════════════════════════════════════════════════

  { name: 'Karagay',        fullName: 'MATKASYM HOME — Karagay (напольная вешалка)',
    category: 'floor-hanger', dimensions: '64x64x172 см',
    images: ['https://i.ibb.co/Tq1FzhBF/karagay.png'],
    specs: floor_hanger('9', 'белый, чёрный', '', '2'),
  },
  { name: 'Archa',          fullName: 'MATKASYM HOME — Archa (напольная вешалка)',
    category: 'floor-hanger', color: 'black', dimensions: '52x52x175 см',
    images: ['https://i.ibb.co/3m7b384V/archa.png'],
    specs: floor_hanger('9', 'чёрный', '27', ''),
  },
  { name: 'Novel',          fullName: 'MATKASYM HOME — Novel (напольная вешалка)',
    category: 'floor-hanger', dimensions: '65х65x176 см',
    images: ['https://i.ibb.co/YF6ZxVjx/novel.png'],
    specs: floor_hanger('13', 'белый, чёрный', '', '2.2'),
  },

  // ═══ Полки для цветов ════════════════════════════════════════════════════

  { name: 'Bakcha',         fullName: 'MATKASYM HOME — Bakcha (полка для цветов)',
    category: 'shelf-flowers', color: 'black', dimensions: '39x39x137 см',
    images: ['https://i.ibb.co/zWhpPYRJ/bakcha.png'],
    specs: shelf_flowers('3', 'чёрный', '25', ''),
  },
  { name: 'Bagym',          fullName: 'MATKASYM HOME — Bagym (полка для цветов)',
    category: 'shelf-flowers', color: 'black', dimensions: '43x45x73 см',
    images: ['https://i.ibb.co/G4qGc2Z4/bagym.png'],
    specs: shelf_flowers('3', 'чёрный', '', 'разборно-сборная'),
  },

  // ═══ Напольные зеркала ═══════════════════════════════════════════════════

  { name: 'Zina Diamond',   fullName: 'MATKASYM HOME — Zina Diamond (напольное зеркало)',
    category: 'mirror-floor', color: 'black', dimensions: '64x56x155 см',
    images: ['https://i.ibb.co/DfzH2pwq/Zina.png'],
    specs: mirror_floor('чёрный', '22', '8'),
  },

  // ═══ Мангалы ═════════════════════════════════════════════════════════════

  { name: 'R6',             fullName: 'MATKASYM HOME — R6 (мангал)',
    sku: 'BBQ-R6', category: 'bbq-grill', dimensions: '40x26x40 см',
    images: ['https://i.ibb.co/yvRW0kQ/r6.png'],
    specs: bbq_grill('разборная, складная', 'сталь 0,9 мм', '6'),
  },
  { name: 'R8',             fullName: 'MATKASYM HOME — R8 (мангал)',
    sku: 'BBQ-R8', category: 'bbq-grill', dimensions: '56x28x41 см',
    images: ['https://i.ibb.co/MyHVvw7K/r8.png'],
    specs: bbq_grill('разборная, складная', 'сталь 0,9 мм', '8'),
  },
  { name: 'R10',            fullName: 'MATKASYM HOME — R10 (мангал)',
    sku: 'BBQ-R10', category: 'bbq-grill', dimensions: '69x28x41 см',
    images: ['https://i.ibb.co/TGy8L8S/r10.png'],
    specs: bbq_grill('разборная, складная', 'сталь 0,9 мм', '10'),
  },
];

// ─── Fill defaults ───────────────────────────────────────────────────────────

const withDefaults = (p) => ({
  brand:          'matkasym-home',
  sku:            '',
  set:            '',
  setLevel:       '',
  color:          '',
  dimensions:     '',
  description:    '',
  price:          0,
  oldPrice:       null,
  priceWholesale: 0,
  priceDealer:    0,
  inStock:        true,
  isNew:          false,
  stock:          50,
  images:         [],
  driveImages:    [],
  specs:          [],
  tags:           [],
  ...p,
});

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const deleted = await Product.deleteMany({ brand: 'matkasym-home' });
  console.log(`Deleted ${deleted.deletedCount} existing HOME products`);

  const docs = PRODUCTS.map(withDefaults);
  const inserted = await Product.insertMany(docs);
  console.log(`✓ Inserted ${inserted.length} products`);

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
