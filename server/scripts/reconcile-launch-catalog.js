// Разбор доски тестовой продажи: что менеджеры предложили из уже существующего каталога.
//
// Заявки менеджеров разом переехали на доску («Предложено»), и вместе с новинками туда
// попали товары, которые у нас давно есть. Тестировать их незачем — их просят заказать,
// а инбокс «Заявки на заказ» при этом стоит пустой.
//
// Каталогом считается только настоящая позиция каталога. Карточка, заведённая под сам
// тест (productStatus=test_sale, блок «ТЕСТ HOME» — без цены и остатка), не в счёт:
// заказывать по ней нечего, такой товар и правда идёт через тестовую продажу.
//
// Скрипт делает две вещи:
//   1. ТОВАР ЕСТЬ В КАТАЛОГЕ (привязан и не test_sale) → исходная заявка менеджера
//      возвращается в инбокс закупки (movedToLaunch = null), тест закрывается как
//      «заказали». Новых заявок не плодим: у исходной свой номер, автор и количество.
//   2. КАРТОЧКИ НЕТ, но в каталоге нашёлся тот же товар → печатаем совпадение.
//      Привязку не делаем автоматически даже при совпадении артикула: название товара
//      у менеджера и в каталоге совпадает не всегда однозначно, решает человек
//      (кнопка «Привязать» на карточке доски).
//
// Запуск:  node scripts/reconcile-launch-catalog.js [--apply]
// Без --apply только показывает, что изменится.

const mongoose = require('mongoose');
const ProductLaunch  = require('../models/ProductLaunch');
const ProductRequest = require('../models/ProductRequest');
const Product        = require('../models/Product');
const { findCatalogMatch, isCatalogProduct } = require('../lib/productLaunch');

const MONGO_URI = process.env.MONGO_URI
  || require('../lib/atlas');

const today = () => new Date().toLocaleDateString('ru-RU');

(async () => {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(MONGO_URI);

  const proposed = await ProductLaunch.find({ stage: 'proposed' }).sort({ number: 1 });
  const statuses = new Map((await Product.find({ _id: { $in: proposed.map(l => l.product).filter(Boolean) } })
    .select('productStatus').lean()).map(p => [String(p._id), p]));
  const fromCatalog = l => isCatalogProduct(statuses.get(String(l.product)));

  const linked  = proposed.filter(l => fromCatalog(l) && !l.request);
  const orphans = proposed.filter(l => !fromCatalog(l));

  console.log(`В «Предложено»: ${proposed.length} · товар из каталога: ${linked.length} · нет каталожной карточки: ${orphans.length}\n`);

  // ── 1. Товар уже наш → возвращаем заявку в закуп ───────────────────────────
  console.log('=== В «Заявки на заказ» ===');
  let moved = 0, created = 0;
  for (const l of linked) {
    const origin = l.fromRequest ? await ProductRequest.findById(l.fromRequest) : null;

    if (origin) {
      console.log(`#${l.number} ${l.name}  →  заявка №${origin.number} (${origin.createdByName || 'без автора'}` +
        `${origin.quantity ? `, ${origin.quantity} шт` : ''})`);
      moved++;
      if (apply) {
        origin.movedToLaunch = null;
        if (!origin.product) origin.product = l.product;
        if (!origin.sku && l.sku) origin.sku = l.sku;
        if (origin.product && origin.type === 'new') origin.type = 'catalog';
        origin.status = 'new';
        await origin.save();
        l.request = origin._id;
      }
    } else {
      // Карточку завели на доске руками — заявки под ней нет, создаём
      console.log(`#${l.number} ${l.name}  →  новая заявка (исходной нет)`);
      created++;
      if (apply) {
        const last = await ProductRequest.findOne().sort({ number: -1 }).select('number');
        const photos = l.content?.photos?.length ? l.content.photos : (l.image ? [l.image] : []);
        const request = await ProductRequest.create({
          number:        (last?.number || 0) + 1,
          createdBy:     l.createdBy,
          createdByName: l.createdByName || '',
          type:          'catalog',
          product:       l.product,
          sku:           l.sku || '',
          photo:         photos[0] || '',
          photos,
          name:          l.productName || l.name,
          note:          `Товар уже есть в каталоге · из теста №${l.number}`,
          status:        'new',
        });
        l.request = request._id;
      }
    }

    if (apply) {
      l.stage   = 'done';
      l.outcome = 'ordered';
      l.result  = {
        ...(l.result?.toObject?.() || l.result || {}),
        note: [l.result?.note, `Товар уже есть в каталоге — тестовая продажа не нужна, заявка ушла в закуп (сверка ${today()})`]
          .filter(Boolean).join(' · '),
        updatedByName: 'Сверка с каталогом',
        updatedAt: new Date(),
      };
      await l.save();
    }
  }

  // ── 2. Карточки нет — ищем совпадение по названию/артикулу ─────────────────
  // Ищем среди настоящих позиций каталога: карточки самих тестов подсказкой быть не могут
  const products = await Product.find({ productStatus: { $nin: ['test_sale', 'planned', 'in_development'] } })
    .select('name fullName sku images supplier stock productStatus').lean();
  console.log('\n=== Без карточки в каталоге ===');
  for (const l of orphans) {
    const m = findCatalogMatch(l, products);
    console.log(m
      ? `#${l.number} ${l.name}\n      ≈ ${m.product.fullName || m.product.name} (${m.product.sku || 'без sku'})` +
        `  ${m.exact ? 'совпал артикул' : `совпадение ${m.score.toFixed(2)}`} — привязать вручную на доске`
      : `#${l.number} ${l.name}  —  в каталоге нет, это новинка`);
  }

  console.log(`\n${apply ? 'Готово' : 'Будет сделано'}: заявок вернули в закуп — ${moved}, создали новых — ${created}.`);
  if (!apply) console.log('Это предпросмотр. Запустите с --apply, чтобы применить.');
  await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
