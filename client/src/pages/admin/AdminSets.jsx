import { Fragment, useState, useEffect, useRef, useMemo, useCallback, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useFrontmen } from '../../context/FrontmenContext';
import AdminProductModal from './AdminProductModal';
import {
  adminGetFacets, adminGetProducts,
  adminGetBrands, adminAddBrandSet, adminUpdateBrandSet, adminDeleteBrandSet, adminReorderBrandSets,
  adminGetSetLayout,
  adminSaveSetLayout,
  adminDeleteProduct,
} from '../../api';
import AdminPdfButton from './AdminPdfButton';
import BrandPdfButton from './BrandPdfButton';
import TubesPdfButton from './TubesPdfButton';
import './AdminSets.css';
import { canEditCatalog } from '../../constants/roles';
import { useLazyItems } from '../../hooks/useLazyItems';
import { cloudinaryOpt } from '../../utils/drive';
import { SupplierBadge, StatusBadge, STATUS_BADGE } from '../../components/ProductBadges';

// ── страна учёта ───────────────────────────────────────────────────────────────

// Make-in и Matkasym — Кыргызстан, Q-top — Казахстан (свой склад, свой учёт).
const COUNTRIES = [
  { key: 'KG', label: 'Кыргызстан', flag: '🇰🇬' },
  { key: 'KZ', label: 'Казахстан',  flag: '🇰🇿' },
];
const CountryCtx = createContext({ country: 'KG', setCountry: () => {} });
const useCountry = () => useContext(CountryCtx).country;
const useCountrySwitch = () => useContext(CountryCtx).setCountry;

// ── helpers ────────────────────────────────────────────────────────────────────

// Остаток страны: KG — общий stock (Make-in + Matkasym), KZ — склад Q-top в Казахстане.
// Остатки стран не складываются: у Казахстана свой склад и свой учёт.
const stockOf = (p, country) => country === 'KZ' ? (p.stockByBase?.qtop || 0) : (p.stock || 0);

function getStockInfo(product, country = 'KG') {
  const stock = stockOf(product, country);
  // Для независимых комплектов (SKÅDIS, BOAXEL) показываем "Комплект"
  if (product.isKit && product.kitType === 'independent') {
    return { label: 'Комплект', hasStock: true, color: '#7c3aed', bg: '#f5f3ff' };
  }
  // Для зависимых комплектов с stock=0 показываем "Не хватает деталей"
  if (product.isKit && stock === 0) {
    return { label: 'Не хватает деталей', hasStock: false, color: '#9ca3af', bg: '#f3f4f6', isKitMissing: true };
  }
  if (stock > 0) {
    return { label: `${stock} шт.`, hasStock: true, color: '#2d7a3a', bg: '#e8f5e9' };
  }
  // Флаги «в пути» / «под заказ» ведутся по Кыргызстану — в казахстанском каталоге
  // остаток решает всё сам, иначе товар без остатка выглядел бы доступным.
  if (country !== 'KZ') {
    if (product.inTransit && product.inTransitQty > 0) {
      return { label: `Ожидается ${product.inTransitQty}`, hasStock: true, color: '#1d4ed8', bg: '#dbeafe' };
    }
    if (product.inTransit) {
      return { label: 'В пути', hasStock: true, color: '#1d4ed8', bg: '#dbeafe' };
    }
    if (product.isOnOrder) {
      return { label: 'Под заказ', hasStock: true, color: '#b45309', bg: '#fef3c7' };
    }
    if (product.inStock) {
      return { label: 'Есть', hasStock: true, color: '#2d7a3a', bg: '#e8f5e9' };
    }
  }
  return { label: 'Нет', hasStock: false, color: '#c00', bg: '#fce8e8' };
}

// Доступность товара для группировки "В наличии / Нет в наличии".
// Независимый комплект (SKÅDIS, BOAXEL) всегда доступен ("Комплект"), как и в getStockInfo.
function isProductAvailable(p, country = 'KG') {
  if (p.isKit && p.kitType === 'independent') return true;
  if (country === 'KZ') return stockOf(p, country) > 0;
  return p.stock > 0 || p.inStock || p.isOnOrder || p.inTransit;
}

// ── constants ──────────────────────────────────────────────────────────────────

// У труб свой каталог — прайс-лист по размерам вместо карточек с фото
const TUBES_SET = 'dayar-tutuk';

// Внутри категории трубы идут линейками одного сечения: Ø8, Ø12, 20×10… Список
// длинный и весь на одно лицо, поэтому при смене линейки ставим подзаголовок.
const tubeSizeOf = (p) => {
  const raw = String(p?.dimensions || '').replace(/\s*мм$/i, '').trim();
  if (!raw) return '';
  return /^[⌀Ø]/.test(raw) ? `Ø ${raw.replace(/^[⌀Ø]\s*/, '')} мм` : `${raw.replace(/[x*]/g, '×')} мм`;
};

const SET_NAMES = {
  'önügüü-set':      'Onuguu Set',
  'dayar-tütük':     'Dayar Tutuk',
  'achyk-asman':     'Achyk Asman',
  'den-sooluk':      'Den Sooluk',
  'zhashyl-ömür':    'Zhashyl Omur',
  'jenil-ashkana':   'Jenil Ashkana',
  'konok-keldi':     'Konok Keldi',
  'korkom-aiym':     'Korkom Aiym',
  'kosh-keliniz':    'Kosh Keliniz',
  'onoi-sakta':      'Onoi Sakta',
  'baary-oorunda':   'Baary Oorunda',
  'sanarip-tv':      'Sanarip TV',
  'shirin-balalyk':  'Shirin Balalyk',
  'taza-kiym':       'Taza Kiym',
  'uydo-ishtoo':     'Uydo Ishtoo',
  'mazza-seiyl':     'Mazza Seiyl',
  'zhashyl-omur-shaar': 'Zhashyl Omur (Shaar)',
  '0-tashtandy':     '0-Tashtandy',
  'bekem-fasad':     'Bekem Fasad',
  'bilim-kelechek':  'Bilim Kelechek',
  'kooz-koopsuzduk': 'Kooz Koopsuzduk',
  'uzak-koldon':     'Uzak Koldon',
  'samples':         'Obraztsy',
  'small-batch':     'Malaya Partiya',
  'misc':            'Raznoe',
  'equipment':       'Oborudovanie',
  'other':           'Prochee',
};

const EXCLUDE = new Set(['samples', 'small-batch', 'misc', 'equipment', 'other']);

const PROCHIYE = [
  { slug: 'samples',     label: 'Obraztsy' },
  { slug: 'small-batch', label: 'Malaya Partiya' },
  { slug: 'misc',        label: 'Raznoe' },
  { slug: 'equipment',   label: 'Oborudovanie' },
  { slug: 'other',       label: 'Prochee' },
];

const BRAND_META = {
  'matkasym-home':   { label: 'HOME',   accent: '#DC1E24' },
  'matkasym-shaar':  { label: 'SHAAR',  accent: '#3463A3' },
  'matkasym-kyzmat': { label: 'KYZMAT', accent: '#267846' },
};

const SET_SUB_ITEMS = {
  'onuguu-set':  ['Лазер', 'Гибка', 'Сварка', 'Труборез', 'Покраска'],
  'dayar-tutuk': ['Трубопрокат'],
};

const SALES_CHANNELS = [
  { key: 'matkasym_home', label: 'MATKASYM_HOME', short: 'HOME', color: '#DC1E24' },
  { key: 'matkasym_kz',   label: 'Matkasym KZ',   short: 'KZ',   color: '#267846' },
];

const SHAAR_CHANNELS = [
  { key: 'matkasym_shaar', label: 'MATKASYM_SHAAR', short: 'SHAAR', color: '#3463A3' },
];

const KYZMAT_CHANNELS = [
  { key: 'matkasym_kyzmat', label: 'MATKASYM_KYZMAT', short: 'KYZMAT', color: '#267846' },
];

// Каналы разведены по странам: Matkasym KZ и его фронтмены работают только
// в Казахстане, киргизские каналы — только в Кыргызстане.
const KZ_CHANNELS = SALES_CHANNELS.filter(c => c.key === 'matkasym_kz');
const KG_CHANNELS = SALES_CHANNELS.filter(c => c.key !== 'matkasym_kz');

function channelsFor(brandKey, country) {
  if (country === 'KZ') return KZ_CHANNELS;
  if (brandKey === 'matkasym-shaar')  return SHAAR_CHANNELS;
  if (brandKey === 'matkasym-kyzmat') return KYZMAT_CHANNELS;
  return KG_CHANNELS;
}

// Порядок категорий для конкретных сетов (чем меньше число, тем выше в списке)
const SET_CATEGORY_ORDER = {
  'dayar-tutuk': {
    'Трубы круглые': 1,
    'Трубы овальные': 2,
    'Трубы квадратные': 3,
    'Трубы прямоугольные': 4,
  },
  'mazza-seyil': {
    'Скамейки без спинки': 1,
    'Скамейки со спинкой': 2,
    'Скамейки с навесом': 3,
    'Навесы для скамеек': 4,
    'Перголы': 5,
    'Качели': 6,
    'Ландшафтное освещение': 7,
    'Остальное освещение': 8,
    'Велопарковки': 9,
  },
  'taza-kiym': {
    'Плечики': 1,
    'Корзины для белья': 2,
    'Гладильная доска': 3,
    'Сушилка': 4,
    'Гардеробная вешалка': 5,
    'Костюмная вешалка': 6,
    'Складная полка для гардеробной вешалки': 7,
  },
};

// Порядок карточек внутри конкретной категории. Обычный (без записи здесь) —
// сначала линейки, наверх та, где больше остаток, и лишь внутри линейки размер.
// Для баков и урн остаток порядок не задаёт, поэтому им свои режимы:
//   'size'   — чистое возрастание размера. У баков линейка не значит ничего:
//              «120л», «240л с педалью» и «360л (на колесиках)» разъезжаются по
//              трём разным рядам просто из-за суффикса в названии, и 1100-литровый
//              вставал впереди 120-литрового, потому что его на складе больше.
//   'series' — серия идёт целиком (SW, GW, GWR, KARAKOL, NOVOTEL…), внутри серии
//              по возрастанию, сами серии — по своей меньшей модели. Урны выбирают
//              рядом: сначала смотрят линейку, потом размер внутри неё.
//   массив  — серии в заданном порядке, а не по размеру. Владелец задаёт его
//              руками: G, GW, GWR, SW, KARAKOL, NOVOTEL — порядок каталога,
//              который из названий и габаритов не выводится.
const SORTING_URN_SERIES = [
  // Регулярки не пересекаются, поэтому порядок проверки роли не играет:
  // «урна G2» ловится только первой (у GW и GWR после G идёт буква, не цифра),
  // а «Каракол G3» — только по слову «Каракол».
  { label: 'G',       re: /урна\s+G\d/i },
  { label: 'GW',      re: /урна\s+GW\d?\s/i },
  { label: 'GWR',     re: /урна\s+GWR\d?/i },
  { label: 'SW',      re: /урна\s+SW\d?\s/i },
  { label: 'KARAKOL', re: /каракол|karakol/i },
  { label: 'NOVOTEL', re: /novotel|новотел/i },
];

const SET_CATEGORY_SORT = {
  'dayar-tutuk': {
    'Трубы круглые':       'size',
    'Трубы овальные':      'size',
    'Трубы квадратные':    'size',
    'Трубы прямоугольные': 'size',
  },
  '0-tashtandy': {
    'Пластиковые баки':   'size',
    'Мусорные баки':      'size',
    'Сортировочные урны': SORTING_URN_SERIES,
    'Уличные урны':       'series',
  },
};

