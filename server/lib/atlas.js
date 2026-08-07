// Подключение разовых скриптов к боевой базе (MongoDB Atlas).
//
// URI с паролем в репозитории не хранится — раньше он был захардкожен в полусотне
// скриптов и утёк в публичный репозиторий. Теперь берётся из окружения:
//   server/.env.atlas  →  ATLAS_URI=mongodb+srv://…   (файл в .gitignore)
//
// Отдельная переменная, а не MONGO_URI, специально: локальный server/.env указывает
// на localhost, и раньше скрипты молча уходили бы не в ту базу. Здесь ошибиться нельзя —
// ATLAS_URI существует только для боевой.
//
// Сервер (server/index.js) этот модуль не использует: на Render URI приходит из
// переменных окружения сервиса.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.atlas') });

const uri = process.env.ATLAS_URI || process.env.MONGO_URI_ATLAS;

if (!uri) {
  console.error(
    '\n❌ Не задан адрес боевой базы.\n' +
    '   Создайте server/.env.atlas со строкой:\n' +
    '     ATLAS_URI=mongodb+srv://ПОЛЬЗОВАТЕЛЬ:ПАРОЛЬ@m0.fkbeejx.mongodb.net/matkasym\n' +
    '   Строку берите в MongoDB Atlas → Database → Connect.\n' +
    '   Либо разово: ATLAS_URI=… node scripts/имя-скрипта.js\n'
  );
  process.exit(1);
}

module.exports = uri;
