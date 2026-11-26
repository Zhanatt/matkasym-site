const mongoose = require('mongoose');

// Личный токен подписки Claude (claude setup-token, sk-ant-oat01-…) для «Правок сайта»:
// правку делает Claude того, кто её запустил. Отдельная коллекция, а не поле User —
// пользователей отдают наружу во многих роутах, токен туда попадать не должен.
// Хранится зашифрованным (AES-256-GCM, ключ из SITE_CHANGE_SECRET) — см. lib/siteChanges.js.
const claudeTokenSchema = new mongoose.Schema({
  user:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  enc:     { type: String, required: true },
  iv:      { type: String, required: true },
  tag:     { type: String, required: true },
  last4:   String,
  addedAt: { type: Date, default: Date.now },
  account: String,            // чей это аккаунт Claude (почта) — узнаём у Anthropic или человек вписывает сам
  accountAuto: Boolean,       // true — узнали автоматически, false — вписан вручную
  profileTried: Boolean,      // уже спрашивали Anthropic (чтобы не дёргать при каждом открытии)
  lastError: String,          // «лимит», «токен недействителен» — с последнего запуска
}, { versionKey: false });

module.exports = mongoose.model('ClaudeToken', claudeTokenSchema);
