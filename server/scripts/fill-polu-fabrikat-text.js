/**
 * POLU FABRIKAT: описания и характеристики у 9 пустых карточек
 * (SANJYRA 1–5, узоры Butak / Charchy / Kiyal oyuu, KERME).
 *
 * Запуск из папки server:
 *   node scripts/fill-polu-fabrikat-text.js           — только показать
 *   node scripts/fill-polu-fabrikat-text.js --apply   — записать
 *
 * Источник — постеры в карточках (на кыргызском): лазерная резка, стальная
 * конструкция, окраска, защита от коррозии, где применяется. Размеров и цен
 * там нет — не придумываем. Уже заполненные характеристики не трогаем, пустые
 * строки («Профиль:» без значения) убираем. Бэкап — fill-polu-fabrikat-text.backup.json.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const APPLY = process.argv.includes('--apply');

const spec = (key, value) => ({ key, value, options: [] });

const sanjyraPoster = n => ({
  description:
`Декоративная металлическая панель SANJYRA ${n} для ограждений: лестничных перил, балконов, террас и навесов.

Сквозной национальный орнамент вырезан лазером — контур чёткий и аккуратный. Основа — стальная конструкция, панель окрашена и защищена от коррозии, поэтому подходит для улицы.

Панель вваривается в ограждение между стойками и придаёт каждому ограждению свой вид.`,
  specs: [
    spec('Тип', 'Декоративная панель для ограждений'),
    spec('Технология изготовления', 'Лазерная резка'),
    spec('Материал', 'Сталь'),
    spec('Покрытие', 'Окраска, защита от коррозии'),
    spec('Применение', 'Перила, балконы, террасы, навесы'),
  ],
});
const sanjyraPlain = n => ({
  description:
`Декоративный элемент ограждения SANJYRA ${n}: металлическая рамка со сквозным национальным орнаментом, вверху и внизу — стойка из квадратной трубы.

Орнамент вырезан лазером. Элемент вваривается в перила, ограждения балконов и лестниц, заборы и ворота.`,
  specs: [
    spec('Тип', 'Декоративный элемент ограждения'),
    spec('Технология изготовления', 'Лазерная резка'),
    spec('Конструкция', 'Рамка с орнаментом на стойке из квадратной трубы'),
    spec('Применение', 'Перила, балконы, лестницы, заборы, ворота'),
  ],
});
const oyuu = (title, pattern, uses) => ({
  description:
`${title} — декоративный металлический узор (оймо) для мебели и ограждений.

${pattern} Узор вырезан лазером точно по контуру.

Применяется на спинках стульев, в царгах столов${uses}, в декоративных ограждениях. Украшает мебель и придаёт интерьеру свой стиль.`,
  specs: [
    spec('Тип', 'Декоративный металлический узор'),
    spec('Технология изготовления', 'Лазерная резка'),
    spec('Материал', 'Металл'),
    spec('Применение', `Спинки стульев, царги столов${uses}, ограждения`),
  ],
});

const PLAN = {
  'SANJYRA 1': sanjyraPoster(1),
  'SANJYRA 2': sanjyraPoster(2),
  'SANJYRA 3': sanjyraPlain(3),
  'SANJYRA 4': sanjyraPlain(4),
  'SANJYRA 5': sanjyraPlain(5),
  'Butak oyuu': oyuu('Butak oyuu', 'Плавный растительный узор из завитков.', ''),
  'Kiyal oyuu': oyuu('Kiyal oyuu', 'Плавный узор из S-образных завитков.', ''),
  'Charchy oyuu': oyuu('Charchy oyuu', 'Строгий геометрический узор-меандр.', ' и консольных столов'),
  'KERME': {
    description:
`Kerme — фирменный декоративный металлический элемент с национальным орнаментом.

Украшает ворота, заборы, спинки стульев и скамеек, садовую мебель и интерьер. Хорошо смотрится во дворе, на террасе, в беседке и в летнем кафе.

Узор вырезан лазером, элемент прочный и долговечный, окрашивается качественной краской.`,
    specs: [
      spec('Тип', 'Декоративный металлический элемент'),
      spec('Технология изготовления', 'Лазерная резка'),
      spec('Материал', 'Металл'),
      spec('Покрытие', 'Окраска'),
      spec('Применение', 'Ворота, заборы, стулья, скамейки, декор'),
    ],
  },
};

(async () => {
  await mongoose.connect(MONGO_URI);
  const P = mongoose.connection.db.collection('products');
  const ps = await P.find({ set: 'poly-fabrikat' }).toArray();
  const todo = [];
  for (const p of ps) {
    const plan = PLAN[p.name.trim()];
    if (!plan) continue;
    if ((p.description || '').trim()) { console.log('Уже есть описание, пропуск:', p.name); continue; }
    const keep = (p.specs || []).filter(s => String(s?.value || '').trim());
    const have = new Set(keep.map(s => s.key.toLowerCase()));
    const specs = [...plan.specs.filter(s => !have.has(s.key.toLowerCase())), ...keep];
    todo.push({ p, description: plan.description, specs });
    console.log(`\n## ${p.name}\n${plan.description}\n  ${specs.map(s => `${s.key}: ${s.value}`).join(' · ')}`);
  }
  if (!APPLY) { console.log(`\nПредпросмотр: ${todo.length}. Для записи: --apply`); return process.exit(0); }
  fs.writeFileSync(path.join(__dirname, 'fill-polu-fabrikat-text.backup.json'),
    JSON.stringify(todo.map(({ p }) => ({ _id: p._id, name: p.name, description: p.description, specs: p.specs })), null, 1));
  for (const t of todo) await P.updateOne({ _id: t.p._id }, { $set: { description: t.description, specs: t.specs, updatedAt: new Date() } });
  console.log(`Готово: ${todo.length}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
