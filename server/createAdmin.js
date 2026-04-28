/**
 * Создаёт или обновляет admin-пользователя.
 * Запустить: MONGO_URI="mongodb+srv://..." node createAdmin.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User     = require('./models/User');

const EMAIL    = 'zhanattool@gmail.com';
const PASSWORD = 'Matkasym2024!';   // ← можно изменить перед запуском
const NAME     = 'Zhanat';

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  let user = await User.findOne({ email: EMAIL });
  if (user) {
    user.password   = PASSWORD;
    user.role       = 'admin';
    user.isPending  = false;
    user.resetPasswordToken   = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();
    console.log(`✅ Пароль обновлён для ${EMAIL}`);
  } else {
    await User.create({ name: NAME, email: EMAIL, password: PASSWORD, role: 'admin', isPending: false });
    console.log(`✅ Создан admin: ${EMAIL}`);
  }

  await mongoose.disconnect();
  console.log('Готово. Войдите с паролем:', PASSWORD);
}

main().catch(e => { console.error(e); process.exit(1); });