function toTitle(slug) {
  return SET_NAMES[slug] || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function useIsMobile() {
  const [mob, setMob] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const h = () => setMob(window.innerWidth < 640);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return mob;
}

// ── BrandSection ──────────────────────────────────────────────────────────────

// Приведение к виду, в котором сравниваем при поиске: регистр и «ё» мешать не должны
function normSearch(str) {
  return String(str || '').toLowerCase().replace(/ё/g, 'е');
}

// ── Порядок карточек внутри категории ─────────────────────────────────────────
// Одна линейка идёт целиком: сначала все SANIRA, потом все SAKURA, потом ECO —
// и внутри линейки от меньшего размера к большему. Буква в скобках про размер
// не говорит (SANIRA(A) меньше, чем SANIRA(S)), поэтому меряем по `dimensions`.

// Латиница, включая скандинавские буквы: JÄLL, HÖSVANS, SKÅDIS
const LAT_UP = 'A-ZÄÖÜÅÆØÉÈ';
const FAMILY_UPPER_RE = new RegExp(`[${LAT_UP}][${LAT_UP}]{2,}`);
const FAMILY_CAPS_RE  = /[A-ZÄÖÜÅÆØ][a-zäöüåæøéè]{2,}/;

// Линейка модели: «SANIRA», «ECO», «Keremet». Латиницы в названии нет —
// берём название без цифр, чтобы «Плечики 007/1608/6135» держались вместе.
function familyKey(name) {
  const s = String(name || '');
  const up = s.match(FAMILY_UPPER_RE);
  if (up) return up[0];
  const caps = s.match(FAMILY_CAPS_RE);
  if (caps) return caps[0];
  return normSearch(s).replace(/\d+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Размер = произведение чисел из «120×38×89 см». Сравниваем только внутри линейки,
// где формат записи одинаковый, поэтому объёма достаточно.
function sizeRank(dim) {
  const nums = String(dim || '').match(/\d+(?:[.,]\d+)?/g);
  if (!nums) return null;
  return nums.reduce((acc, n) => acc * parseFloat(n.replace(',', '.')), 1);
}

// Ручной порядок поверх автоматического. Модели, которых в списке нет (завели
// после настройки), остаются после перечисленных — в том порядке, в каком их
// поставила автоматика. Пропасть со страницы товар не должен.
function applyManualOrder(items, order) {
  if (!order || !order.length) return items;
  const at = new Map(order.map((name, i) => [name, i]));
  return [...items].sort((a, b) => {
    const ia = at.has(a[0]) ? at.get(a[0]) : Infinity;
    const ib = at.has(b[0]) ? at.get(b[0]) : Infinity;
    return ia - ib;
  });
}

// Перестановка элемента списка: вынули с позиции from, вставили на to.
function moveItem(list, from, to) {
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

// Стрелки перестановки. Одинаковые на категориях и на карточках, в обоих видах.
// stopPropagation обязателен: и заголовок категории, и карточка товара — сами по
// себе кликабельны (сворачивают список, открывают товар).
// Перетаскивание карточек в режиме правки порядка.
//
// Стрелки на 20+ позициях означали десяток кликов, чтобы увести карточку в конец,
// поэтому порядок правится перетаскиванием. Пока карточка едет за курсором,
// соседи разъезжаются и освобождают ей место — так видно, куда она встанет.
//
// Слоты (rect каждой ячейки) снимаем один раз в начале, в координатах документа:
// сетка во время перетаскивания не перестраивается — двигаются только transform-ы,
// поэтому позиции остаются валидными, а страницу можно спокойно прокручивать.
function useCardDrag(onReorder) {
  const [drag, setDrag] = useState(null);   // { group, from, to, dx, dy, w, h }
  const slots = useRef([]);
  const nodes = useRef(new Map());          // группа → элементы карточек

  const register = useCallback((group, index, el) => {
    if (!nodes.current.has(group)) nodes.current.set(group, []);
    nodes.current.get(group)[index] = el || undefined;
  }, []);

  const start = useCallback((group, index) => (e) => {
    if (e.button) return;                   // правая кнопка порядок не меняет
    const origin = { x: e.clientX, y: e.clientY };
    let started = false;

    const nearest = (x, y) => {
      let best = 0, dist = Infinity;
      slots.current.forEach((r, i) => {
        const d = (x - (r.left + r.width / 2)) ** 2 + (y - (r.top + r.height / 2)) ** 2;
        if (d < dist) { dist = d; best = i; }
      });
      return best;
    };

    let frame = 0;
    const move = (ev) => {
      const dx = ev.clientX - origin.x;
      const dy = ev.clientY - origin.y;
      if (!started) {
        if (Math.hypot(dx, dy) < 6) return;  // дрожание руки — ещё не перетаскивание
        const els = (nodes.current.get(group) || []).filter(Boolean);
        if (els.length < 2) { finish(); return; }
        slots.current = els.map(el => {
          const r = el.getBoundingClientRect();
          return { left: r.left + window.scrollX, top: r.top + window.scrollY, width: r.width, height: r.height };
        });
        started = true;
        const r = slots.current[index];
        setDrag({ group, from: index, to: index, dx, dy, w: r.width, h: r.height });
        return;
      }
      ev.preventDefault();
      // события летят чаще, чем перерисовывается сетка на сотню карточек
      if (frame) return;
      const x = ev.clientX + window.scrollX, y = ev.clientY + window.scrollY;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setDrag(d => (d ? { ...d, dx, dy, to: nearest(x, y) } : d));
      });
    };

    const up = () => {
      setDrag(d => {
        if (d && d.to !== d.from) onReorder(d.group, d.from, d.to);
        return null;
      });
      finish();
    };

    function finish() {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    }

    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }, [onReorder]);

  // Смещение ячейки: карточки между исходным и целевым местом сдвигаются на слот.
  const styleFor = (group, index) => {
    if (!drag || drag.group !== group) return null;
    if (index === drag.from) {
      return {
        transform: `translate(${drag.dx}px, ${drag.dy}px) scale(1.04)`,
        zIndex: 30, transition: 'none', animation: 'none',
        boxShadow: '0 18px 40px rgba(0,0,0,.22)', cursor: 'grabbing',
      };
    }
    const { from, to } = drag;
    let shifted = index;
    if (from < to && index > from && index <= to) shifted = index - 1;
    else if (from > to && index >= to && index < from) shifted = index + 1;
    if (shifted === index) return { transition: 'transform .18s ease' };
    const a = slots.current[index], b = slots.current[shifted];
    if (!a || !b) return null;
    return {
      transform: `translate(${b.left - a.left}px, ${b.top - a.top}px)`,
      transition: 'transform .18s ease',
    };
  };

  const target = drag && slots.current[drag.to];
  const ghost = target ? {
    left: target.left - window.scrollX, top: target.top - window.scrollY,
    width: drag.w, height: drag.h,
  } : null;

  return { drag, register, start, styleFor, ghost };
}

function MoveArrows({ onUp, onDown, canUp, canDown, size = 24 }) {
  const btn = on => ({
    width: size, height: size, borderRadius: 6, padding: 0,
    border: '1.5px solid ' + (on ? '#cfd6de' : '#eef0f3'),
    background: '#fff', color: on ? '#3463A3' : '#dde2e7',
    fontSize: size > 22 ? 12 : 10, lineHeight: 1,
    cursor: on ? 'pointer' : 'default',
  });
  const stop = (e, fn, on) => { e.stopPropagation(); if (on) fn(); };
  return (
    <span style={{ display: 'inline-flex', gap: 3 }}>
      <button title="Выше" style={btn(canUp)}
        onClick={e => stop(e, onUp, canUp)}>▲</button>
      <button title="Ниже" style={btn(canDown)}
        onClick={e => stop(e, onDown, canDown)}>▼</button>
    </span>
  );
}

// Последнее число названия — у труб это толщина стенки: «20×10×0,85» → 0.85.
function lastNumber(name) {
  const nums = String(name || '').match(/\d+(?:[.,]\d+)?/g);
  return nums ? parseFloat(nums[nums.length - 1].replace(',', '.')) : null;
}

const natCompare = (a, b) =>
  String(a).localeCompare(String(b), 'ru', { numeric: true, sensitivity: 'base' });

// items — пары [name, variants] из группировки по модели.
// withCategory — для сборной группы «Нет в наличии»: там сначала держим вместе категорию.
function sortModelsInGroup(items, country, withCategory = false, mode = '') {
  const info = items.map(item => {
    const [name, variants] = item;
    const sized = variants.find(v => sizeRank(v.dimensions) != null);
    return {
      item,
      name,
      cat: withCategory ? (variants[0]?.category || 'Прочее') : '',
      family: familyKey(name),
      size: sized ? sizeRank(sized.dimensions) : null,
      stock: Math.max(0, ...variants.map(v => stockOf(v, country))),
    };
  });

  // Линейку двигает наверх самая ходовая позиция в ней — иначе редкий размер
  // утащил бы всю SANIRA в конец категории.
  const famBest = new Map();
  info.forEach(i => {
    const k = `${i.cat}|${i.family}`;
    famBest.set(k, Math.max(famBest.get(k) ?? 0, i.stock));
  });

  // Размеры внутри линейки склеиваем в ступени: ECO 103,5×34×78 и 104×34×78 —
  // это один размер в разном цвете, между собой их сортируем по названию.
  const byFamily = new Map();
  info.forEach(i => {
    const k = `${i.cat}|${i.family}`;
    if (!byFamily.has(k)) byFamily.set(k, []);
    byFamily.get(k).push(i);
  });
  byFamily.forEach(list => {
    let step = 0, base = null;
    list.filter(i => i.size != null).sort((a, b) => a.size - b.size).forEach(i => {
      if (base == null || i.size / base > 1.02) { step += 1; base = i.size; }
      i.step = step;
    });
  });

  // Размер решает всё: линейки и остаток в порядок не вмешиваются.
  // Карточки без размера — в конец, иначе они разорвали бы возрастающий ряд.
  if (mode === 'size') {
    return info.sort((a, b) => {
      if (a.cat !== b.cat) return a.cat.localeCompare(b.cat, 'ru');
      if ((a.size == null) !== (b.size == null)) return a.size == null ? 1 : -1;
      if (a.size != null && a.size !== b.size) return a.size - b.size;
      return natCompare(a.name, b.name);
    }).map(i => i.item);
  }

  // Серии в заданном порядке. Внутри серии — по возрастанию размера.
  // Не попавшее ни в одну серию уходит в конец: выдумывать ему место в чужом
  // ряду нельзя, а прятать нельзя тем более.
  if (Array.isArray(mode)) {
    const seriesOf = name => {
      const i = mode.findIndex(x => x.re.test(name));
      return i < 0 ? mode.length : i;
    };
    return info.sort((a, b) => {
      if (a.cat !== b.cat) return a.cat.localeCompare(b.cat, 'ru');
      const sa = seriesOf(a.name), sb = seriesOf(b.name);
      if (sa !== sb) return sa - sb;
      if ((a.size == null) !== (b.size == null)) return a.size == null ? 1 : -1;
      if (a.size != null && a.size !== b.size) return a.size - b.size;
      // Размер совпал — значит это одно сечение трубы, и различает их только
      // толщина стенки, последнее число в названии. Сравнивать названия целиком
      // нельзя: natCompare читает «0,85» как «0» и «85», и труба 0,85 встаёт
      // после 0,9, потому что 85 больше 9.
      const ta = lastNumber(a.name), tb = lastNumber(b.name);
      if (ta != null && tb != null && ta !== tb) return ta - tb;
      return natCompare(a.name, b.name);
    }).map(i => i.item);
  }

  // Серия целиком, внутри — по возрастанию. Место серии задаёт её самая
  // маленькая модель: так ряды не перемешиваются, а идут от мелких к крупным.
  if (mode === 'series') {
    const famMin = new Map();
    info.forEach(i => {
      if (i.size == null) return;
      const k = `${i.cat}|${i.family}`;
      famMin.set(k, Math.min(famMin.get(k) ?? Infinity, i.size));
    });
    return info.sort((a, b) => {
      if (a.cat !== b.cat) return a.cat.localeCompare(b.cat, 'ru');
      const ka = `${a.cat}|${a.family}`, kb = `${b.cat}|${b.family}`;
      if (ka !== kb) {
        const ma = famMin.get(ka) ?? Infinity, mb = famMin.get(kb) ?? Infinity;
        if (ma !== mb) return ma - mb;
        return natCompare(a.family, b.family);
      }
      if ((a.size == null) !== (b.size == null)) return a.size == null ? 1 : -1;
      if (a.size != null && a.size !== b.size) return a.size - b.size;
      return natCompare(a.name, b.name);
    }).map(i => i.item);
  }

  return info.sort((a, b) => {
    if (a.cat !== b.cat) return a.cat.localeCompare(b.cat, 'ru');
    const ka = `${a.cat}|${a.family}`, kb = `${b.cat}|${b.family}`;
    if (ka !== kb) {
      const byStock = (famBest.get(kb) || 0) - (famBest.get(ka) || 0);
      return byStock || natCompare(a.family, b.family);
    }
    if (a.step && b.step && a.step !== b.step) return a.step - b.step;
    if ((a.size == null) !== (b.size == null)) return a.size == null ? 1 : -1;
    return natCompare(a.name, b.name);
  }).map(i => i.item);
}

function slugify(name) {
  return name.trim().toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function BrandSection({ brandKey, sets, accent, subItems = {}, autoOpenSet, onOpenCatalog, onCloseCatalog, frontmen, productCount = 0, stockStats = null }) {
  const country = useCountry();
  const switchCountry = useCountrySwitch();
  const [editing, setEditing]     = useState(false);
  const [catalogSlug, setCatalog] = useState(() => autoOpenSet || null);
  const isMobile                  = useIsMobile();

  function handleOpenCatalog(slug) {
    setCatalog(slug);
    onOpenCatalog?.(brandKey, slug);
  }

  function handleCloseCatalog() {
    setCatalog(null);
    onCloseCatalog?.();
  }

  const [customSets,  setCustomSets]  = useState([]);
  const [showAddSet,  setShowAddSet]  = useState(false);
  const [newSetName,  setNewSetName]  = useState('');
  const [addingSet,   setAddingSet]   = useState(false);
  const [addSetError, setAddSetError] = useState('');
  const [editingSetKey, setEditingSetKey] = useState(null);
  const [editSetLabel,  setEditSetLabel]  = useState('');

  // Drag and drop state
  const [draggedIdx, setDraggedIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [localOrder, setLocalOrder] = useState([]);

  useEffect(() => {
    adminGetBrands().then(r => {
      const brand = r.data.find(b => b.key === brandKey);
      console.log(`[${brandKey}] brand.sets:`, brand?.sets?.length, brand?.sets?.map(s => s.key));
      if (brand) setCustomSets(brand.sets || []);
    });
  }, [brandKey]);

  const getFrontmenForSet = (slug, channel) => {
    return frontmen.filter(f =>
      (f.kind || 'frontman') === 'frontman' &&
      f.brand === brandKey && f.sets?.includes(slug) && f.channel === channel
    );
  };

  // Дизайнеры ведут сеты без привязки к каналу продаж — отдельная колонка справа
  const getDesignersForSet = slug =>
    frontmen.filter(f => f.kind === 'designer' && f.brand === brandKey && f.sets?.includes(slug));
  const DESIGNER_COLOR = '#be185d';

  // Sets come from DB (customSets), sorted by order field
  const allSets = useMemo(() => {
    if (customSets.length === 0) return []; // Show nothing while loading
    const sorted = [...customSets].sort((a, b) => (a.order ?? 999) - (b.order ?? 999)).map(s => s.key);
    // В казахстанском каталоге скрываем сеты, которых на складе Q-top нет:
    // список приходит из фасетов, посчитанных с фильтром по стране.
    if (country === 'KZ') {
      const available = new Set(sets);
      return sorted.filter(k => available.has(k));
    }
    return sorted;
  }, [customSets, country, sets]);

  // During drag, use localOrder for visual feedback
  const displaySets = localOrder.length > 0 ? localOrder : allSets;

  const handleDragStart = (e, idx) => {
    setDraggedIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    if (draggedIdx !== idx) setDragOverIdx(idx);
  };

  const handleDragLeave = () => {
    setDragOverIdx(null);
  };

  const handleDrop = async (e, idx) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === idx) {
      setDraggedIdx(null);
      setDragOverIdx(null);
      setLocalOrder([]);
      return;
    }
    const currentSets = localOrder.length > 0 ? localOrder : allSets;
    const newOrder = [...currentSets];
    const [moved] = newOrder.splice(draggedIdx, 1);
    newOrder.splice(idx, 0, moved);
    setLocalOrder(newOrder);
    setDraggedIdx(null);
    setDragOverIdx(null);
    try {
      const res = await adminReorderBrandSets(brandKey, newOrder);
      setCustomSets(res.data.sets || []);
      setLocalOrder([]); // Reset after save - allSets will recalculate from customSets
    } catch (e) {
      console.error('Reorder failed:', e);
      setLocalOrder([]); // Reset on error too
    }
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  async function handleAddSet() {
    const name = newSetName.trim();
    if (!name) return;
    const slug = slugify(name);
    setAddingSet(true);
    setAddSetError('');
    try {
      const res = await adminAddBrandSet(brandKey, slug, name);
      setCustomSets(res.data.sets || []);
      setNewSetName('');
      setShowAddSet(false);
    } catch (e) {
      setAddSetError(e?.response?.data?.error || 'Ошибка при добавлении сета');
    } finally { setAddingSet(false); }
  }

  async function handleDeleteSet(slug) {
    if (!window.confirm(`Удалить сет «${slug}»?`)) return;
    const res = await adminDeleteBrandSet(brandKey, slug);
    setCustomSets(res.data.sets || []);
  }

  async function handleUpdateSet(slug) {
    if (!editSetLabel.trim()) return;
    try {
      const res = await adminUpdateBrandSet(brandKey, slug, { label: editSetLabel.trim() });
      setCustomSets(res.data.sets || []);
      setEditingSetKey(null);
      setEditSetLabel('');
    } catch (e) {
      alert(e?.response?.data?.error || 'Ошибка при обновлении');
    }
  }

  function startEditSet(slug, currentLabel) {
    setEditingSetKey(slug);
    setEditSetLabel(currentLabel);
  }

  const pad = isMobile ? '20px 16px' : '32px 36px';

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: pad, boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <div style={{ fontSize: isMobile ? 36 : 46, fontWeight: 800, letterSpacing: -1, color: '#1c1c1c', lineHeight: 1 }}>
              {BRAND_META[brandKey].label}
            </div>
            {productCount > 0 && (
              <div style={{ fontSize: 14, fontWeight: 600, color: '#888' }}>
                {productCount} тов.
              </div>
            )}
          </div>
          <div style={{ height: 3, width: 50, background: accent, borderRadius: 2, margin: '8px 0 6px' }} />
          <div style={{ fontSize: 12, color: '#6b8997' }}>
            Линейки <span style={{ fontWeight: 700, color: accent }}>сетов</span>
          </div>

          {/* Счётчик наличия по бренду: позиции (модели) · штуки на складе */}
          {stockStats && (stockStats.inMod > 0 || stockStats.outMod > 0) && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#f0fdf4',
                border: '1px solid #bbf7d0', borderRadius: 20, padding: '5px 12px' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a' }} />
                <span style={{ fontSize: 12.5, color: '#5b6572' }}>В наличии</span>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: '#15803d' }}>{stockStats.inMod} поз</span>
                <span style={{ fontSize: 11, color: '#86b89a' }}>·</span>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: '#15803d' }}>{stockStats.inUnits.toLocaleString('ru-RU')} шт</span>
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fef2f2',
                border: '1px solid #fecaca', borderRadius: 20, padding: '5px 12px' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#dc2626' }} />
                <span style={{ fontSize: 12.5, color: '#5b6572' }}>Нет</span>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: '#b91c1c' }}>{stockStats.outMod} поз</span>
                <span style={{ fontSize: 11, color: '#e0a0a0' }}>·</span>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: '#b91c1c' }}>{stockStats.outUnits.toLocaleString('ru-RU')} шт</span>
              </span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
          {!editing && (
            <BrandPdfButton brandKey={brandKey} sets={customSets} brandLabel={BRAND_META[brandKey].label} currency={CURRENCY[country] || CURRENCY.KG} />
          )}
          {editing ? (
            <>
              <button onClick={() => setShowAddSet(v => !v)} style={btn('#f0fff4','#267846')}>+ Сет</button>
              <button onClick={() => { setEditing(false); setShowAddSet(false); setNewSetName(''); }} style={btn(accent,'#fff',true)}>Готово</button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} style={btn('#f5f5f5','#333')}>✏️ Изменить</button>
          )}
        </div>
      </div>

      {/* Add-set form */}
      {editing && showAddSet && (
        <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
          background: '#f0fff4', borderRadius: 8, padding: '10px 12px', border: '1px solid #c8ecd4' }}>
          <input
            value={newSetName}
            onChange={e => setNewSetName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddSet()}
            placeholder="Название сета"
            autoFocus
            style={{ flex: 1, minWidth: 160, fontSize: 13, border: '1px solid #b2d8c0',
              borderRadius: 6, padding: '6px 10px', outline: 'none' }}
          />
          {newSetName.trim() && (
            <span style={{ fontSize: 11, color: '#888', flexShrink: 0, fontFamily: 'monospace' }}>
              /{slugify(newSetName.trim())}
            </span>
          )}
          <button onClick={handleAddSet} disabled={addingSet || !newSetName.trim()}
            style={btn('#267846','#fff',true)}>
            {addingSet ? '…' : 'Добавить'}
          </button>
          <button onClick={() => { setShowAddSet(false); setNewSetName(''); setAddSetError(''); }}
            style={btn('#f5f5f5','#555')}>Отмена</button>
          {addSetError && (
            <span style={{ fontSize: 11, color: '#c00', width: '100%' }}>{addSetError}</span>
          )}
        </div>
      )}

      {/* Channel headers */}
      {!isMobile && (
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, paddingLeft: 200 }}>
          {channelsFor(brandKey, country).map(ch => (
            <div key={ch.key} style={{
              flex: 1,
              textAlign: 'center',
              fontSize: 10,
              fontWeight: 700,
              color: ch.color,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}>
              {ch.label}
            </div>
          ))}
          <div style={{
            flex: 1,
            textAlign: 'center',
            fontSize: 10,
            fontWeight: 700,
            color: DESIGNER_COLOR,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}>
            Дизайнеры
          </div>
        </div>
      )}

      {/* Sets list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {displaySets.map((slug, i) => {
          const customSet = customSets.find(cs => cs.key === slug);
          const displayLabel = customSet?.label || toTitle(slug);
          const isEditingThis = editingSetKey === slug;
          const isDragging = draggedIdx === i;
          const isDragOver = dragOverIdx === i;

          return (
          <div key={slug}
            draggable={editing}
            onDragStart={e => handleDragStart(e, i)}
            onDragOver={e => handleDragOver(e, i)}
            onDragLeave={handleDragLeave}
            onDrop={e => handleDrop(e, i)}
            onDragEnd={handleDragEnd}
            style={{
              padding: '8px 10px',
              background: isDragOver ? '#e3f2fd' : (i % 2 === 0 ? '#f8f9fb' : '#fff'),
              borderRadius: 6,
              opacity: isDragging ? 0.5 : 1,
              border: isDragOver ? `2px dashed ${accent}` : '2px solid transparent',
              cursor: editing ? 'grab' : 'default',
              transition: 'all 0.15s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {editing && (
                <span style={{ color: '#bbb', fontSize: 14, cursor: 'grab', flexShrink: 0 }} title="Перетащить">
                  ≡
                </span>
              )}
              <span style={{ width: 20, textAlign: 'right', fontWeight: 700, fontSize: 12, color: accent, flexShrink: 0 }}>
                {i + 1}
              </span>
              <span style={{ color: '#ccc', fontSize: 13 }}>|</span>

              {editing && isEditingThis ? (
                <div style={{ flex: 1, display: 'flex', gap: 6, alignItems: 'center', maxWidth: 150 }}>
                  <input
                    value={editSetLabel}
                    onChange={e => setEditSetLabel(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleUpdateSet(slug)}
                    autoFocus
                    style={{ flex: 1, fontSize: 13, border: '1px solid #ccc', borderRadius: 4, padding: '4px 8px' }}
                  />
                  <button onClick={() => handleUpdateSet(slug)} style={btn('#267846','#fff',true)}>✓</button>
                  <button onClick={() => { setEditingSetKey(null); setEditSetLabel(''); }} style={btn('#f5f5f5','#555')}>✕</button>
                </div>
              ) : (
                <span
                  onClick={() => !editing && handleOpenCatalog(slug)}
                  onDoubleClick={() => editing && customSet && startEditSet(slug, displayLabel)}
                  style={{ fontSize: 13, color: '#1c1c1c', width: isMobile ? 'auto' : 140, flexShrink: 0,
                    cursor: editing ? (customSet ? 'text' : 'default') : 'pointer',
                    textDecoration: editing ? 'none' : 'underline',
                    textDecorationStyle: 'dotted', textDecorationColor: '#bbb',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                  title={editing && customSet ? 'Двойной клик для редактирования' : displayLabel}
                >{displayLabel}</span>
              )}

              {editing && !isEditingThis && (
                <>
                  <button onClick={() => startEditSet(slug, displayLabel)}
                    title="Редактировать название"
                    style={{ color: '#666', background: 'none', border: 'none',
                      cursor: 'pointer', fontSize: 12, padding: '0 2px', flexShrink: 0, lineHeight: 1 }}>
                    ✏️
                  </button>
                  {/* Delete only for custom sets (not in static list) */}
                  {!sets.includes(slug) && (
                    <button onClick={() => handleDeleteSet(slug)}
                      title="Удалить сет"
                      style={{ color: '#c00', background: 'none', border: 'none',
                        cursor: 'pointer', fontSize: 13, padding: '0 2px', flexShrink: 0, lineHeight: 1 }}>
                      ✕
                    </button>
                  )}
                </>
              )}

              {/* Sales channels columns */}
              {!isMobile && !editing && (
                <div style={{ display: 'flex', flex: 1, marginLeft: 8 }}>
                  {channelsFor(brandKey, country).map(ch => {
                    const channelFrontmen = getFrontmenForSet(slug, ch.key);
                    return (
                      <div key={ch.key} style={{
                        flex: 1,
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 4,
                        justifyContent: 'center',
                        minHeight: 20,
                      }}>
                        {channelFrontmen.map(f => (
                          <span key={f._id} style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: f.color || ch.color,
                            background: `${f.color || ch.color}15`,
                            padding: '2px 6px',
                            borderRadius: 4,
                            whiteSpace: 'nowrap',
                          }}>
                            {f.name}
                          </span>
                        ))}
                        {channelFrontmen.length === 0 && (
                          <span style={{ fontSize: 10, color: '#ddd' }}>—</span>
                        )}
                      </div>
                    );
                  })}

                  {/* Дизайнеры сета — одна колонка на все каналы */}
                  <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center', minHeight: 20 }}>
                    {getDesignersForSet(slug).map(d => (
                      <span key={d._id} style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: d.color || DESIGNER_COLOR,
                        background: `${d.color || DESIGNER_COLOR}15`,
                        padding: '2px 6px',
                        borderRadius: 4,
                        whiteSpace: 'nowrap',
                      }}>{d.name}</span>
                    ))}
                    {getDesignersForSet(slug).length === 0 && (
                      <span style={{ fontSize: 10, color: '#ddd' }}>—</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {subItems[slug] && (
              <div style={{ paddingLeft: 36, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {subItems[slug].map(sub => (
                  <div key={sub} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 0' }}>
                    <div style={{ width: 3, height: 13, background: accent, borderRadius: 2, flexShrink: 0 }} />
                    <span style={{ color: '#bbb', fontSize: 11 }}>—</span>
                    <span style={{ fontSize: 12, color: '#555' }}>{sub}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );})}
      </div>

      {catalogSlug && (
        <SetCatalogPanel brandKey={brandKey} setSlug={catalogSlug} onClose={handleCloseCatalog} />
      )}
    </div>
  );
}


// ── SetCatalogPanel ───────────────────────────────────────────────────────────

const RETAIL_BRANDS = new Set(['matkasym-home', 'matkasym-shaar']);
const NO_PHOTO      = '/logos/no-photo.png';

// Компонент для отображения изображения или цвета (для красок)
function ProductImage({ product, size = 80, className = '', style = {} }) {
  const hasImage = product.images?.[0];
  const hasColor = product.color;

  if (hasColor && !hasImage) {
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          minWidth: size,
          background: product.color,
          borderRadius: 8,
          border: '1px solid rgba(0,0,0,0.1)',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.2)',
          ...style
        }}
        title={product.name}
      />
    );
  }

  const img = cloudinaryOpt(hasImage || NO_PHOTO, size);
  return (
    <img
      src={img}
      alt={product.name}
      className={className}
      style={{ width: size, height: size, objectFit: 'cover', borderRadius: 8, ...style }}
      onError={e => { e.target.src = NO_PHOTO; }}
    />
  );
}

