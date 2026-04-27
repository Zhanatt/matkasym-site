// ================================
// МАТКАСЫМ — Products Data
// ================================

const PRODUCTS = [
  // LIVING ROOM
  {
    id: 1, name: 'КОМФОРТ', fullName: 'КОМФОРТ – Трёхместный диван',
    category: 'living', tags: ['popular','sale'],
    price: 189900, oldPrice: 249900,
    desc: 'Мягкий тканевый диван с деревянными ножками. Съёмные чехлы.',
    color: '#0058A3', icon: 'sofa', isNew: false, inStock: true
  },
  {
    id: 2, name: 'УЮТ', fullName: 'УЮТ – Кресло для отдыха',
    category: 'living', tags: ['popular'],
    price: 79900, oldPrice: null,
    desc: 'Удобное кресло с высокой спинкой для долгих вечеров дома.',
    color: '#003E7E', icon: 'chair', isNew: false, inStock: true
  },
  {
    id: 3, name: 'ЛАЙТ', fullName: 'ЛАЙТ – Журнальный столик',
    category: 'living', tags: ['new'],
    price: 34900, oldPrice: null,
    desc: 'Минималистичный столик из массива берёзы. 80×45×45 см.',
    color: '#8B6F47', icon: 'table', isNew: true, inStock: true
  },
  {
    id: 4, name: 'ПОЛКА', fullName: 'ПОЛКА – Книжный стеллаж',
    category: 'living', tags: ['popular'],
    price: 54900, oldPrice: 69900,
    desc: 'Открытый стеллаж для книг и декора. Сталь + МДФ.',
    color: '#555', icon: 'shelf', isNew: false, inStock: true
  },
  // BEDROOM
  {
    id: 5, name: 'МЕЧТА', fullName: 'МЕЧТА – Кровать 160×200',
    category: 'bedroom', tags: ['popular','sale'],
    price: 149900, oldPrice: 199900,
    desc: 'Кровать с мягким изголовьем и ламельным основанием. Лаконичный дизайн.',
    color: '#333', icon: 'bed', isNew: false, inStock: true
  },
  {
    id: 6, name: 'СОНЕТ', fullName: 'СОНЕТ – Матрас Pocket Spring 160×200',
    category: 'bedroom', tags: ['popular'],
    price: 119900, oldPrice: null,
    desc: 'Независимые пружины для идеальной поддержки. Высота 20 см.',
    color: '#E8E8F0', icon: 'mattress', isNew: false, inStock: true
  },
  {
    id: 7, name: 'ГАРДЕРОБ', fullName: 'ГАРДЕРОБ – Трёхдверный шкаф',
    category: 'bedroom', tags: ['new'],
    price: 129900, oldPrice: null,
    desc: 'Вместительный шкаф с зеркалом. Различные варианты наполнения.',
    color: '#8B6F47', icon: 'wardrobe', isNew: true, inStock: true
  },
  {
    id: 8, name: 'НОЧЬ', fullName: 'НОЧЬ – Прикроватная тумба',
    category: 'bedroom', tags: [],
    price: 29900, oldPrice: null,
    desc: 'Тумба с двумя ящиками и выдвижной полкой. Из массива сосны.',
    color: '#A0845C', icon: 'nightstand', isNew: false, inStock: true
  },
  // KITCHEN
  {
    id: 9, name: 'ОБЕД', fullName: 'ОБЕД – Обеденный стол 120×75',
    category: 'kitchen', tags: ['popular'],
    price: 69900, oldPrice: null,
    desc: 'Стол из закалённого стекла на стальном основании. Раскладной.',
    color: '#CCCCCC', icon: 'dining', isNew: false, inStock: true
  },
  {
    id: 10, name: 'СТУЛ', fullName: 'СТУЛ – Обеденный стул (2 шт.)',
    category: 'kitchen', tags: ['popular','sale'],
    price: 27900, oldPrice: 35900,
    desc: 'Пластиковые стулья в скандинавском стиле. Штабелируются.',
    color: '#FFDB00', icon: 'chair', isNew: false, inStock: true
  },
  {
    id: 11, name: 'КУХНЯ', fullName: 'КУХНЯ – Напольный шкаф 60×80',
    category: 'kitchen', tags: ['new'],
    price: 44900, oldPrice: null,
    desc: 'Кухонный модуль с доводчиком и полкой. Влагостойкое покрытие.',
    color: '#F5F5F5', icon: 'cabinet', isNew: true, inStock: true
  },
  {
    id: 12, name: 'ВЫДВИГ', fullName: 'ВЫДВИГ – Система хранения для кухни',
    category: 'kitchen', tags: [],
    price: 8900, oldPrice: null,
    desc: 'Модульный набор органайзеров для ящиков и шкафов. 5 предметов.',
    color: '#888', icon: 'organizer', isNew: false, inStock: true
  },
  // KIDS
  {
    id: 13, name: 'ДЕТКА', fullName: 'ДЕТКА – Кровать-чердак 90×200',
    category: 'kids', tags: ['popular','new'],
    price: 89900, oldPrice: null,
    desc: 'Двухъярусная кровать с лесенкой и местом для хранения.',
    color: '#D4374E', icon: 'bunkbed', isNew: true, inStock: true
  },
  {
    id: 14, name: 'ИГРА', fullName: 'ИГРА – Детский письменный стол',
    category: 'kids', tags: [],
    price: 39900, oldPrice: 49900,
    desc: 'Стол с регулируемой высотой для детей от 4 лет.',
    color: '#5A8A3C', icon: 'desk', isNew: false, inStock: true
  },
  // OFFICE
  {
    id: 15, name: 'ОФИС', fullName: 'ОФИС – Рабочий стол 140×70',
    category: 'office', tags: ['popular'],
    price: 59900, oldPrice: null,
    desc: 'Лаконичный рабочий стол с кабель-каналом. МДФ + металл.',
    color: '#333', icon: 'desk', isNew: false, inStock: true
  },
  {
    id: 16, name: 'КРЕСЛО', fullName: 'КРЕСЛО – Офисное кресло Ergon',
    category: 'office', tags: ['new','popular'],
    price: 99900, oldPrice: null,
    desc: 'Эргономичное кресло с поясничной поддержкой и регулируемыми подлокотниками.',
    color: '#111', icon: 'officechairs', isNew: true, inStock: true
  },
  // STORAGE
  {
    id: 17, name: 'КУБУС', fullName: 'КУБУС – Модульный стеллаж 4×4',
    category: 'storage', tags: ['popular'],
    price: 64900, oldPrice: 84900,
    desc: '16 открытых ячеек. Подходит для гостиной, спальни и детской.',
    color: '#0058A3', icon: 'shelf', isNew: false, inStock: true
  },
  {
    id: 18, name: 'ЯЩИК', fullName: 'ЯЩИК – Набор корзин для хранения (3 шт.)',
    category: 'storage', tags: [],
    price: 5900, oldPrice: null,
    desc: 'Плетёные корзины с крышкой. Три размера. 100% хлопок.',
    color: '#D4A96A', icon: 'basket', isNew: false, inStock: true
  },
  // DECOR
  {
    id: 19, name: 'ГОРШОК', fullName: 'ГОРШОК – Кашпо керамическое (набор 3 шт.)',
    category: 'decor', tags: ['new'],
    price: 7900, oldPrice: null,
    desc: 'Минималистичные кашпо ручной работы с поддонами. Матовая глазурь.',
    color: '#C8A07A', icon: 'plant', isNew: true, inStock: true
  },
  {
    id: 20, name: 'КАРТИНА', fullName: 'КАРТИНА – Постер 50×70 в раме',
    category: 'decor', tags: [],
    price: 12900, oldPrice: null,
    desc: 'Абстрактная печать на плотной бумаге. Рама из алюминия.',
    color: '#4A4A6A', icon: 'art', isNew: false, inStock: true
  },
];

