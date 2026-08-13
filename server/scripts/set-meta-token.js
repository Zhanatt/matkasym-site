// Заводит и обновляет площадки Meta — Instagram и Facebook — по токену.
// Запуск: META_TOKEN=EAA… node scripts/set-meta-token.js [--apply] [--page=ID] [--label=SHAAR]
// Без --apply только показывает, что изменится.
//
// Токен у Instagram и Facebook ОДИН: это access_token страницы Facebook, к которой
// привязан IG Business-аккаунт. Поэтому и обновляются вместе — иначе после перевыпуска
// одна площадка работает, вторая молча отваливается с «Session has expired».
//
// Страниц может быть несколько (HOME, SHAAR): токен страницы годится ТОЛЬКО для своей —
// в debug_token это видно по granular_scopes.target_ids. Поэтому:
//   • токен ПОЛЬЗОВАТЕЛЯ — скрипт сам обойдёт /me/accounts и заведёт все страницы разом;
//   • токен СТРАНИЦЫ    — обновит только её.
// --page=ID ограничивает обработку одной страницей, --label задаёт суффикс названий
// («Instagram SHAAR»); без него берётся уже сохранённое название или имя страницы.
//
// Токен в файл не пишем — репозиторий публичный. Берём из окружения.
//
// Как выпускается (Graph API Explorer даёт КОРОТКИЙ токен, ~2 часа):
//   1) в Explorer выбрать приложение и права (см. NEED_SCOPES ниже), Generate Token.
//      ВАЖНО: в диалоге согласия отметить ВСЕ нужные страницы и IG-аккаунты —
//      невыбранные не попадут в granular_scopes, и публикация в них будет падать
//      на «(#200) Permissions error», хотя сам токен валиден.
//   2) обменять на длинный:
//      GET /oauth/access_token?grant_type=fb_exchange_token
//          &client_id=APP_ID&client_secret=APP_SECRET&fb_exchange_token=КОРОТКИЙ
//   3) этот длинный пользовательский токен и скормить скрипту: он сам возьмёт
//      токены страниц из /me/accounts (у них expires_at: 0, то есть бессрочные).

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { SocialAccount } = require('../models/SocialAccount');

const MONGO_URI = require('../lib/atlas');

const GRAPH  = 'https://graph.facebook.com/v21.0';
const APP_ID = '1924364671569158';   // приложение «matkasym api»

// Без pages_manage_posts Instagram публикуется, а Facebook возвращает (#200).
const NEED_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'instagram_basic',
  'instagram_content_publish',
];

const mask = t => (t ? '••••' + String(t).slice(-4) : '—');
const arg  = name => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : '';
};

async function graph(pathname, token, fields) {
  const q = new URLSearchParams({ access_token: token });
  if (fields) q.set('fields', fields);
  const r = await fetch(`${GRAPH}${pathname}?${q}`);
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d;
}

// Explorer выдаёт КОРОТКИЙ пользовательский токен (~2 часа), и токены страниц,
// полученные по нему, наследуют тот же срок — записать такой в базу значит убить
// публикации через пару часов. Меняем на долгоживущий: у страниц, полученных по нему,
// expires_at уже 0 (бессрочный).
async function exchange(token, appSecret) {
  const q = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: APP_ID,
    client_secret: appSecret,
    fb_exchange_token: token,
  });
  const r = await fetch(`${GRAPH}/oauth/access_token?${q}`);
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.access_token;
}

async function inspect(token) {
  const enc = encodeURIComponent(token);
  const r = await fetch(`${GRAPH}/debug_token?input_token=${enc}&access_token=${enc}`);
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.data || {};
}

// Права у Meta выдаются точечно: granular_scopes.target_ids перечисляет, к каким именно
// страницам и IG-аккаунтам применимо право. Пустой target_ids = ко всем.
function grantedFor(info, scope, id) {
  const g = (info.granular_scopes || []).find(s => s.scope === scope);
  if (!g) return (info.scopes || []).includes(scope);
  return !g.target_ids || g.target_ids.includes(String(id));
}

// Страницы, до которых дотягивается токен: у пользовательского — весь /me/accounts,
// у токена страницы — она сама (у него нет поля accounts).
//
// Грабли: если страницы лежат в бизнес-портфеле, /me/accounts отдаёт ПУСТОЙ data —
// хотя pages_show_list выдан и страница прекрасно читается напрямую. Поэтому падать
// на пустом списке нельзя: ID страниц всё равно перечислены в granular_scopes,
// оттуда и добираем, запрашивая каждую по отдельности.
async function discoverPages(token, info) {
  const FIELDS = 'id,name,instagram_business_account{id,username}';
  if (info.type === 'PAGE') {
    const p = await graph('/me', token, FIELDS);
    return [{ ...p, access_token: token }];
  }

  const d = await graph('/me/accounts', token, `${FIELDS},access_token`).catch(() => ({}));
  if (d.data?.length) return d.data;

  const g = (info.granular_scopes || []).find(s => s.scope === 'pages_show_list');
  const ids = g?.target_ids || [];
  if (ids.length) console.log('   (/me/accounts пуст — беру страницы из granular_scopes)');
  const pages = [];
  for (const id of ids) {
    // Одна недоступная страница не должна ронять остальные.
    const p = await graph(`/${id}`, token, `${FIELDS},access_token`).catch(e => {
      console.log(`   ⚠️  страница ${id}: ${e.message}`);
      return null;
    });
    if (p) pages.push(p);
  }
  return pages;
}

function backup(acc) {
  const dump = path.join(__dirname, `backup-social-${acc._id}.json`);
  fs.writeFileSync(dump, JSON.stringify(acc.toObject(), null, 2));
  return dump;
}