const PRICE_MODES = [
  { key: 'retail',    label: 'Розничная', short: 'Розн.' },
  { key: 'wholesale', label: 'Оптовая',   short: 'Опт.'  },
  { key: 'dealer',    label: 'Дилерская', short: 'Дил.'  },
  { key: 'none',      label: 'Без цен',   short: 'Без'   },
];

function getPrice(product, mode) {
  if (mode === 'retail')    return product.price;
  if (mode === 'wholesale') return product.priceWholesale;
  if (mode === 'dealer')    return product.priceDealer;
  return null;
}
function getPriceLabel(mode) {
  return PRICE_MODES.find(m => m.key === mode)?.label || '';
}
// Валюта страны учёта: Кыргызстан — сом, Казахстан (склад Q-top) — тенге
const CURRENCY = { KG: 'сом', KZ: '₸' };
const fmtPrice = (price, country) =>
  price > 0 ? `${price.toLocaleString('ru')} ${CURRENCY[country] || CURRENCY.KG}` : '—';

function SetCatalogPanel({ brandKey, setSlug, onClose, accentOverride, titleOverride, fetchParams }) {
  const country     = useCountry();
  const { user }    = useAuth();
  // Порядок и удаление — только владелец, редактор и дизайнер. Сервер проверяет
  // сам (middleware editor), здесь просто не показываем кнопку остальным:
  // складу и закупщику она бы кончилась ошибкой 403.
  const canEdit     = canEditCatalog(user?.role);
  const accent      = accentOverride || BRAND_META[brandKey]?.accent || '#555';
  const defaultMode = RETAIL_BRANDS.has(brandKey) ? 'retail' : 'retail';
  const [priceMode, setPriceMode]         = useState(defaultMode);
  const [products,  setProducts]          = useState([]);
  const [loading,   setLoading]           = useState(true);
  const scrollRef = useRef(null);
  const [detailProduct, setDetailProduct] = useState(null);
  const [viewMode,  setViewMode]  = useState(() => localStorage.getItem('adminCatalogView') || 'grid');
  // Порядок, заданный руками. Пустой = не настраивали, работает автоматический.
  const [catOrder,  setCatOrder]  = useState([]);      // ['Трубы круглые', ...]
  const [prodOrder, setProdOrder] = useState({});      // { 'Трубы круглые': ['Труба круглая 8×0,5', ...] }
  const [editMode,  setEditMode]  = useState(false);
  const [saving,    setSaving]    = useState(false);
  // Снимок на случай «Отмена»: правки видно сразу на странице, откатывать не с чего.
  const snapshot = useRef(null);
  const [toDelete, setToDelete] = useState(null);   // { name, variants } — ждём подтверждения
  const [deleting, setDeleting] = useState(false);
  const isMobile = useIsMobile();

  const toggleView = () => {
    const next = viewMode === 'grid' ? 'list' : 'grid';
    setViewMode(next);
    localStorage.setItem('adminCatalogView', next);
  };

  // Lock body scroll while panel is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    setLoading(true);
    adminGetProducts({ ...(fetchParams || { set: setSlug, limit: 1000, page: 1 }), country })
      .then(r => { setProducts(r.data.products || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [brandKey, setSlug, country, fetchParams && JSON.stringify(fetchParams)]);

  useEffect(() => {
    adminGetSetLayout(brandKey, setSlug)
      .then(r => { setCatOrder(r.data.categories || []); setProdOrder(r.data.products || {}); })
      .catch(() => { setCatOrder([]); setProdOrder({}); });
    setEditMode(false);
  }, [brandKey, setSlug]);

  // Поиск внутри сета: позиций бывает под сотню и больше, глазами не найти.
  // Ищем по названию, артикулу, цвету, размерам и категории; если слов несколько —
  // совпасть должны все, в любом порядке («люк 600» находит «Люк потолочный 600×600»).
  const [query, setQuery] = useState('');
  const words = useMemo(() => normSearch(query).split(/\s+/).filter(Boolean), [query]);

  // Всё, что показываем: без деталей комплектов и с учётом поиска.
  // От этого списка считаются и группы, и счётчики, и PDF — что на экране, то и в выгрузке.
  const shownProducts = useMemo(() => {
    const base = products.filter(p => p.productStatus !== 'kit_part' && p.category !== 'kit-part');
    if (!words.length) return base;
    return base.filter(p => {
      const hay = normSearch([p.name, p.fullName, p.sku, p.supplier?.sku, p.color, p.dimensions, p.category]
        .filter(Boolean).join(' '));
      return words.every(w => hay.includes(w));
    });
  }, [products, words]);

  const models = useMemo(() => {
    const grouped = {};
    shownProducts.forEach(p => {
      if (!grouped[p.name]) grouped[p.name] = [];
      grouped[p.name].push(p);
    });
    return Object.entries(grouped);
  }, [shownProducts]);

  // Счётчик: в наличии / нет в наличии — позиции (модели) и количество (штук на складе)
  const stockSummary = useMemo(() => {
    const shown = shownProducts;
    let inUnits = 0, outUnits = 0;
    shown.forEach(p => {
      if (isProductAvailable(p, country)) inUnits += stockOf(p, country);
      else outUnits += stockOf(p, country);
    });
    const inMod  = models.filter(([, v]) => v.some(x => isProductAvailable(x, country))).length;
    const outMod = models.length - inMod;
    return { inMod, outMod, inUnits, outUnits };
  }, [shownProducts, models]);

  const renderStockStats = (fontSize) => (
    <div style={{ fontSize, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
      <span style={{ color: '#1e7e34', fontWeight: 600, whiteSpace: 'nowrap' }}>
        ● В наличии: {stockSummary.inMod} поз · {stockSummary.inUnits} шт
      </span>
      <span style={{ color: '#c0392b', fontWeight: 600, whiteSpace: 'nowrap' }}>
        ● Нет в наличии: {stockSummary.outMod} поз · {stockSummary.outUnits} шт
      </span>
    </div>
  );

  // Универсальная группировка по категориям для ВСЕХ сетов
  const categoryGroups = useMemo(() => {
    if (models.length === 0) return null;
    const groupsMap = {};
    models.forEach(([name, variants]) => {
      const p = variants[0];
      const hasStock = isProductAvailable(p, country);
      const cat = p.category || 'Прочее';
      const targetGroup = hasStock ? cat : 'Нет в наличии';
      if (!groupsMap[targetGroup]) groupsMap[targetGroup] = [];
      groupsMap[targetGroup].push([name, variants]);
    });
    // Порядок категорий: сначала заданный руками в админке, потом старый
    // захардкоженный (для сетов, которые ещё не переносили), потом алфавит.
    const saved = {};
    catOrder.forEach((c, i) => { saved[c] = i; });
    const customOrder = catOrder.length ? saved : (SET_CATEGORY_ORDER[setSlug] || {});
    const result = Object.entries(groupsMap)
      .filter(([, items]) => items.length > 0)
      .sort((a, b) => {
        if (a[0] === 'Нет в наличии') return 1;
        if (b[0] === 'Нет в наличии') return -1;
        if (a[0] === 'Прочее') return 1;
        if (b[0] === 'Прочее') return -1;
        const orderA = customOrder[a[0]] ?? 999;
        const orderB = customOrder[b[0]] ?? 999;
        if (orderA !== orderB) return orderA - orderB;
        return a[0].localeCompare(b[0], 'ru');
      })
      // Внутри категории — по линейкам и размерам, а не вперемешку по остатку
      .map(([groupName, items]) => [
        groupName,
        applyManualOrder(
          sortModelsInGroup(items, country, groupName === 'Нет в наличии', (SET_CATEGORY_SORT[setSlug] || {})[groupName] || ''),
          prodOrder[groupName],
        ),
      ]);
    return result;
  }, [models, setSlug, country, catOrder, prodOrder]);

  // Общая переменная для групп — теперь только categoryGroups
  const accordionGroups = categoryGroups;

  // Перетаскивание карточек. Ссылка на группы — через ref: колбэк живёт дольше
  // одного рендера, а замыкание на accordionGroups устаревало бы после каждого.
  const groupsRef = useRef([]);
  groupsRef.current = accordionGroups || [];
  const reorderProduct = useCallback((cat, from, to) => {
    const group = groupsRef.current.find(([name]) => name === cat);
    if (!group) return;
    const names = group[1].map(([name]) => name);
    setProdOrder(prev => ({ ...prev, [cat]: moveItem(names, from, to) }));
  }, []);
  const cardDrag = useCardDrag(reorderProduct);

  // ── Режим правки порядка ────────────────────────────────────────────────
  // Тащим прямо по странице: так видно результат, а не абстрактный список.
  // Порядок правим в состоянии сразу — сетка перестраивается под курсором;
  // на сервер уходит только по «Сохранить».
  const catNames = (accordionGroups || [])
    .map(([n]) => n)
    .filter(n => n !== 'Нет в наличии' && n !== 'Прочее');

  function startEdit() {
    // Снимок — то, что видно сейчас: автоматический порядок становится
    // отправной точкой, иначе первая же перестановка всё перемешала бы.
    const prods = {};
    (accordionGroups || []).forEach(([cat, items]) => { prods[cat] = items.map(([n]) => n); });
    snapshot.current = { cats: catOrder, prods: prodOrder };
    setCatOrder(catNames);
    setProdOrder(prods);
    setEditMode(true);
  }

  function cancelEdit() {
    if (snapshot.current) { setCatOrder(snapshot.current.cats); setProdOrder(snapshot.current.prods); }
    snapshot.current = null;
    setEditMode(false);
  }

  async function saveEdit() {
    setSaving(true);
    try {
      const r = await adminSaveSetLayout(brandKey, setSlug, catOrder, prodOrder);
      setCatOrder(r.data.categories || catOrder);
      setProdOrder(r.data.products || prodOrder);
      snapshot.current = null;
      setEditMode(false);
    } catch (e) {
      alert('Не удалось сохранить порядок: ' + (e.response?.data?.message || e.message));
    } finally { setSaving(false); }
  }

  // Категорию двигаем стрелками: их в сете единицы, и тащить целую секцию
  // мимо десятков карточек неудобно. Сами карточки — перетаскиванием.
  const moveCategory = (name, dir) => {
    const from = catOrder.indexOf(name);
    const to   = from + dir;
    if (from < 0 || to < 0 || to >= catOrder.length) return;
    setCatOrder(moveItem(catOrder, from, to));
  };

  // Удаление товара из каталога. Карточка на витрине — это модель, у неё может
  // быть несколько вариантов (цвета) с разными id, поэтому сносим все: иначе
  // карточка осталась бы на месте, но с урезанным набором.
  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      for (const v of toDelete.variants) await adminDeleteProduct(v._id);
      const gone = new Set(toDelete.variants.map(v => String(v._id)));
      setProducts(prev => prev.filter(p => !gone.has(String(p._id))));
      setToDelete(null);
    } catch (e) {
      alert('Не удалось удалить: ' + (e.response?.data?.error || e.response?.data?.message || e.message));
    } finally { setDeleting(false); }
  }



  const [openGroups, setOpenGroups] = useState({});

  // Разделение на товары в наличии и без
  // "В наличии" = stock > 0 ИЛИ inStock ИЛИ isOnOrder ИЛИ inTransit
  const { inStockModels, outOfStockModels } = useMemo(() => {
    const inStock = [];
    const outOfStock = [];
    models.forEach(([name, variants]) => {
      const p = variants[0];
      const isAvailable = isProductAvailable(p, country);
      if (isAvailable) {
        inStock.push([name, variants]);
      } else {
        outOfStock.push([name, variants]);
      }
    });
    return {
      inStockModels:    sortModelsInGroup(inStock, country, true),
      outOfStockModels: sortModelsInGroup(outOfStock, country, true),
    };
  }, [models, country]);

  const { visible, sentinelRef, hasMore } = useLazyItems(inStockModels, 24, scrollRef.current);

  const priceLabel = getPriceLabel(priceMode);

  // On desktop — full screen (covers sidebar too); on mobile — full screen
  const panelStyle = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: '#f7f8fa', zIndex: 1500,
    display: 'flex', flexDirection: 'column',
  };

  return createPortal(
    <>
      {/* Mobile-only backdrop tap-to-close */}
      {isMobile && (
        <div onClick={onClose}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.35)', zIndex: 1499 }} />
      )}

      <div style={panelStyle}>

        {/* Header */}
        <div style={{
          background: '#fff',
          borderBottom: '1px solid #eee',
          flexShrink: 0,
          position: 'relative',
          zIndex: 10,
        }}>
          {/* Row 1: Back, Title, Stats, Price toggle, View toggle */}
          <div style={{
            padding: isMobile ? '10px 12px' : '0 20px',
            height: isMobile ? 'auto' : 56,
            display: 'flex',
            alignItems: 'center',
            gap: isMobile ? 8 : 12,
          }}>
            <button onClick={onClose}
              style={{
                background: isMobile ? '#f5f5f5' : 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: isMobile ? 18 : 22,
                color: '#555',
                padding: isMobile ? '8px 10px' : '0 4px',
                flexShrink: 0,
                lineHeight: 1,
                borderRadius: isMobile ? 8 : 0,
              }}>
              ←
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontWeight: 800,
                fontSize: isMobile ? 16 : 18,
                color: '#111',
                lineHeight: 1.2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {titleOverride || toTitle(setSlug)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 2 }}>
                {BRAND_META[brandKey]?.label && (
                  <span style={{ fontSize: 11, color: accent, fontWeight: 600 }}>
                    {BRAND_META[brandKey].label}
                  </span>
                )}
                {/* Каталог другой страны — иначе пустой сет выглядит поломкой */}
                {country !== 'KG' && (
                  <button onClick={() => switchCountry('KG')} title="Вернуться к каталогу Кыргызстана"
                    style={{ fontSize: 10.5, fontWeight: 700, color: '#8a6d1f', background: '#fff6e0',
                      border: '1px solid #f0dca8', borderRadius: 5, padding: '1px 6px', cursor: 'pointer' }}>
                    🇰🇿 каталог Казахстана
                  </button>
                )}
              </div>
            </div>

            {/* Stats inline - hide on mobile */}
            {!loading && !isMobile && (
              <div style={{ flexShrink: 0 }}>
                {renderStockStats(11)}
              </div>
            )}

            {/* Price toggle */}
            <div style={{ display: 'flex', gap: 0, background: '#f5f5f5', borderRadius: 8, padding: 3, flexShrink: 0 }}>
              {PRICE_MODES.map(m => (
                <button key={m.key} onClick={() => setPriceMode(m.key)} style={{
                  padding: isMobile ? '5px 8px' : '4px 10px',
                  borderRadius: 6,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: isMobile ? 10 : 11,
                  fontWeight: 600,
                  background: priceMode === m.key ? accent : 'transparent',
                  color: priceMode === m.key ? '#fff' : '#888',
                }}>{m.short}</button>
              ))}
            </div>

            {/* View toggle */}
            <button onClick={toggleView} title={viewMode === 'grid' ? 'Список' : 'Сетка'} style={{
              padding: isMobile ? '6px 10px' : '5px 10px',
              borderRadius: 6,
              border: '1.5px solid #e0e0e0',
              background: '#fff',
              cursor: 'pointer',
              fontSize: isMobile ? 14 : 16,
              color: '#555',
              lineHeight: 1,
              flexShrink: 0,
            }}>
              {viewMode === 'grid' ? '☰' : '⊞'}
            </button>

            {/* Порядок правится владельцем прямо на странице, без правки кода.
                Только на десктопе: перетаскивание на тач-экране не работает. */}
            {!isMobile && canEdit && accordionGroups && !editMode && (
              <button onClick={startEdit} title="Изменить порядок категорий и товаров" style={{
                padding: '7px 12px', borderRadius: 9, cursor: 'pointer',
                border: '1.5px solid #e0e0e0', background: '#fff',
                color: '#555', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
              }}>✎ Порядок</button>
            )}
            {!isMobile && canEdit && editMode && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={cancelEdit} style={{
                  padding: '7px 12px', borderRadius: 9, cursor: 'pointer',
                  border: '1.5px solid #e0e0e0', background: '#fff',
                  color: '#555', fontSize: 12, fontWeight: 600,
                }}>Отмена</button>
                <button onClick={saveEdit} disabled={saving} style={{
                  padding: '7px 14px', borderRadius: 9, cursor: saving ? 'default' : 'pointer',
                  border: 'none', background: saving ? '#9bb3d4' : '#3463A3',
                  color: '#fff', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                }}>{saving ? 'Сохраняю...' : 'Сохранить порядок'}</button>
              </div>
            )}

            {/* PDF button on desktop */}
            {!isMobile && (
              setSlug === TUBES_SET
                ? <TubesPdfButton products={shownProducts} />
                : <AdminPdfButton products={shownProducts} groups={accordionGroups} label={titleOverride || toTitle(setSlug)} priceMode={priceMode} currency={CURRENCY[country] || CURRENCY.KG} />
            )}
          </div>

          {/* Row 2 on mobile: Stats + PDF button */}
          {isMobile && (
            <div style={{
              padding: '8px 12px',
              borderTop: '1px solid #f0f0f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}>
              {!loading && renderStockStats(11)}
              {setSlug === TUBES_SET
                ? <TubesPdfButton products={shownProducts} />
                : <AdminPdfButton products={shownProducts} groups={accordionGroups} label={titleOverride || toTitle(setSlug)} priceMode={priceMode} currency={CURRENCY[country] || CURRENCY.KG} />}
            </div>
          )}

          {/* Поиск по этому сету — отдельной строкой, чтобы не тесниться в шапке */}
          {!loading && (
            <div style={{
              padding: isMobile ? '8px 12px' : '10px 20px',
              borderTop: '1px solid #f0f0f0',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{ position: 'relative', flex: 1, maxWidth: isMobile ? 'none' : 420 }}>
                <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
                  fontSize: 13, color: '#9aa5b1', pointerEvents: 'none' }}>🔍</span>
                <input
                  type="search"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') setQuery(''); }}
                  placeholder={`Поиск в «${titleOverride || toTitle(setSlug)}» — название, артикул, размер`}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: isMobile ? '8px 30px 8px 32px' : '7px 30px 7px 32px',
                    borderRadius: 9, border: '1.5px solid #e5e7eb', outline: 'none',
                    fontSize: isMobile ? 13 : 13.5, fontFamily: 'inherit', background: '#fff',
                  }}
                  onFocus={e => { e.target.style.borderColor = accent; }}
                  onBlur={e => { e.target.style.borderColor = '#e5e7eb'; }}
                />
                {query && (
                  <button onClick={() => setQuery('')} title="Очистить (Esc)"
                    style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                      width: 20, height: 20, borderRadius: 6, border: 'none', background: '#eef1f4',
                      color: '#64748b', fontSize: 12, lineHeight: 1, cursor: 'pointer' }}>✕</button>
                )}
              </div>
              {query && (
                <span style={{ fontSize: 12, color: models.length ? '#5b6572' : '#c0392b', whiteSpace: 'nowrap' }}>
                  {models.length ? `Найдено: ${models.length} поз.` : 'Ничего не найдено'}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Product grid — scrollable */}
        <div ref={scrollRef} style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
          padding: isMobile ? '12px 10px' : '20px 24px',
        }}>
          {loading ? (
            <div style={{ color: '#aaa', fontSize: 14, textAlign: 'center', paddingTop: 60 }}>Загрузка…</div>
          ) : models.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: 60, color: '#bbb', fontSize: 14 }}>
              {query ? (
                <>
                  <div>По запросу «{query}» в этом сете ничего нет.</div>
                  <button onClick={() => setQuery('')}
                    style={{ marginTop: 12, padding: '7px 14px', fontSize: 13, fontWeight: 600, color: '#fff',
                      background: accent, border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                    Показать все товары
                  </button>
                </>
              ) : country === 'KZ' ? (
                <>
                  <div style={{ fontSize: 15, color: '#888' }}>В каталоге Казахстана этих товаров нет</div>
                  <div style={{ marginTop: 6, fontSize: 12.5 }}>
                    Казахстан показывает только то, что заведено в базе Q-top — здесь таких позиций нет.
                  </div>
                  <button onClick={() => switchCountry('KG')}
                    style={{ marginTop: 14, padding: '7px 14px', fontSize: 13, fontWeight: 600, color: '#fff',
                      background: accent, border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                    🇰🇬 Показать каталог Кыргызстана
                  </button>
                </>
              ) : 'Нет товаров'}
            </div>
          ) : viewMode === 'list' && accordionGroups ? (
            /* Animated Accordion for tubes (dayar-tutuk) */
            <>
              <style>{`
                @keyframes tubeAccordionSlideIn {
                  from { opacity: 0; transform: translateY(-8px); }
                  to { opacity: 1; transform: translateY(0); }
                }
                @keyframes tubeItemFadeIn {
                  from { opacity: 0; transform: translateX(-12px); }
                  to { opacity: 1; transform: translateX(0); }
                }
                @keyframes tubePulse {
                  0%, 100% { box-shadow: 0 0 0 0 rgba(38, 120, 70, 0.2); }
                  50% { box-shadow: 0 0 0 4px rgba(38, 120, 70, 0); }
                }
                .tube-accordion-group {
                  border: 1px solid #e0e0e0;
                  border-radius: 14px;
                  overflow: hidden;
                  background: linear-gradient(135deg, #fff 0%, #fafbfc 100%);
                  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
                  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .tube-accordion-group:hover {
                  box-shadow: 0 4px 16px rgba(0,0,0,0.08);
                  border-color: #c8d4c8;
                }
                .tube-accordion-header {
                  display: flex;
                  align-items: center;
                  justify-content: space-between;
                  padding: 14px 18px;
                  cursor: pointer;
                  background: linear-gradient(135deg, #f8faf8 0%, #f0f4f0 100%);
                  transition: all 0.25s ease;
                  position: relative;
                  overflow: hidden;
                }
                .tube-accordion-header::before {
                  content: '';
                  position: absolute;
                  left: 0;
                  top: 0;
                  height: 100%;
                  width: 4px;
                  background: linear-gradient(180deg, #267846 0%, #3a9d5c 100%);
                  transform: scaleY(0);
                  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .tube-accordion-header.open::before {
                  transform: scaleY(1);
                }
                .tube-accordion-header:hover {
                  background: linear-gradient(135deg, #f0f7f0 0%, #e8f2e8 100%);
                }
                .tube-accordion-header.open {
                  background: linear-gradient(135deg, #e8f5e9 0%, #dceedd 100%);
                  border-bottom: 1px solid #c8e6c9;
                }
                .tube-accordion-icon {
                  width: 28px;
                  height: 28px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  background: linear-gradient(135deg, #267846 0%, #2d8a50 100%);
                  border-radius: 8px;
                  color: #fff;
                  font-size: 12px;
                  font-weight: 700;
                  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
                  box-shadow: 0 2px 6px rgba(38, 120, 70, 0.3);
                }
                .tube-accordion-icon.open {
                  transform: rotate(90deg);
                  background: linear-gradient(135deg, #1b5e20 0%, #267846 100%);
                }
                .tube-accordion-title {
                  font-size: 15px;
                  font-weight: 700;
                  color: #1a3d1a;
                  letter-spacing: -0.3px;
                  transition: color 0.2s;
                }
                .tube-accordion-header:hover .tube-accordion-title {
                  color: #267846;
                }
                .tube-accordion-badge {
                  font-size: 11px;
                  font-weight: 600;
                  color: #fff;
                  background: linear-gradient(135deg, #78909c 0%, #607d8b 100%);
                  padding: 3px 10px;
                  border-radius: 12px;
                  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                  transition: all 0.25s;
                }
                .tube-accordion-header.open .tube-accordion-badge {
                  background: linear-gradient(135deg, #267846 0%, #2d8a50 100%);
                }
                .tube-accordion-content {
                  max-height: 0;
                  overflow: hidden;
                  transition: max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                  background: #fff;
                }
                .tube-accordion-content.open {
                  max-height: 2000px;
                }
                .tube-item {
                  display: flex;
                  align-items: center;
                  gap: 12px;
                  padding: 10px 14px;
                  border-bottom: 1px solid #f0f0f0;
                  cursor: pointer;
                  transition: all 0.2s ease;
                  position: relative;
                }
                .tube-item:last-child {
                  border-bottom: none;
                }
                .tube-item::after {
                  content: '';
                  position: absolute;
                  left: 0;
                  top: 0;
                  bottom: 0;
                  width: 0;
                  background: linear-gradient(90deg, rgba(38, 120, 70, 0.08) 0%, transparent 100%);
                  transition: width 0.3s ease;
                }
                .tube-item:hover::after {
                  width: 100%;
                }
                .tube-item:hover {
                  background: #f8faf8;
                }
                .tube-item:active {
                  transform: scale(0.995);
                }
                .tube-item-img {
                  width: 48px;
                  height: 48px;
                  object-fit: cover;
                  border-radius: 10px;
                  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
                  transition: transform 0.2s, box-shadow 0.2s;
                  position: relative;
                  z-index: 1;
                }
                .tube-item:hover .tube-item-img {
                  transform: scale(1.05);
                  box-shadow: 0 4px 12px rgba(0,0,0,0.12);
                }
                .tube-item-name {
                  font-size: 13px;
                  font-weight: 600;
                  color: #222;
                  transition: color 0.2s;
                  position: relative;
                  z-index: 1;
                }
                .tube-item:hover .tube-item-name {
                  color: #267846;
                }
                .tube-item-price {
                  font-size: 13px;
                  font-weight: 800;
                  transition: transform 0.2s;
                  position: relative;
                  z-index: 1;
                }
                .tube-item:hover .tube-item-price {
                  transform: scale(1.05);
                }
                .tube-stock-badge {
                  font-size: 10px;
                  font-weight: 700;
                  padding: 4px 10px;
                  border-radius: 6px;
                  transition: all 0.2s;
                  position: relative;
                  z-index: 1;
                }
                .tube-stock-badge.in-stock {
                  background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%);
                  color: #2d7a3a;
                }
                .tube-stock-badge.out-stock {
                  background: linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%);
                  color: #c62828;
                }
              `}</style>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {accordionGroups.map(([groupName, items], groupIdx) => {
                  const isOpen = openGroups[groupName] ?? false;
                  const isOutOfStockGroup = groupName === 'Нет в наличии';
                  const byTubeSize = setSlug === TUBES_SET
                    && new Set(items.map(([, v]) => tubeSizeOf(v[0]))).size > 1;
                  return (
                    <div
                      key={groupName}
                      className="tube-accordion-group"
                      style={{ animation: `tubeAccordionSlideIn 0.4s ease ${groupIdx * 0.08}s both`, marginTop: isOutOfStockGroup ? 24 : 0 }}
                    >
                      <div
                        className={`tube-accordion-header ${isOpen ? 'open' : ''}`}
                        onClick={() => setOpenGroups(prev => ({ ...prev, [groupName]: !prev[groupName] }))}
                        style={{ opacity: isOutOfStockGroup ? 0.7 : 1 }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div className={`tube-accordion-icon ${isOpen ? 'open' : ''}`}>▶</div>
                          {editMode && !isOutOfStockGroup && groupName !== 'Прочее' && (
                            <MoveArrows
                              onUp={() => moveCategory(groupName, -1)}
                              onDown={() => moveCategory(groupName, 1)}
                              canUp={catOrder.indexOf(groupName) > 0}
                              canDown={catOrder.indexOf(groupName) < catOrder.length - 1}
                            />
                          )}
                          <span className="tube-accordion-title">{groupName}</span>
                        </div>
                        <span className="tube-accordion-badge">{items.length} шт</span>
                      </div>
                      <div className={`tube-accordion-content ${isOpen ? 'open' : ''}`}>
                        {items.map(([name, variants], itemIdx) => {
                          const primary = variants[0];
                          const size = byTubeSize ? tubeSizeOf(primary) : '';
                          const sizeHead = size && size !== (itemIdx > 0 ? tubeSizeOf(items[itemIdx - 1][1][0]) : null);
                          const price = getPrice(primary, priceMode);
                          const stockInfo = getStockInfo(primary, country);
                          const hasStock = stockInfo.hasStock;
                          const stockLabel = stockInfo.label;
                          return (
                            <Fragment key={name}>
                            {sizeHead && (
                              <div style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '10px 14px 6px', fontSize: 12, fontWeight: 700,
                                color: '#6b7684', letterSpacing: 0.4,
                              }}>
                                {size}
                                <span style={{ flex: 1, height: 1, background: '#ececec' }} />
                              </div>
                            )}
                            <div
                              ref={el => cardDrag.register(groupName, itemIdx, el)}
                              className="tube-item"
                              onClick={() => { if (!editMode) setDetailProduct(primary); }}
                              onPointerDown={editMode ? cardDrag.start(groupName, itemIdx) : undefined}
                              style={{ animation: isOpen ? `tubeItemFadeIn 0.3s ease ${itemIdx * 0.03}s both` : 'none',
                                opacity: isOutOfStockGroup ? 0.5 : 1,
                                cursor: editMode ? 'grab' : 'pointer',
                                touchAction: editMode ? 'none' : undefined,
                                ...(cardDrag.styleFor(groupName, itemIdx) || {}) }}
                            >
                              <ProductImage product={primary} size={80} className="tube-item-img" />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div className="tube-item-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {name}
                                </div>
                              </div>
                              <div
                                className="tube-item-price"
                                style={{
                                  color: primary.priceUndefined ? '#888' : accent,
                                  fontStyle: primary.priceUndefined ? 'italic' : 'normal'
                                }}
                              >
                                {primary.priceUndefined ? 'Цена не определена' : fmtPrice(price, country)}
                              </div>
                              {editMode && (
                                <button
                                  title="Удалить товар из каталога"
                                  onClick={e => { e.stopPropagation(); setToDelete({ name, variants }); }}
                                  style={{
                                    width: 26, height: 26, borderRadius: '50%', border: 'none',
                                    background: '#d64545', color: '#fff', fontSize: 15, lineHeight: 1,
                                    fontWeight: 700, cursor: 'pointer', padding: 0, flexShrink: 0,
                                  }}
                                >×</button>
                              )}
                              <div className={`tube-stock-badge ${hasStock ? 'in-stock' : 'out-stock'}`}>
                                {stockLabel}
                              </div>
                            </div>
                            </Fragment>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : viewMode === 'list' ? (
            <div style={{ border: '1px solid #eee', borderRadius: 8, overflow: 'hidden' }}>
              {visible.map(([name, variants]) => {
                const primary  = variants[0];
                const price    = getPrice(primary, priceMode);
                const stockInfo = getStockInfo(primary, country);
                const stockLabel = stockInfo.label;
                return (
                  <div key={name} onClick={() => setDetailProduct(primary)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px',
                      borderBottom: '1px solid #f0f0f0', background: '#fff', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f7f8fa'}
                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                  >
                    <ProductImage product={primary} size={44} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <SupplierBadge product={primary} size="small" />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
                      </div>
                      {primary.sku && <div style={{ fontSize: 10, color: '#ccc' }}>{primary.sku}</div>}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: primary.priceUndefined ? '#888' : accent, flexShrink: 0, fontStyle: primary.priceUndefined ? 'italic' : 'normal' }}>
                      {primary.priceUndefined ? 'Цена не определена' : fmtPrice(price, country)}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 5, flexShrink: 0,
                      background: stockInfo.bg, color: stockInfo.color }}>
                      {stockLabel}
                    </div>
                  </div>
                );
              })}
              {hasMore && <div ref={sentinelRef} style={{ height: 20 }} />}
            </div>
          ) : accordionGroups ? (
            /* Grid view with category sections */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {editMode && (
                <div style={{
                  background: '#eef2f7', border: '1px solid #d6e0ec', borderRadius: 10,
                  padding: '9px 12px', fontSize: 12, color: '#3c5a80', lineHeight: 1.5,
                }}>
                  Тащите карточку на новое место — соседи расступятся и покажут, куда она встанет.
                  Стрелки ▲▼ у заголовка переставляют всю категорию. Между категориями товары
                  не переносятся: категория задаётся в карточке товара. Крестик удаляет товар
                  из каталога. Порядок сохранится только по кнопке «Сохранить порядок».
                </div>
              )}
              {accordionGroups.map(([groupName, items]) => {
                const isOutOfStock = groupName === 'Нет в наличии';
                // Разбивка по сечению нужна только там, где сечений в категории несколько
                const byTubeSize = setSlug === TUBES_SET
                  && new Set(items.map(([, v]) => tubeSizeOf(v[0]))).size > 1;
                // «Прочее» и «Нет в наличии» всегда последние — их не двигаем.
                const catDraggable = editMode && !isOutOfStock && groupName !== 'Прочее';
                return (
                <div key={groupName} style={{ marginTop: isOutOfStock ? 24 : 0 }}>
                  <div style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color: isOutOfStock ? '#999' : '#1c1c1c',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    marginBottom: 12,
                    paddingBottom: 8,
                    borderBottom: `2px solid ${isOutOfStock ? '#e0e0e0' : accent}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    background: catDraggable ? '#fbfcfd' : 'transparent',
                  }}>
                    {catDraggable && (
                      <MoveArrows
                        onUp={() => moveCategory(groupName, -1)}
                        onDown={() => moveCategory(groupName, 1)}
                        canUp={catOrder.indexOf(groupName) > 0}
                        canDown={catOrder.indexOf(groupName) < catOrder.length - 1}
                      />
                    )}
                    {groupName}
                    <span style={{ fontSize: 12, fontWeight: 500, color: '#999' }}>{items.length} тов.</span>
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: isMobile ? 10 : 16,
                  }}>
                    {items.map(([name, variants], idx) => {
                      const primary    = variants[0];
                      const size       = byTubeSize ? tubeSizeOf(primary) : '';
                      const sizeHead   = size && size !== (idx > 0 ? tubeSizeOf(items[idx - 1][1][0]) : null);
                      const price      = getPrice(primary, priceMode);
                      const stockInfo  = getStockInfo(primary, country);
                      const stockLabel = stockInfo.label;
                      const showBadge  = STATUS_BADGE[primary.productStatus];
                      const hasColorOnly = primary.color && !primary.images?.[0];
                      const cardOpacity = isOutOfStock ? 0.5 : (stockInfo.isKitMissing ? 0.5 : 1);
                      return (
                        <Fragment key={name}>
                        {sizeHead && (
                          <div style={{
                            gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 10,
                            marginTop: idx ? 8 : 0, fontSize: 12, fontWeight: 700,
                            color: '#6b7684', letterSpacing: 0.4,
                          }}>
                            {size}
                            <span style={{ flex: 1, height: 1, background: '#ececec' }} />
                          </div>
                        )}
                        <div
                          ref={el => cardDrag.register(groupName, idx, el)}
                          // В режиме правки карточка тащится, а не открывается:
                          // иначе каждое перетаскивание кончалось бы модалкой товара.
                          onClick={() => { if (!editMode) setDetailProduct(primary); }}
                          onPointerDown={editMode ? cardDrag.start(groupName, idx) : undefined}
                          className={editMode ? 'set-jiggle' : undefined}
                          style={{ border: '1px solid #e8e8e8', borderRadius: 12, overflow: 'hidden',
                            background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,.05)',
                            cursor: editMode ? 'grab' : 'pointer', transition: 'box-shadow .15s',
                            opacity: cardOpacity, position: 'relative',
                            // на тач-экране палец должен тащить карточку, а не листать страницу
                            touchAction: editMode ? 'none' : undefined,
                            // Фазу качания сдвигаем по позиции, иначе вся сетка
                            // дёргается синхронно и это читается как дрожь экрана.
                            animationDelay: `${(idx % 7) * 45}ms`,
                            ...(cardDrag.styleFor(groupName, idx) || {}) }}
                          onMouseEnter={e => { if (editMode) return; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,.12)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                          onMouseLeave={e => { if (editMode) return; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,.05)';  e.currentTarget.style.transform = 'none'; }}
                        >
                          {editMode && (
                            <button
                              className="set-del"
                              title="Удалить товар из каталога"
                              onPointerDown={e => e.stopPropagation()}
                              onClick={e => { e.stopPropagation(); setToDelete({ name, variants }); }}
                            >×</button>
                          )}
                          <div style={{ aspectRatio: '1', overflow: 'hidden', background: hasColorOnly ? primary.color : '#f8f8f8', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {!hasColorOnly && (
                              <img src={cloudinaryOpt(primary.images?.[0] || NO_PHOTO, 400)} alt={name}
                                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                                onError={e => { e.target.src = NO_PHOTO; }} />
                            )}
                            {primary.isSupplied && (
                              // В режиме правки левый верхний угол занят крестиком —
                              // сдвигаем бейдж вниз, чтобы не перекрывали друг друга.
                              <div style={{ position: 'absolute', top: editMode ? 36 : 6, left: 6 }}>
                                <SupplierBadge product={primary} />
                              </div>
                            )}
                            {showBadge && (
                              <div style={{ position: 'absolute', top: 6, right: 6 }}>
                                <StatusBadge product={primary} />
                              </div>
                            )}
                          </div>
                          <div style={{ padding: '10px 11px' }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#111', lineHeight: 1.3,
                              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                              {name}
                            </div>
                            {variants.length > 1 && <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>{variants.length} вариантов</div>}
                            {primary.specs?.slice(0, 2).map(s => (
                              <div key={s.key} style={{ fontSize: 10, color: '#888', marginTop: 2, lineHeight: 1.2 }}>
                                <span style={{ color: '#bbb' }}>{s.key}:</span> {s.value}
                              </div>
                            ))}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 }}>
                              <div>
                                {primary.isKit && primary.kitType === 'independent' ? (
                                  <div style={{ fontSize: 11, color: '#7c3aed', fontStyle: 'italic' }}>Цены в деталях</div>
                                ) : primary.priceUndefined ? (
                                  <div style={{ fontSize: 11, color: '#888', fontStyle: 'italic' }}>Цена не определена</div>
                                ) : (
                                  <>
                                    <div style={{ fontSize: 9, color: '#aaa', fontWeight: 500, lineHeight: 1 }}>{priceLabel}</div>
                                    <div style={{ fontSize: 14, fontWeight: 800, color: accent, lineHeight: 1.2 }}>
                                      {fmtPrice(price, country)}
                                    </div>
                                  </>
                                )}
                              </div>
                              <div style={{ fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 5,
                                background: stockInfo.bg, color: stockInfo.color }}>
                                {stockLabel}
                              </div>
                            </div>
                            {primary.sku && <div style={{ fontSize: 9, color: '#ccc', marginTop: 2 }}>{primary.sku}</div>}
                          </div>
                        </div>
                        </Fragment>
                      );
                    })}
                  </div>
                </div>
              );})}
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: isMobile ? 10 : 16,
            }}>
              {visible.map(([name, variants]) => {
                const primary    = variants[0];
                const price      = getPrice(primary, priceMode);
                const stockInfo  = getStockInfo(primary, country);
                const stockLabel = stockInfo.label;
                const showBadge  = STATUS_BADGE[primary.productStatus];
                const hasColorOnly = primary.color && !primary.images?.[0];
                return (
                  <div key={name} onClick={() => setDetailProduct(primary)}
                    style={{ border: '1px solid #e8e8e8', borderRadius: 12, overflow: 'hidden',
                      background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,.05)',
                      cursor: 'pointer', transition: 'box-shadow .15s, transform .15s',
                      opacity: stockInfo.isKitMissing ? 0.5 : 1 }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,.12)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,.05)';  e.currentTarget.style.transform = 'none'; }}
                  >
                    <div style={{ aspectRatio: '1', overflow: 'hidden', background: hasColorOnly ? primary.color : '#f8f8f8', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {!hasColorOnly && (
                        <img src={cloudinaryOpt(primary.images?.[0] || NO_PHOTO, 400)} alt={name}
                          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                          onError={e => { e.target.src = NO_PHOTO; }} />
                      )}
                      {primary.isSupplied && (
                        <div style={{ position: 'absolute', top: 6, left: 6 }}>
                          <SupplierBadge product={primary} />
                        </div>
                      )}
                      {showBadge && (
                        <div style={{ position: 'absolute', top: 6, right: 6 }}>
                          <StatusBadge product={primary} />
                        </div>
                      )}
                    </div>
                    <div style={{ padding: '10px 11px' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#111', lineHeight: 1.3,
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {name}
                      </div>
                      {variants.length > 1 && <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>{variants.length} вариантов</div>}
                      {primary.specs?.slice(0, 2).map(s => (
                        <div key={s.key} style={{ fontSize: 10, color: '#888', marginTop: 2, lineHeight: 1.2 }}>
                          <span style={{ color: '#bbb' }}>{s.key}:</span> {s.value}
                        </div>
                      ))}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 }}>
                        <div>
                          {primary.isKit && primary.kitType === 'independent' ? (
                            <div style={{ fontSize: 11, color: '#7c3aed', fontStyle: 'italic' }}>Цены в деталях</div>
                          ) : primary.priceUndefined ? (
                            <div style={{ fontSize: 11, color: '#888', fontStyle: 'italic' }}>Цена не определена</div>
                          ) : (
                            <>
                              <div style={{ fontSize: 9, color: '#aaa', fontWeight: 500, lineHeight: 1 }}>{priceLabel}</div>
                              <div style={{ fontSize: 14, fontWeight: 800, color: accent, lineHeight: 1.2 }}>
                                {fmtPrice(price, country)}
                              </div>
                            </>
                          )}
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 5,
                          background: stockInfo.bg, color: stockInfo.color }}>
                          {stockLabel}
                        </div>
                      </div>
                      {primary.sku && <div style={{ fontSize: 9, color: '#ccc', marginTop: 2 }}>{primary.sku}</div>}
                    </div>
                  </div>
                );
              })}
              {hasMore && <div ref={sentinelRef} style={{ height: 20, gridColumn: '1 / -1' }} />}
            </div>
          )}

          {/* Секция "Нет в наличии" */}
          {!accordionGroups && outOfStockModels.length > 0 && (
            <>
              <div style={{
                marginTop: 32,
                marginBottom: 16,
                paddingBottom: 8,
                borderBottom: '2px solid #e0e0e0',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  НЕТ В НАЛИЧИИ
                </span>
                <span style={{ fontSize: 12, color: '#bbb' }}>{outOfStockModels.length} тов.</span>
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: isMobile ? 10 : 16,
              }}>
                {outOfStockModels.map(([name, variants]) => {
                  const primary    = variants[0];
                  const price      = getPrice(primary, priceMode);
                  const showBadge  = STATUS_BADGE[primary.productStatus];
                  const hasColorOnly = primary.color && !primary.images?.[0];
                  return (
                    <div key={name} onClick={() => setDetailProduct(primary)}
                      style={{ border: '1px solid #e8e8e8', borderRadius: 12, overflow: 'hidden',
                        background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,.05)',
                        cursor: 'pointer', transition: 'box-shadow .15s, transform .15s',
                        opacity: 0.5 }}
                      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,.12)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,.05)';  e.currentTarget.style.transform = 'none'; }}
                    >
                      <div style={{ aspectRatio: '1', overflow: 'hidden', background: hasColorOnly ? primary.color : '#f8f8f8', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {!hasColorOnly && (
                          <img src={cloudinaryOpt(primary.images?.[0] || NO_PHOTO, 400)} alt={name}
                            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                            onError={e => { e.target.src = NO_PHOTO; }} />
                        )}
                        {primary.isSupplied && (
                          <div style={{ position: 'absolute', top: 6, left: 6 }}>
                            <SupplierBadge product={primary} />
                          </div>
                        )}
                        {showBadge && (
                          <div style={{ position: 'absolute', top: 6, right: 6 }}>
                            <StatusBadge product={primary} />
                          </div>
                        )}
                      </div>
                      <div style={{ padding: '10px 11px' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#111', lineHeight: 1.3,
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {name}
                        </div>
                        {variants.length > 1 && <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>{variants.length} вариантов</div>}
                        {primary.specs?.slice(0, 2).map(s => (
                          <div key={s.key} style={{ fontSize: 10, color: '#888', marginTop: 2, lineHeight: 1.2 }}>
                            <span style={{ color: '#bbb' }}>{s.key}:</span> {s.value}
                          </div>
                        ))}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 }}>
                          <div>
                            {primary.priceUndefined ? (
                              <div style={{ fontSize: 11, color: '#888', fontStyle: 'italic' }}>Цена не определена</div>
                            ) : (
                              <>
                                <div style={{ fontSize: 9, color: '#aaa', fontWeight: 500, lineHeight: 1 }}>{priceLabel}</div>
                                <div style={{ fontSize: 14, fontWeight: 800, color: accent, lineHeight: 1.2 }}>
                                  {fmtPrice(price, country)}
                                </div>
                              </>
                            )}
                          </div>
                          <div style={{ fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 5,
                            background: '#fce8e8', color: '#c00' }}>
                            Нет
                          </div>
                        </div>
                        {primary.sku && <div style={{ fontSize: 9, color: '#ccc', marginTop: 2 }}>{primary.sku}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Product detail modal */}

      {toDelete && (

        <div

          onClick={() => !deleting && setToDelete(null)}

          style={{

            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000,

            background: 'rgba(17,20,24,.5)', display: 'flex',

            alignItems: 'center', justifyContent: 'center', padding: 16,

          }}

        >

          <div onClick={e => e.stopPropagation()} style={{

            background: '#fff', borderRadius: 14, width: 'min(420px, 100%)',

            padding: '20px 22px', boxShadow: '0 12px 40px rgba(0,0,0,.28)',

          }}>

            <div style={{ fontSize: 16, fontWeight: 800, color: '#111' }}>Точно удалить?</div>

            <div style={{ fontSize: 13, color: '#444', marginTop: 10, lineHeight: 1.55 }}>

              Товар <b>«{toDelete.name}»</b> будет удалён из каталога.

              {toDelete.variants.length > 1 && (

                <> Вместе с ним удалятся все <b>{toDelete.variants.length}</b> вариантов этой модели.</>

              )}

            </div>

            {/* Показываем артикулы: по названию модели легко снести не тот товар. */}

            <div style={{ fontSize: 11, color: '#8b98a5', marginTop: 8, lineHeight: 1.5 }}>

              {toDelete.variants.map(v => v.sku).filter(Boolean).join(' · ') || 'без артикула'}

            </div>

            <div style={{ fontSize: 11, color: '#c0392b', marginTop: 10 }}>

              Отменить удаление нельзя.

            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>

              <button onClick={() => setToDelete(null)} disabled={deleting} style={{

                padding: '8px 14px', borderRadius: 9, border: '1.5px solid #e0e0e0',

                background: '#fff', color: '#555', fontSize: 13, fontWeight: 600,

                cursor: deleting ? 'default' : 'pointer',

              }}>Отмена</button>

              <button onClick={confirmDelete} disabled={deleting} style={{

                padding: '8px 16px', borderRadius: 9, border: 'none',

                background: deleting ? '#e0a0a0' : '#d64545', color: '#fff',

                fontSize: 13, fontWeight: 700, cursor: deleting ? 'default' : 'pointer',

              }}>{deleting ? 'Удаляю...' : 'Удалить'}</button>

            </div>

          </div>

        </div>

      )}


      {detailProduct && (
        <AdminProductModal product={detailProduct} country={country} onClose={() => setDetailProduct(null)}
          onDeleted={id => { setProducts(p => p.filter(x => x._id !== id)); setDetailProduct(null); }} />
      )}

      {/* Место, куда встанет карточка: рамка переезжает вслед за расступанием соседей */}
      {cardDrag.ghost && (
        <div style={{
          position: 'fixed', pointerEvents: 'none', zIndex: 28,
          left: cardDrag.ghost.left, top: cardDrag.ghost.top,
          width: cardDrag.ghost.width, height: cardDrag.ghost.height,
          border: '2px dashed #3463A3', borderRadius: 12,
          background: 'rgba(52,99,163,.07)',
          transition: 'left .18s ease, top .18s ease',
        }} />
      )}
    </>,
    document.body
  );
}

// ── ProchiyeSection ───────────────────────────────────────────────────────────

function ProchiyeSection() {
  const [catalogSlug, setCatalog] = useState(null);
  const [catalogTitle, setCatalogTitle] = useState('');
  const isMobile = useIsMobile();
  const accent   = '#555';
  const pad      = isMobile ? '20px 16px' : '32px 36px';

  function openCatalog(slug, label) {
    setCatalog(slug);
    setCatalogTitle(label);
  }

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: pad, boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: isMobile ? 36 : 46, fontWeight: 800, letterSpacing: -1, color: '#1c1c1c', lineHeight: 1 }}>
          ПРОЧИЕ
        </div>
        <div style={{ height: 3, width: 50, background: accent, borderRadius: 2, margin: '8px 0 6px' }} />
        <div style={{ fontSize: 12, color: '#6b8997' }}>
          Дополнительные категории товаров
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {PROCHIYE.map((item, i) => (
          <div key={item.slug}
            style={{ padding: '8px 10px', background: i % 2 === 0 ? '#f8f9fb' : '#fff', borderRadius: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 20, textAlign: 'right', fontWeight: 700, fontSize: 12, color: accent, flexShrink: 0 }}>
                {i + 1}
              </span>
              <span style={{ color: '#ccc', fontSize: 13 }}>|</span>
              <span onClick={() => openCatalog(item.slug, item.label)}
                style={{ fontSize: 13, color: '#1c1c1c', flex: 1, cursor: 'pointer',
                  textDecoration: 'underline', textDecorationStyle: 'dotted', textDecorationColor: '#bbb' }}>
                {item.label}
              </span>
            </div>
          </div>
        ))}
      </div>

      {catalogSlug && (
        <SetCatalogPanel
          brandKey={null}
          setSlug={catalogSlug}
          accentOverride={accent}
          titleOverride={catalogTitle}
          onClose={() => setCatalog(null)}
        />
      )}
    </div>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────

function btn(bg, color, bold) {
  return { padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
    background: bg, color, fontWeight: bold ? 700 : 500, fontSize: 13, whiteSpace: 'nowrap' };
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function AdminSets() {
  const [sets, setSets]     = useState({});
  const [loading, setLoad]  = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const { frontmen } = useFrontmen();
  const [country, setCountry] = useState(() => localStorage.getItem('adminSetsCountry') || 'KG');

  useEffect(() => { localStorage.setItem('adminSetsCountry', country); }, [country]);
  const countryCtx = useMemo(() => ({ country, setCountry }), [country]);

  // Читаем brand и set из URL
  const urlBrand = searchParams.get('brand');
  const urlSet = searchParams.get('set');

  function handleOpenCatalog(brand, set) {
    setSearchParams({ brand, set });
  }

  function handleCloseCatalog() {
    setSearchParams({});
  }

  const [brandCounts, setBrandCounts] = useState({});
  const [brandStats, setBrandStats]   = useState({});   // бренд → {inMod, outMod, inUnits, outUnits}

  useEffect(() => {
    setLoad(true);
    // Load sets for all brands from API
    Promise.all(
      Object.keys(BRAND_META).map(k =>
        adminGetFacets({ brand: k, country }).then(r => [k, {
          sets: r.data.sets.filter(s => !EXCLUDE.has(s)),
          count: r.data.productCount || 0,
          stockStats: r.data.stockStats || null,
        }])
      )
    ).then(res => {
      const setsObj = {};
      const countsObj = {};
      const statsObj = {};
      res.forEach(([k, data]) => {
        setsObj[k] = data.sets;
        countsObj[k] = data.count;
        statsObj[k] = data.stockStats;
      });
      setSets(setsObj);
      setBrandCounts(countsObj);
      setBrandStats(statsObj);
      setLoad(false);
    });
  }, [country]);

  const isKZ = country === 'KZ';

  return (
    <CountryCtx.Provider value={countryCtx}>
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#111' }}>Линейки сетов</div>
          <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>
            {isKZ
              ? 'Склад Q-top — остатки и учёт в Казахстане'
              : 'Каталог товаров по брендам и сетам'}
          </div>
        </div>
        {/* Страна учёта: у Казахстана свой склад (Q-top), с Кыргызстаном не смешивается */}
        <div style={{ display: 'inline-flex', background: '#f0f0ee', borderRadius: 10, padding: 3, gap: 3 }}>
          {COUNTRIES.map(c => (
            <button
              key={c.key}
              onClick={() => setCountry(c.key)}
              style={{
                padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
                background: country === c.key ? '#fff' : 'transparent',
                color:      country === c.key ? '#111' : '#888',
                boxShadow:  country === c.key ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
              }}
            >{c.flag} {c.label}</button>
          ))}
        </div>
      </div>
      {loading
        ? <div style={{ color: '#aaa', fontSize: 14 }}>Загрузка…</div>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {Object.entries(BRAND_META)
              // В казахстанском каталоге показываем только бренды, у которых есть товары Q-top
              .filter(([key]) => !isKZ || (brandCounts[key] || 0) > 0)
              .map(([key, meta]) => {
                const baseSets = sets[key] || [];
                return (
                  <BrandSection
                    key={key}
                    brandKey={key}
                    sets={baseSets}
                    accent={meta.accent}
                    subItems={SET_SUB_ITEMS}
                    autoOpenSet={urlBrand === key ? urlSet : null}
                    onOpenCatalog={handleOpenCatalog}
                    onCloseCatalog={handleCloseCatalog}
                    frontmen={frontmen}
                    productCount={brandCounts[key] || 0}
                    stockStats={brandStats[key] || null}
                  />
                );
              })}
            {isKZ && Object.keys(BRAND_META).every(k => (brandCounts[k] || 0) === 0) && (
              <div style={{ textAlign: 'center', padding: '48px 20px', background: '#fff', border: '1px solid #eee', borderRadius: 16 }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>🇰🇿</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#111', marginBottom: 6 }}>Товары Q-top ещё не загружены</div>
                <div style={{ fontSize: 13, color: '#999', maxWidth: 420, margin: '0 auto' }}>
                  Загрузите остатки базы Q-top на дашборде — товары казахстанского склада появятся здесь.
                </div>
              </div>
            )}
          </div>
        )
      }
    </div>
    </CountryCtx.Provider>
  );
}
