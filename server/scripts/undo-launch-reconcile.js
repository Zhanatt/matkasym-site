// Откат сверки для карточек, которые каталогом не являются.
//
// Первая сверка считала «товар есть в каталоге» по самому факту привязки товара к тесту.
// Но у многих тестов привязана карточка, заведённая под сам тест (productStatus=test_sale,
// блок «ТЕСТ HOME»): цены нет, остатка нет, в каталоге такого товара не существует.
// Эти заявки уехали в закуп зря — возвращаем их на доску, а в закупе оставляем только
// настоящие каталожные позиции (for_sale и т.п.).
//
// Запуск:  node scripts/undo-launch-reconcile.js [--apply]
// Без --apply только показывает, что изменится.

const mongoose = require('mongoose');
const ProductLaunch  = require('../models/ProductLaunch');
const ProductRequest = require('../models/ProductRequest');
const Product        = require('../models/Product');
const { isCatalogProduct } = require('../lib/productLaunch');

const MONGO_URI = process.env.MONGO_URI
  || require('../lib/atlas');

// Метка, которую оставила сверка в результате теста — по ней узнаём свои карточки
const MARK = 'Сверка с каталогом';

(async () => {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(MONGO_URI);

  const touched = await ProductLaunch.find({ stage: 'done', outcome: 'ordered', 'result.updatedByName': MARK })
    .sort({ number: 1 });
  console.log(`Карточек, закрытых сверкой: ${touched.length}\n`);

  let back = 0, keep = 0;
  for (const l of touched) {
    const p = l.product ? await Product.findById(l.product).select('productStatus sku fullName name').lean() : null;

    if (isCatalogProduct(p)) {
      keep++;
      console.log(`оставляем  #${l.number} ${l.name.slice(0, 46)}  — ${p.sku} (${p.productStatus})`);
      continue;
    }

    back++;
    console.log(`возвращаем #${l.number} ${l.name.slice(0, 46)}  — ${p ? `${p.sku} (${p.productStatus})` : 'товара нет'}`);
    if (!apply) continue;

    // Заявка снова «переехала на доску» — в инбоксе закупки её быть не должно
    if (l.request) {
      const r = await ProductRequest.findById(l.request);
      if (r) {
        r.movedToLaunch = l._id;
        if (!isCatalogProduct(p)) r.type = 'new';
        r.note = r.note.replace(/\s*·\s*Тестовая продажа №\d+/g, '').trim();
        await r.save();
      }
      l.request = null;
    }
    l.stage   = 'proposed';
    l.outcome = '';
    l.result  = { ...(l.result?.toObject?.() || l.result || {}), note: '', updatedByName: '', updatedAt: null };
    await l.save();
  }

  console.log(`\n${apply ? 'Готово' : 'Будет сделано'}: вернули на доску — ${back}, оставили в закупе — ${keep}.`);
  if (!apply) console.log('Это предпросмотр. Запустите с --apply, чтобы применить.');
  await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
