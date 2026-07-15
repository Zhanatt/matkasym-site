/**
 * Одноразовый скрипт: убирает уникальный индекс { frontman, product } из videoschedules,
 * чтобы один товар можно было снимать несколько раз (повторяемый товар).
 * Запуск: node scripts/dropVideoScheduleUniqueIndex.js
 */
const mongoose = require('mongoose');

const MONGO_URI = 'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym?appName=M0';

(async () => {
  await mongoose.connect(MONGO_URI);
  const coll = mongoose.connection.collection('videoschedules');
  const indexes = await coll.indexes();
  console.log('Индексы до:', indexes.map(i => `${i.name}${i.unique ? ' (unique)' : ''}`).join(', '));

  const target = indexes.find(
    i => i.key && i.key.frontman === 1 && i.key.product === 1 && i.unique
  );
  if (target) {
    await coll.dropIndex(target.name);
    console.log(`✅ Удалён уникальный индекс: ${target.name}`);
  } else {
    console.log('ℹ️ Уникального индекса { frontman, product } не найдено — нечего удалять');
  }

  // Пересоздаём как НЕ уникальный (если его ещё нет)
  await coll.createIndex({ frontman: 1, product: 1 });
  console.log('✅ Создан неуникальный индекс { frontman, product }');

  const after = await coll.indexes();
  console.log('Индексы после:', after.map(i => `${i.name}${i.unique ? ' (unique)' : ''}`).join(', '));
  await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