// Helper: format price
function formatPrice(n) {
  return n.toLocaleString('ru-KZ') + ' ₸';
}

// Helper: generate product SVG placeholder
function productSVG(color, icon) {
  const iconMap = {
    sofa: `<rect x="20" y="55" width="160" height="60" rx="8" fill="${color}"/>
           <rect x="20" y="47" width="160" height="22" rx="6" fill="${color}" opacity=".7"/>
           <rect x="20" y="55" width="24" height="60" rx="6" fill="${color}" opacity=".7"/>
           <rect x="156" y="55" width="24" height="60" rx="6" fill="${color}" opacity=".7"/>
           <rect x="50" y="60" width="40" height="38" rx="5" fill="#FFDB00" opacity=".85"/>
           <rect x="100" y="60" width="40" height="38" rx="5" fill="#FFDB00" opacity=".7"/>`,
    chair: `<rect x="60" y="40" width="80" height="70" rx="8" fill="${color}"/>
            <rect x="60" y="105" width="20" height="30" rx="4" fill="${color}" opacity=".8"/>
            <rect x="120" y="105" width="20" height="30" rx="4" fill="${color}" opacity=".8"/>
            <rect x="55" y="35" width="10" height="80" rx="4" fill="${color}" opacity=".5"/>`,
    table: `<rect x="30" y="80" width="140" height="12" rx="4" fill="${color}"/>
            <rect x="55" y="92" width="10" height="35" fill="${color}" opacity=".7"/>
            <rect x="135" y="92" width="10" height="35" fill="${color}" opacity=".7"/>`,
    shelf: `<rect x="20" y="30" width="160" height="10" rx="3" fill="${color}"/>
            <rect x="20" y="80" width="160" height="10" rx="3" fill="${color}"/>
            <rect x="20" y="130" width="160" height="10" rx="3" fill="${color}"/>
            <rect x="20" y="30" width="10" height="120" rx="3" fill="${color}"/>
            <rect x="170" y="30" width="10" height="120" rx="3" fill="${color}"/>
            <rect x="40" y="45" width="15" height="30" fill="#D4374E" opacity=".8"/>
            <rect x="58" y="40" width="12" height="35" fill="#0058A3" opacity=".8"/>
            <rect x="73" y="48" width="18" height="27" fill="#FFDB00" opacity=".8"/>`,
    bed: `<rect x="20" y="70" width="160" height="60" rx="6" fill="${color}" opacity=".85"/>
          <rect x="20" y="60" width="40" height="70" rx="6" fill="${color}"/>
          <rect x="30" y="45" width="20" height="15" fill="${color}" opacity=".5"/>
          <rect x="40" y="65" width="130" height="20" rx="4" fill="#fff" opacity=".3"/>`,
    mattress: `<rect x="25" y="55" width="150" height="65" rx="10" fill="${color}"/>
               <line x1="25" y1="87" x2="175" y2="87" stroke="#0058A3" stroke-width="2"/>
               <circle cx="60" cy="71" r="4" fill="#0058A3" opacity=".5"/>
               <circle cx="100" cy="71" r="4" fill="#0058A3" opacity=".5"/>
               <circle cx="140" cy="71" r="4" fill="#0058A3" opacity=".5"/>`,
    wardrobe: `<rect x="25" y="25" width="150" height="135" rx="4" fill="${color}"/>
               <rect x="25" y="25" width="48" height="135" fill="${color}" opacity=".7"/>
               <rect x="127" y="25" width="48" height="135" fill="${color}" opacity=".7"/>
               <rect x="98" y="25" width="4" height="135" fill="#000" opacity=".1"/>
               <circle cx="70" cy="92" r="5" fill="#fff" opacity=".7"/>
               <circle cx="130" cy="92" r="5" fill="#fff" opacity=".7"/>`,
    nightstand: `<rect x="50" y="55" width="100" height="80" rx="6" fill="${color}"/>
                 <rect x="55" y="60" width="90" height="35" rx="3" fill="${color}" opacity=".7"/>
                 <circle cx="100" cy="78" r="5" fill="#fff" opacity=".6"/>`,
    dining: `<rect x="30" y="75" width="140" height="10" rx="3" fill="${color}"/>
             <rect x="45" y="85" width="8" height="40" fill="${color}" opacity=".7"/>
             <rect x="147" y="85" width="8" height="40" fill="${color}" opacity=".7"/>
             <rect x="40" y="40" width="30" height="65" rx="6" fill="#8B6F47" opacity=".5"/>
             <rect x="130" y="40" width="30" height="65" rx="6" fill="#8B6F47" opacity=".5"/>`,
    cabinet: `<rect x="40" y="30" width="120" height="130" rx="4" fill="${color}"/>
              <rect x="45" y="35" width="110" height="58" rx="2" fill="#fff" opacity=".1"/>
              <rect x="45" y="97" width="110" height="58" rx="2" fill="#fff" opacity=".1"/>
              <circle cx="100" cy="64" r="6" fill="#fff" opacity=".5"/>
              <circle cx="100" cy="126" r="6" fill="#fff" opacity=".5"/>`,
    organizer: `<rect x="30" y="50" width="50" height="80" rx="4" fill="${color}"/>
                <rect x="90" y="50" width="80" height="35" rx="4" fill="${color}" opacity=".8"/>
                <rect x="90" y="95" width="80" height="35" rx="4" fill="${color}" opacity=".6"/>`,
    bunkbed: `<rect x="25" y="95" width="150" height="50" rx="6" fill="${color}"/>
              <rect x="25" y="30" width="150" height="50" rx="6" fill="${color}" opacity=".8"/>
              <rect x="25" y="30" width="10" height="115" rx="4" fill="${color}" opacity=".7"/>
              <rect x="165" y="30" width="10" height="115" rx="4" fill="${color}" opacity=".7"/>
              <rect x="155" y="60" width="10" height="35" rx="3" fill="#FFDB00" opacity=".7"/>`,
    desk: `<rect x="20" y="85" width="160" height="12" rx="4" fill="${color}"/>
           <rect x="25" y="97" width="10" height="45" fill="${color}" opacity=".7"/>
           <rect x="165" y="97" width="10" height="45" fill="${color}" opacity=".7"/>
           <rect x="40" y="35" width="80" height="55" rx="4" fill="#0058A3" opacity=".7"/>
           <rect x="44" y="39" width="72" height="47" rx="2" fill="#1565C0" opacity=".8"/>`,
    officechairs: `<rect x="65" y="35" width="70" height="65" rx="8" fill="${color}"/>
                   <rect x="95" y="100" width="10" height="30" fill="${color}" opacity=".7"/>
                   <rect x="75" y="125" width="50" height="8" rx="4" fill="${color}" opacity=".5"/>`,
    plant: `<rect x="80" y="100" width="40" height="45" rx="4" fill="${color}"/>
            <ellipse cx="100" cy="95" rx="30" ry="25" fill="#4CAF50"/>
            <ellipse cx="82" cy="108" rx="18" ry="15" fill="#45A049"/>
            <ellipse cx="118" cy="108" rx="18" ry="15" fill="#45A049"/>`,
    art: `<rect x="30" y="25" width="140" height="125" rx="4" fill="${color}"/>
          <rect x="38" y="33" width="124" height="109" rx="2" fill="${color}" opacity=".5"/>
          <circle cx="100" cy="87" r="30" fill="#fff" opacity=".15"/>
          <line x1="55" y1="60" x2="145" y2="114" stroke="#fff" stroke-width="3" opacity=".3"/>`,
    basket: `<rect x="40" y="60" width="120" height="80" rx="8" fill="${color}"/>
             <rect x="40" y="55" width="120" height="15" rx="4" fill="${color}" opacity=".8"/>
             <path d="M70 55 Q100 30 130 55" stroke="${color}" stroke-width="6" fill="none" opacity=".6"/>`,
  };
  return `<svg viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
    <rect width="200" height="160" fill="#F8F9FA"/>
    ${iconMap[icon] || `<rect x="40" y="40" width="120" height="80" rx="8" fill="${color}"/>`}
  </svg>`;
}

