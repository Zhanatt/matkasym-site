/**
 * Onuguu: описания и характеристики у карточек услуг, чтобы они не выглядели пустыми.
 *
 * Запуск из папки server:
 *   node scripts/fill-onuguu-services-text.js           — только показать
 *   node scripts/fill-onuguu-services-text.js --apply   — записать
 *
 * Цифры берутся только из того, что уже было в карточках и прайсе (толщины из названий,
 * тарифы, длина гибки до 3 м, длина трубы до 6 м, минимальный заказ на сварку 10 000 сом) —
 * новых фактов не придумываем. Бэкап — scripts/fill-onuguu-services-text.backup.json.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const APPLY = process.argv.includes('--apply');

const spec = (key, value) => ({ key, value, options: [] });
// «Сварка 0,5–1 мм», «Laser Art 0,5-3мм», «Трубо резка 3-5 мм» → «0,5–1 мм»
const thick = (name) => {
  const m = String(name).match(/(\d+(?:[.,]\d+)?)\s*[–-]\s*(\d+(?:[.,]\d+)?)\s*мм/);
  return m ? `${m[1].replace('.', ',')}–${m[2].replace('.', ',')} мм` : '';
};

function plan(p) {
  const t = thick(p.name);
  switch (p.category) {
    case 'Лазерное оборудование':
      return {
        description:
`Лазерная резка листового металла толщиной ${t} по вашему чертежу или эскизу.

Подходит для декоративных панелей, ажурных перегородок, табличек, фигурных деталей и заготовок для дальнейшей гибки и сварки. Лазер режет сложный контур одним проходом — края ровные, деталь сразу готова к покраске.

Стоимость считается по времени работы станка — ${p.price} сом за минуту. Точную цену и сроки менеджер рассчитает по вашему чертежу.`,
        specs: [
          spec('Тип услуги', 'Лазерная резка листового металла'),
          spec('Толщина', t),
          spec('Единица', 'сом/мин'),
          spec('Что нужно для заказа', 'чертёж или эскиз изделия'),
        ],
      };
    case 'Услуги':
      return {
        description:
`Лазерная резка труб с толщиной стенки ${t}.

Режем трубы в размер по вашим заготовкам — детали сразу готовы к сварке и сборке.

Цена — ${p.price} сом за одну резку. Для больших партий стоимость уточняйте у менеджера.`,
        specs: [
          spec('Тип услуги', 'Лазерная резка труб'),
          spec('Толщина материала', t.replace(/,/g, '.')),
          spec('Цена за резку', `${p.price} сом`),
        ],
      };
    case 'услуга-труборезки':
      return {
        description:
`Резка металлических труб с толщиной стенки ${t}.

Распускаем трубы на заготовки нужной длины по вашим размерам. Длина трубы — до 6 метров.

Стоимость и сроки для вашего объёма уточняйте у менеджера.`,
        specs: [
          spec('Тип услуги', 'Резка труб'),
          spec('Толщина стенки', t),
          spec('Длина (макс)', '6 метр'),
        ],
      };
    case 'отдел-сварки':
      return {
        description:
`Сварка металлических конструкций и деталей из металла толщиной ${t}.

Соединяем детали аккуратно и надёжно: каркасы, рамы, ограждения, металлическую мебель и изделия по вашим чертежам.

Цена — ${p.price} сом за погонный метр шва. Минимальный заказ — от 10 000 сом.`,
        specs: [
          spec('Тип услуги', 'Сварка металла'),
          spec('Толщина металла', t),
          spec('Единица', 'сом/пог. м'),
          spec('Минимальный заказ', 'от 10 000 сом'),
        ],
      };
    case 'отдел-гибка':
      return {
        description:
`Гибка листового металла толщиной от 0,5 до 4 мм по вашим размерам.

Делаем уголки, короба, профили, откосы и детали корпусов. Максимальная длина гибки — до 3 метров.

Точная и аккуратная гибка — детали сразу готовы к сборке и покраске.`,
        specs: [
          spec('Тип услуги', 'Гибка листового металла'),
          spec('Толщина металла', '0,5–4 мм'),
          spec('Длина гибки (макс)', 'до 3 метров'),
        ],
      };
    case 'Покраска':
      return {
        description:
`Порошковая покраска металлических изделий и конструкций.

Покрытие получается ровным и прочным: хорошо держится на металле и подходит для изделий, которые стоят на улице. Цвет — по каталогу RAL.

Стоимость зависит от площади и сложности изделия — уточняйте у менеджера.`,
        specs: [
          spec('Тип услуги', 'Порошковая покраска'),
          spec('Цвет', 'по каталогу RAL'),
          spec('Стоимость', 'по площади и сложности изделия'),
        ],
      };
    default: return null;
  }
}

(async () => {
  await mongoose.connect(MONGO_URI);
  const P = mongoose.connection.db.collection('products');
  const ps = await P.find({ set: 'onuguu-set' }).sort({ category: 1, name: 1 }).toArray();
  const todo = [];
  for (const p of ps) {
    const n = plan(p);
    if (!n) { console.log('ПРОПУСК (нет шаблона):', p.category, '|', p.name); continue; }
    todo.push({ p, n });
    console.log(`\n## ${p.name}\n${n.description}\n  ${n.specs.map(s => `${s.key}: ${s.value}`).join(' · ')}`);
  }
  if (!APPLY) { console.log(`\nПредпросмотр: ${todo.length} карточек. Для записи: --apply`); return process.exit(0); }
  fs.writeFileSync(path.join(__dirname, 'fill-onuguu-services-text.backup.json'),
    JSON.stringify(todo.map(({ p }) => ({ _id: p._id, name: p.name, description: p.description, specs: p.specs })), null, 1));
  for (const { p, n } of todo) await P.updateOne({ _id: p._id }, { $set: { description: n.description, specs: n.specs, updatedAt: new Date() } });
  console.log(`Готово: ${todo.length} карточек`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
