/**
 * Для каждой категории — список характеристик (полей specs).
 * key   — внутренний ключ
 * label — отображаемое название
 * unit  — единица измерения (подсказка в поле ввода)
 * type  — 'text' | 'number' | 'select'
 * options — только для type: 'select'
 */

export const CATEGORIES = [
  // ── Уход за одеждой ──────────────────────────
  { value: 'clothes-dryer',       label: 'Сушилка для белья' },
  { value: 'ironing-board',       label: 'Гладильная доска' },
  { value: 'ironing-board-ext',   label: 'Гладильная доска с удлинителем' },
  { value: 'laundry-basket',      label: 'Корзина для белья' },
  // ── Хранение и организация ───────────────────
  { value: 'suit-hanger',         label: 'Костюмная вешалка' },
  { value: 'wardrobe-rack',       label: 'Гардеробная вешалка' },
  { value: 'wall-hanger',         label: 'Настенная вешалка' },
  { value: 'floor-hanger',        label: 'Напольная вешалка' },
  { value: 'shoe-rack',           label: 'Обувная полка' },
  { value: 'shoe-bench',          label: 'Обувная полка с сидушкой' },
  { value: 'shelf-toilet',        label: 'Над-унитазная полка' },
  { value: 'shelf-washer',        label: 'Над-стиральная полка' },
  { value: 'shelf-corner',        label: 'Угловая полка' },
  { value: 'shelf-flowers',       label: 'Полка для цветов' },
  // ── Дом и декор ──────────────────────────────
  { value: 'mirror-floor',        label: 'Напольное зеркало' },
  { value: 'bbq-grill',           label: 'Мангал' },
  // ── Электроника ──────────────────────────────
  { value: 'antenna-outdoor',     label: 'Антенна наружная' },
  { value: 'antenna-indoor',      label: 'Антенна комнатная' },
  { value: 'tv-mount',            label: 'Кронштейн для TV' },
  // ── Прочее ───────────────────────────────────
  { value: 'other',               label: 'Другое' },
];

