// Назначает зоны ответственности за буферный запас.
// Запуск: node scripts/assign-buffer-zones.js [--apply]
// Без --apply только показывает, что изменится.

const mongoose = require('mongoose');
const User = require('../models/User');

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://zhanat_db_user:oDaCJQeuD2mjTpGp@m0.fkbeejx.mongodb.net/matkasym?appName=M0';

// Санира ведёт HOME с обоих своих аккаунтов
const ZONE_BY_EMAIL = {
  'bermetmederova@gmail.com': 'ikea',
  'matkasymovllc@gmail.com':  'home',
  'saniraalieva13@gmail.com': 'home',
  'n2033853@gmail.com':       'shaar',
};

async function main() {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(MONGO_URI);

  for (const [email, zone] of Object.entries(ZONE_BY_EMAIL)) {
    const u = await User.findOne({ email });
    if (!u) { console.log(`⚠️  не найден: ${email}`); continue; }
    const from = u.bufferZone || '—';
    if (from === zone) { console.log(`=  ${email}: уже ${zone}`); continue; }
    if (apply) await User.updateOne({ _id: u._id }, { $set: { bufferZone: zone } });
    console.log(`${apply ? '✔' : '→'}  ${email}: ${from} → ${zone}`);
  }

  // Все остальные зон не имеют — алерты им не уходят
  const strays = await User.find({ bufferZone: { $nin: ['', null] }, email: { $nin: Object.keys(ZONE_BY_EMAIL) } });
  for (const u of strays) {
    if (apply) await User.updateOne({ _id: u._id }, { $set: { bufferZone: '' } });
    console.log(`${apply ? '✔' : '→'}  ${u.email}: зона ${u.bufferZone} снята`);
  }

  await mongoose.disconnect();
  if (!apply) console.log('\nЭто предпросмотр. Запусти с --apply чтобы записать.');
}

main().catch(e => { console.error(e); process.exit(1); });
