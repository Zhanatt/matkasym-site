// Обновляет токен Meta сразу у обеих площадок автопубликации — Instagram и Facebook.
// Запуск: META_TOKEN=EAA… node scripts/set-meta-token.js [--apply]
// Без --apply только показывает, что изменится.
//
// Токен у них ОДИН: это access_token страницы Facebook, к которой привязан
// IG Business-аккаунт. Поэтому и обновляются вместе — иначе после перевыпуска
// одна площадка работает, вторая молча отваливается с «Session has expired».
//
// Токен в файл не пишем — репозиторий публичный. Берём из окружения.
//
// Как выпускается (Graph API Explorer даёт КОРОТКИЙ токен, ~2 часа):
//   1) в Explorer выбрать приложение и права (см. NEED_SCOPES ниже), Generate Token
//   2) обменять на длинный:
//      GET /oauth/access_token?grant_type=fb_exchange_token
//          &client_id=APP_ID&client_secret=APP_SECRET&fb_exchange_token=КОРОТКИЙ
//   3) взять токен страницы: GET /me/accounts с длинным токеном из шага 2 —
//      у него expires_at: 0, то есть бессрочный.

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { SocialAccount } = require('../models/SocialAccount');

const MONGO_URI = require('../lib/atlas');

const GRAPH    = 'https://graph.facebook.com/v21.0';
const PAGE_ID  = '489438164253110';        // Matkasym Home
const IG_ID    = '17841407334690788';      // matkasym_home.kg

// Без pages_manage_posts Instagram публикуется, а Facebook возвращает (#200).
const NEED_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'instagram_basic',
  'instagram_content_publish',
];

const mask = t => (t ? '••••' + String(t).slice(-4) : '—');

async function inspect(token) {
  const enc = encodeURIComponent(token);
  const r = await fetch(`${GRAPH}/debug_token?input_token=${enc}&access_token=${enc}`);
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.data || {};
}

function backup(acc) {
  const dump = path.join(__dirname, `backup-social-${acc._id}.json`);
  fs.writeFileSync(dump, JSON.stringify(acc.toObject(), null, 2));
  return dump;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const token = process.env.META_TOKEN;
  if (!token) {
    console.error('\n❌ Не задан токен.\n   Запуск: META_TOKEN=EAA… node scripts/set-meta-token.js --apply\n');
    process.exit(1);
  }

  // Проверяем токен ДО базы: незачем править боевые данные заведомо мёртвым токеном.
  const info = await inspect(token);
  console.log(`токен: ${info.type} · profile_id ${info.profile_id || '—'} · ` +
    (info.expires_at === 0 ? 'бессрочный' : `истекает ${new Date(info.expires_at * 1000).toLocaleString('ru-RU')}`));

  if (info.type !== 'PAGE') {
    console.error('\n❌ Это токен пользователя, а не страницы. Возьмите access_token из GET /me/accounts.\n');
    process.exit(1);
  }
  if (String(info.profile_id) !== PAGE_ID) {
    console.error(`\n❌ Токен от другой страницы (${info.profile_id}), ожидалась ${PAGE_ID}.\n`);
    process.exit(1);
  }

  const missing = NEED_SCOPES.filter(s => !(info.scopes || []).includes(s));
  if (missing.length) {
    console.log(`⚠️  не хватает прав: ${missing.join(', ')}`);
    if (missing.includes('pages_manage_posts')) console.log('   → Facebook публиковать не сможет');
  } else {
    console.log('права: все нужные на месте');
  }
  if (info.data_access_expires_at) {
    console.log(`доступ к данным до: ${new Date(info.data_access_expires_at * 1000).toLocaleDateString('ru-RU')}`);
  }
  console.log('');

  await mongoose.connect(MONGO_URI);

  // --- Instagram: площадка уже заведена, меняем только токен ---
  const ig = await SocialAccount.findOne({ platform: 'instagram', 'config.igUserId': IG_ID });
  if (!ig) {
    console.log(`⚠️  Instagram с igUserId ${IG_ID} не найден — пропускаю`);
  } else if (ig.config.accessToken === token) {
    console.log(`=  ${ig.title}: токен уже такой (${mask(token)})`);
  } else {
    if (apply) {
      console.log(`   бэкап: ${backup(ig)}`);
      await SocialAccount.updateOne({ _id: ig._id }, {
        $set: { 'config.accessToken': token, lastError: '' },
      });
    }
    console.log(`${apply ? '✔' : '→'}  ${ig.title}: ${mask(ig.config.accessToken)} → ${mask(token)}`);
  }

  // --- Facebook: площадки может ещё не быть, тогда заводим ---
  const fb = await SocialAccount.findOne({ platform: 'facebook', 'config.pageId': PAGE_ID });
  if (!fb) {
    if (apply) {
      await SocialAccount.create({
        platform: 'facebook',
        title: 'Facebook HOME',
        config: { pageId: PAGE_ID, accessToken: token, pageName: 'Matkasym Home' },
        postTypes: ['feed'],   // историй у страниц через API нет
        enabled: true,
      });
    }
    console.log(`${apply ? '✔' : '→'}  Facebook HOME: создать площадку (страница ${PAGE_ID}, токен ${mask(token)})`);
  } else if (fb.config.accessToken === token) {
    console.log(`=  ${fb.title}: токен уже такой (${mask(token)})`);
  } else {
    if (apply) {
      console.log(`   бэкап: ${backup(fb)}`);
      await SocialAccount.updateOne({ _id: fb._id }, {
        $set: { 'config.accessToken': token, lastError: '' },
      });
    }
    console.log(`${apply ? '✔' : '→'}  ${fb.title}: ${mask(fb.config.accessToken)} → ${mask(token)}`);
  }

  await mongoose.disconnect();
  if (!apply) console.log('\nЭто предпросмотр. Запусти с --apply чтобы записать.');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