export const CATEGORY_SPECS = {
  'clothes-dryer': [
    { key: 'Конструкция',      unit: 'складная / стационарная', type: 'select', options: ['складная', 'стационарная'] },
    { key: 'Цвет',             unit: '',       type: 'text' },
    { key: 'Макс. нагрузка',   unit: 'кг',     type: 'number' },
    { key: 'Кол-во струн',     unit: 'шт',     type: 'number' },
  ],
  'ironing-board': [
    { key: 'Конструкция',      unit: 'складная / стационарная', type: 'select', options: ['складная', 'стационарная'] },
    { key: 'Цвет',             unit: '',       type: 'text' },
    { key: 'Вес',              unit: 'кг',     type: 'number' },
  ],
  'ironing-board-ext': [
    { key: 'Конструкция',      unit: 'складная / стационарная', type: 'select', options: ['складная', 'стационарная'] },
    { key: 'Цвет',             unit: '',       type: 'text' },
    { key: 'Вес',              unit: 'кг',     type: 'number' },
  ],
  'laundry-basket': [
    { key: 'Объём',            unit: 'л',      type: 'number' },
    { key: 'Цвет',             unit: '',       type: 'text' },
    { key: 'Макс. нагрузка',   unit: 'кг',     type: 'number' },
  ],
  'suit-hanger': [
    { key: 'Макс. нагрузка',   unit: 'кг',     type: 'number' },
    { key: 'Габариты ДxШxВ',   unit: 'см',     type: 'text' },
    { key: 'Цвет',             unit: '',       type: 'text' },
    { key: 'Конструкция',      unit: '',       type: 'select', options: ['разборно-сборная', 'цельная', 'складная'] },
  ],
  'wardrobe-rack': [
    { key: 'Кол-во полок',     unit: 'шт',     type: 'number' },
    { key: 'Цвет',             unit: '',       type: 'text' },
    { key: 'Макс. нагрузка',   unit: 'кг',     type: 'number' },
  ],
  'wall-hanger': [
    { key: 'Кол-во крючков',   unit: 'шт',     type: 'number' },
    { key: 'Цвет',             unit: '',       type: 'text' },
    { key: 'Макс. нагрузка',   unit: 'кг',     type: 'number' },
  ],
  'floor-hanger': [
    { key: 'Кол-во крючков',   unit: 'шт',     type: 'number' },
    { key: 'Цвет',             unit: '',       type: 'text' },
    { key: 'Макс. нагрузка',   unit: 'кг',     type: 'number' },
    { key: 'Вес',              unit: 'кг',     type: 'number' },
  ],
  'shoe-rack': [
    { key: 'Конструкция',      unit: '',       type: 'select', options: ['разборно-сборная', 'цельная'] },
    { key: 'Цвет',             unit: '',       type: 'text' },
    { key: 'Вместимость',      unit: 'пар',    type: 'number' },
  ],
  'shoe-bench': [
    { key: 'Кол-во полок',     unit: 'шт',     type: 'number' },
    { key: 'Цвет',             unit: '',       type: 'text' },
    { key: 'Макс. нагрузка',   unit: 'кг',     type: 'number' },
  ],
  'shelf-toilet': [
    { key: 'Конструкция',      unit: '',       type: 'select', options: ['разборно-сборная', 'цельная'] },
    { key: 'Цвет',             unit: '',       type: 'text' },
    { key: 'Кол-во полок',     unit: 'шт',     type: 'number' },
  ],
  'shelf-washer': [
    { key: 'Конструкция',      unit: '',       type: 'select', options: ['разборно-сборная', 'цельная'] },
    { key: 'Цвет',             unit: '',       type: 'text' },
    { key: 'Кол-во полок',     unit: 'шт',     type: 'number' },
  ],
  'shelf-corner': [
    { key: 'Кол-во полок',     unit: 'шт',     type: 'number' },
    { key: 'Цвет',             unit: '',       type: 'text' },
    { key: 'Макс. нагрузка',   unit: 'кг',     type: 'number' },
  ],
  'shelf-flowers': [
    { key: 'Кол-во полок',     unit: 'шт',     type: 'number' },
    { key: 'Цвет',             unit: '',       type: 'text' },
    { key: 'Макс. нагрузка',   unit: 'кг',     type: 'number' },
    { key: 'Конструкция',      unit: '',       type: 'select', options: ['разборно-сборная', 'цельная', 'складная'] },
  ],
  'mirror-floor': [
    { key: 'Цвет рамы',        unit: '',       type: 'text' },
    { key: 'Вес',              unit: 'кг',     type: 'number' },
    { key: 'Удерживаемый вес', unit: 'кг',     type: 'number' },
  ],
  'bbq-grill': [
    { key: 'Конструкция',      unit: '',       type: 'select', options: ['разборная складная', 'стационарная'] },
    { key: 'Материал корпуса', unit: '',       type: 'text' },
    { key: 'Кол-во пазов',     unit: 'шт',     type: 'number' },
  ],
  'antenna-outdoor': [
    { key: 'Сопротивление',    unit: 'Ом',     type: 'number' },
    { key: 'Диапазон частот',  unit: 'МГц',    type: 'text' },
    { key: 'Разъём',           unit: '',       type: 'text' },
    { key: 'Длина кабеля',     unit: 'ярд',    type: 'text' },
  ],
  'antenna-indoor': [
    { key: 'Сопротивление',    unit: 'Ом',     type: 'number' },
    { key: 'Диапазон частот',  unit: 'МГц',    type: 'text' },
    { key: 'Разъём',           unit: '',       type: 'text' },
    { key: 'Длина кабеля',     unit: 'ярд',    type: 'text' },
  ],
  'tv-mount': [
    { key: 'Конструкция',      unit: '',       type: 'select', options: ['разборно-сборная', 'наклонная', 'поворотная'] },
    { key: 'Макс. диагональ',  unit: '"',      type: 'text' },
    { key: 'Макс. нагрузка',   unit: 'кг',     type: 'number' },
  ],
  'other': [],
};
