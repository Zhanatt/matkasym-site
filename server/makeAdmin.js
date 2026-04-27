require('dotenv').config();
const mongoose = require('mongoose');
const User     = require('./models/User');

const EMAIL    = process.argv[2];
const PASSWORD = process.argv[3] || 'admin123';

if (!EMAIL) {
  console.log('Использование: node makeAdmin.js <email> [пароль]');
  process.exit(1);
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  let user = await User.findOne({ email: EMAIL });
  if (user) {
    user.role = 'admin';
    await user.save();
    console.log(`✅ Пользователь ${EMAIL} теперь admin`);
  } else {
    await User.create({ name: 'Admin', email: EMAIL, password: PASSWORD, role: 'admin' });
    console.log(`✅ Создан admin: ${EMAIL} / ${PASSWORD}`);
  }

  await mongoose.disconnect();
})();