// Generate product card HTML
function createProductCard(product, context = 'grid') {
  const badge = product.tags.includes('sale') && product.oldPrice
    ? `<span class="product-card__badge">Акция</span>`
    : product.isNew ? `<span class="product-card__badge product-card__badge--new">Новинка</span>` : '';

  const oldPrice = product.oldPrice
    ? `<span class="product-card__price-old">${formatPrice(product.oldPrice)}</span>` : '';

  return `
    <div class="product-card" data-id="${product.id}" onclick="location.href='pages/product.html?id=${product.id}'">
      <div class="product-card__img">
        ${productSVG(product.color, product.icon)}
      </div>
      <div class="product-card__body">
        ${badge}
        <div class="product-card__name">${product.fullName}</div>
        <div class="product-card__desc">${product.desc}</div>
        <div class="product-card__price">
          <span class="product-card__price-current">${formatPrice(product.price)}</span>
          ${oldPrice}
        </div>
      </div>
      <div class="product-card__footer">
        <button class="product-card__btn-cart" onclick="event.stopPropagation(); addToCart(${product.id})">
          В корзину
        </button>
        <button class="product-card__btn-fav" onclick="event.stopPropagation(); toggleFav(${product.id}, this)" aria-label="В избранное">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </button>
      </div>
    </div>`;
}
