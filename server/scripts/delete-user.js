// Удаляет учётную запись сотрудника. Перед удалением выгружает документ в JSON
// и показывает, где на него ещё ссылаются: восстановить пользователя из бэкапа
// можно, но связи в журналах восстановятся только если знать, что там было.
//
// Запуск: node scripts/delete-user.js <email или имя> [--apply]
// Без --apply только показывает, что будет удалено.

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const User = require('../models/User');

const MONGO_URI = require('../lib/atlas');

// Где ещё лежат ссылки на пользователя. Перечислены явно, а не найдены перебором:
// молча удалить учётку, на которую ссылается половина базы, — плохая идея,
// и список должен быть виден в коде.
const REFS = [
  ['Frontman',       'userId'],
  ['Publication',    'createdBy'],
  ['ChangeLog',      'changedBy.id'],
  ['LoginLog',       'userId'],
  ['News',           'createdBy.id'],
  ['ProductLaunch',  'createdBy'],
  ['ProductRequest', 'createdBy'],
];

async function main() {
  const apply = process.argv.includes('--apply');
  const key = process.argv.slice(2).find(a => !a.startsWith('--'));
  if (!key) {
    console.error('\n❌ Укажите email или имя.\n   node scripts/delete-user.js elmyrza@example.com --apply\n');
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);

  const rx = new RegExp('^' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
  const found = await User.find({ $or: [{ email: rx }, { name: rx }] }).lean();

  if (!found.length) { console.log(`не найден: ${key}`); await mongoose.disconnect(); return; }
  if (found.length > 1) {
    console.log(`⚠️  под «${key}» подходит несколько — уточните email:`);
    found.forEach(u => console.log(`   ${u.name} · ${u.email} · ${u.role}`));
    await mongoose.disconnect();
    return;
  }

  const u = found[0];
  console.log(`${u.name} · ${u.email} · роль ${u.role} · заведён ${new Date(u.createdAt).toLocaleDateString('ru-RU')}\n`);

  console.log('ссылки на него:');
  let total = 0;
  for (const [model, field] of REFS) {
    try {
      const M = require('../models/' + model);
      const n = await M.countDocuments({ [field]: u._id });
      if (n) { console.log(`   ${model}.${field}: ${n}`); total += n; }
    } catch { /* модели может не быть — не повод падать */ }
  }
  if (!total) console.log('   нет');

  if (apply) {
    const dump = path.join(__dirname, `backup-user-${u._id}.json`);
    fs.writeFileSync(dump, JSON.stringify(u, null, 2));
    console.log(`\n   бэкап: ${dump}`);

    await User.deleteOne({ _id: u._id });
    console.log(`✔  удалён: ${u.name} (${u.email})`);
    if (total) console.log(`   ${total} записей остались со ссылкой на несуществующего пользователя — автор в них покажется пустым`);
  } else {
    console.log(`\n→  будет удалён: ${u.name} (${u.email})`);
  }

  await mongoose.disconnect();
  if (!apply) console.log('\nЭто предпросмотр. Запусти с --apply чтобы удалить.');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