// Общая ветка для обеих площадок: нашли — сверили токен, не нашли — завели.
// Возвращает строку отчёта, писать в базу только при --apply.
async function upsert({ platform, filter, title, config, postTypes, apply }) {
  const existing = await SocialAccount.findOne({ platform, ...filter });

  if (!existing) {
    if (apply) await SocialAccount.create({ platform, title, config, postTypes, enabled: true });
    return `${apply ? '✔' : '→'}  ${title}: создать площадку (токен ${mask(config.accessToken)})`;
  }
  if (existing.config.accessToken === config.accessToken) {
    return `=  ${existing.title}: токен уже такой (${mask(config.accessToken)})`;
  }
  let note = '';
  if (apply) {
    note = `\n   бэкап: ${backup(existing)}`;
    await SocialAccount.updateOne({ _id: existing._id }, {
      $set: { 'config.accessToken': config.accessToken, lastError: '' },
    });
  }
  return `${apply ? '✔' : '→'}  ${existing.title}: ${mask(existing.config.accessToken)} → ${mask(config.accessToken)}${note}`;
}

async function main() {
  const apply    = process.argv.includes('--apply');
  const force    = process.argv.includes('--force');
  const onlyPage = arg('page');
  const label    = arg('label');
  let   token    = process.env.META_TOKEN;
  if (!token) {
    console.error('\n❌ Не задан токен.\n   Запуск: META_TOKEN=EAA… node scripts/set-meta-token.js --apply\n');
    process.exit(1);
  }

  // Проверяем токен ДО базы: незачем править боевые данные заведомо мёртвым токеном.
  let info = await inspect(token);
  console.log(`токен: ${info.type} · ` +
    (info.expires_at === 0 ? 'бессрочный' : `истекает ${new Date(info.expires_at * 1000).toLocaleString('ru-RU')}`));

  if (info.type === 'USER' && info.expires_at !== 0 && process.env.META_APP_SECRET) {
    token = await exchange(token, process.env.META_APP_SECRET);
    info  = await inspect(token);
    console.log(`обменян на долгий: ${info.type} · ` +
      (info.expires_at === 0 ? 'бессрочный' : `истекает ${new Date(info.expires_at * 1000).toLocaleString('ru-RU')}`));
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

  let pages = await discoverPages(token, info);
  if (onlyPage) pages = pages.filter(p => String(p.id) === onlyPage);
  if (!pages.length) {
    console.error(`\n❌ Страниц не найдено${onlyPage ? ` (искали ${onlyPage})` : ''}.` +
      '\n   Пользовательский токен должен иметь pages_show_list и согласие на нужные страницы.\n');
    process.exit(1);
  }
  console.log(`\nстраниц найдено: ${pages.length}\n`);

  await mongoose.connect(MONGO_URI);

  for (const page of pages) {
    const ig = page.instagram_business_account;
    console.log(`── ${page.name} (${page.id})${ig ? ` · IG @${ig.username} (${ig.id})` : ' · IG не привязан'}`);

    // Токен страницы отдаётся только пользовательскому токену с pages_show_list;
    // без него публиковать нечем — площадку не трогаем, чтобы не затереть рабочий токен.
    const pageToken = page.access_token;
    if (!pageToken) {
      console.log('   ⚠️  токен страницы не выдан — пропускаю\n');
      continue;
    }

    // Срок жизни токен страницы наследует от пользовательского: по короткому получится
    // короткий, и площадка отвалится через пару часов. Пишем только бессрочные.
    const pageInfo = await inspect(pageToken);
    if (pageInfo.expires_at !== 0 && !force) {
      const till = new Date(pageInfo.expires_at * 1000).toLocaleString('ru-RU');
      console.log(`   ⚠️  токен страницы временный (до ${till}) — не записываю.` +
        '\n       Обменяйте пользовательский токен на долгоживущий (META_APP_SECRET=… или вручную),' +
        '\n       либо --force, если временный нужен осознанно.\n');
      continue;
    }

    // Название: сначала уже сохранённое (переименовывать руками настроенное незачем —
    // и --label при обходе нескольких страниц не должен затрагивать чужие), потом
    // --label, потом имя страницы.
    const known = await SocialAccount.findOne({ platform: 'facebook', 'config.pageId': String(page.id) })
      || (ig && await SocialAccount.findOne({ platform: 'instagram', 'config.igUserId': String(ig.id) }));
    const suffix = known?.title?.split(' ').slice(1).join(' ') || label || page.name;

    if (ig) {
      if (!grantedFor(info, 'instagram_content_publish', ig.id)) {
        console.log(`   ⚠️  у токена нет instagram_content_publish на @${ig.username} — постить не сможет`);
      }
      console.log('   ' + await upsert({
        platform: 'instagram',
        filter: { 'config.igUserId': String(ig.id) },
        title: `Instagram ${suffix}`,
        config: { igUserId: String(ig.id), accessToken: pageToken, username: ig.username },
        postTypes: ['feed', 'story'],
        apply,
      }));
    }

    if (!grantedFor(info, 'pages_manage_posts', page.id)) {
      console.log(`   ⚠️  у токена нет pages_manage_posts на «${page.name}» — Facebook постить не сможет`);
    }
    console.log('   ' + await upsert({
      platform: 'facebook',
      filter: { 'config.pageId': String(page.id) },
      title: `Facebook ${suffix}`,
      config: { pageId: String(page.id), accessToken: pageToken, pageName: page.name },
      postTypes: ['feed'],   // историй у страниц через API нет
      apply,
    }));
    console.log('');
  }

  await mongoose.disconnect();
  if (!apply) console.log('Это предпросмотр. Запусти с --apply чтобы записать.');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
