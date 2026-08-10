// Раздаёт номера публикациям, созданным до появления нумерации.
// Запуск: node scripts/backfill-publication-numbers.js [--apply]
// Без --apply только показывает, что будет проставлено.
//
// Порядок — по дате создания: номер должен расти вместе со временем,
// иначе «публикация №3» окажется новее, чем №7, и журнал перестанет читаться.
// В конце счётчик подводится к последнему выданному номеру, чтобы следующая
// публикация с сайта продолжила ряд, а не начала его заново.

const mongoose = require('mongoose');
const Publication = require('../models/Publication');
const Counter = require('../models/Counter');

const MONGO_URI = require('../lib/atlas');

async function main() {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(MONGO_URI);

  const numbered = await Publication.countDocuments({ number: { $ne: null } });
  const todo = await Publication.find({ number: null }).sort({ createdAt: 1 }).lean();

  console.log(`уже с номерами: ${numbered}`);
  console.log(`без номеров:    ${todo.length}\n`);

  if (!todo.length) {
    console.log('нечего проставлять');
    await mongoose.disconnect();
    return;
  }

  // Продолжаем с максимума, а не с единицы: часть публикаций могла получить
  // номер раньше (например, созданная уже после выката кода).
  const max = await Publication.findOne({ number: { $ne: null } }).sort({ number: -1 }).select('number').lean();
  let n = (max?.number || 0);

  for (const p of todo) {
    n += 1;
    const what = p.productName || (p.kind === 'custom' ? 'Свободный пост' : 'Публикация');
    if (apply) await Publication.updateOne({ _id: p._id }, { $set: { number: n } });
    console.log(`${apply ? '✔' : '→'}  №${String(n).padEnd(4)} ${new Date(p.createdAt).toLocaleString('ru-RU')}  ${what}`);
  }

  if (apply) {
    await Counter.findByIdAndUpdate('publication', { $set: { seq: n } }, { upsert: true });
    console.log(`\nсчётчик подведён к ${n} — следующая публикация получит №${n + 1}`);
  }

  await mongoose.disconnect();
  if (!apply) console.log('\nЭто предпросмотр. Запусти с --apply чтобы записать.');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
