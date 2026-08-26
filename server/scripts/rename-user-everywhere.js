/**
 * Переименование человека во всех местах, где имя лежит снимком.
 *
 * Учётка — один документ, но имя разбросано копиями: карточка дизайнера, журналы
 * остатков и цен, получатели новостей, загрузки продаж. Копии делались намеренно
 * (запись в журнале должна читаться, даже если аккаунт удалят), но при
 * переименовании они превращаются в разнобой: в шапке одно имя, в журнале другое.
 *
 *   node scripts/rename-user-everywhere.js --email=… --to="Жанат"           # предпросмотр
 *   node scripts/rename-user-everywhere.js --email=… --to="Жанат" --apply
 */
const mongoose = require('mongoose');
const MONGO_URI = require('../lib/atlas');
const User = require('../models/User');

const arg = (k, def) => {
  const hit = process.argv.find(a => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : def;
};
const APPLY = process.argv.includes('--apply');
const EMAIL = arg('email', '');
const TO    = arg('to', '');
// Старое имя задаётся отдельно: учётку могли уже переименовать, а снимки в
// журналах остались со старым — по ссылке их не найти, если id там не проставлен.
const FROM_ARG = arg('from', '');

// Куда имя копируется. Ссылку на пользователя храним не везде, поэтому там, где
// её нет, ищем по старому имени — оно уникально для этих записей.
const SNAPSHOTS = [
  ['Frontman',     'name',              'userId'],
  ['ChangeLog',    'changedBy.name',    'changedBy.id'],
  ['StockLog',     'changedBy.name',    'changedBy.id'],
  ['PriceLog',     'changedBy.name',    'changedBy.id'],
  ['PhotoLog',     'changedBy.name',    'changedBy.id'],
  ['ProductLog',   'changedBy.name',    'changedBy.id'],
  ['SalesUpload',  'uploadedBy.name',   'uploadedBy.id'],
  ['News',         'recipients.$[el].name', 'recipients.userId'],
  ['News',         'createdBy.name',    'createdBy.id'],
];

(async () => {
  if (!EMAIL || !TO) { console.error('Нужны --email и --to'); process.exit(1); }
  await mongoose.connect(MONGO_URI);

  const user = await User.findOne({ email: EMAIL });
  if (!user) { console.error(`Пользователь ${EMAIL} не найден`); process.exit(1); }
  const from = FROM_ARG || user.name;
  console.log(`${EMAIL}: «${from}» → «${TO}»\n`);

  let total = 0;
  for (const [model, field, idField] of SNAPSHOTS) {
    let M; try { M = require('../models/' + model); } catch (e) { continue; }

    const isArray = field.includes('$[el]');
    const plain   = field.replace('.$[el]', '');
    // По ссылке надёжнее: имя могли уже поправить руками в части записей
    const filter  = { $or: [{ [idField]: user._id }, { [plain]: from }] };

    const n = await M.countDocuments(filter);
    if (!n) continue;
    total += n;
    console.log(`  ${model}.${plain}: ${n}`);

    if (APPLY) {
      await M.updateMany(filter, { $set: { [field]: TO } },
        isArray ? { arrayFilters: [{ $or: [{ 'el.userId': user._id }, { 'el.name': from }] }] } : {});
    }
  }

  console.log(`\nЗаписей со снимком имени: ${total}`);
  if (!APPLY) { console.log('Предпросмотр. Для записи — с флагом --apply'); await mongoose.disconnect(); return; }

  if (user.name !== TO) { user.name = TO; await user.save(); }
  console.log(`✓ Переименовано, учётка теперь «${TO}»`);
  await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
