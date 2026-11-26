// Помощник воркфлоу «Правки сайта» (.github/workflows/site-change.yml).
//   node bot.mjs task             — забрать задачу с сайта: /tmp/task.md + картинки в .site-change-refs/
//   node bot.mjs stage <текст>    — строка «что сейчас делаю» в чат правки
//   node bot.mjs report <json>    — отправить отчёт на сайт (status, prNumber, summary, …)
//   node bot.mjs guard            — откатить правки вне разрешённых папок, вывести их список
//   node bot.mjs summary <files…> — из JSON-вывода claude достать итог и стоимость в $GITHUB_OUTPUT
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const { SITE_URL, SITE_CHANGE_SECRET, ID } = process.env;
const RUN_URL = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;

// Render free засыпает — первый запрос может ждать до минуты
async function call(path, init = {}, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(`${SITE_URL}/api/site-changes/${ID}${path}`, {
        ...init,
        headers: { 'x-site-change-secret': SITE_CHANGE_SECRET, 'Content-Type': 'application/json', ...init.headers },
        signal: AbortSignal.timeout(90_000),
      });
      if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
      return r.json();
    } catch (e) {
      if (i >= tries) throw e;
      console.log(`сайт не ответил (${e.message}), повтор ${i}…`);
      await new Promise(res => setTimeout(res, 15_000));
    }
  }
}

const sh = cmd => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const out = (k, v) => fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}<<__EOF__\n${v}\n__EOF__\n`);

// Разрешено менять только внешний вид: сайт и вёрстку PDF-каталогов
const ALLOWED = /^client\/(src|public)\//;
const FORBIDDEN = /^client\/src\/(api\/|context\/|constants\/roles\.js$)/;
// Вёрстка каталогов сетов живёт на сервере. Только правка существующих файлов, новых не заводим
const CATALOG = /^server\/(scripts\/build-[a-z0-9-]+-catalog\.js|lib\/catalog(Layout|Fonts)\.js)$/;
// Эти скрипты запускаются с доступом к боевой базе (пробный PDF, сборка каталогов) —
// добавленная строка с записью в базу, удалением, запуском программ или чтением секретов
// откатывает весь файл
const DANGER = /\b(delete(One|Many)|update(One|Many)|insert(One|Many)?|findOneAnd\w+|findByIdAnd\w+|replaceOne|bulkWrite|drop\w*|\.save\(|\.create\(|destroy|child_process|exec(File)?(Sync)?\(|spawn|process\.env|unlink|rmSync|rmdir)\b/;

const cmd = process.argv[2];

if (cmd === 'task') {
  let t;
  try { t = await call('/task'); }
  catch (e) {
    // 412 — у запустившего не подключён Claude: сказать сайту по-человечески
    const msg = /^412/.test(e.message) ? 'Не подключён Claude у того, кто запустил правку — «Мой Claude» в разделе' : `Не удалось получить задачу: ${e.message}`;
    await call('/callback', { method: 'POST', body: JSON.stringify({ status: 'failed', error: msg, runUrl: RUN_URL }) }).catch(() => {});
    fs.writeFileSync('/tmp/reported', 'done');
    throw e;
  }
  // Личный токен подписки того, кто запустил правку: скрыть из логов и отдать Claude Code
  console.log(`::add-mask::${t.claudeToken}`);
  fs.appendFileSync(process.env.GITHUB_ENV, `CLAUDE_CODE_OAUTH_TOKEN=${t.claudeToken}\n`);
  delete t.claudeToken;
  if (t.model && /^[a-z0-9.-]+$/i.test(t.model)) fs.appendFileSync(process.env.GITHUB_ENV, `CLAUDE_MODEL=${t.model}\n`);
  fs.mkdirSync('.site-change-refs', { recursive: true });
  for (const img of t.images || []) {
    const r = await fetch(img.url);
    if (r.ok) fs.writeFileSync(`.site-change-refs/${img.name}`, Buffer.from(await r.arrayBuffer()));
  }
  fs.writeFileSync('/tmp/task.md', t.prompt);
  // Снимок каталога — чтобы Claude находил товары, сеты и категории, а не выдумывал
  try {
    const cat = await call('/catalog');
    fs.mkdirSync('.site-change-data', { recursive: true });
    // По строке на товар — чтобы Claude находил нужный поиском (Grep), а не читал мегабайт целиком
    fs.writeFileSync('.site-change-data/products.jsonl', (cat.products || []).map(p => JSON.stringify(p)).join('\n'));
    fs.writeFileSync('.site-change-data/brands.json', JSON.stringify(cat.brands || [], null, 1));
    fs.writeFileSync('.site-change-data/suppliers.txt', (cat.suppliers || []).join('\n'));
    console.log(`каталог: ${cat.products?.length || 0} товаров`);
  } catch (e) { console.log('каталог не получен:', e.message); }
  out('title', t.title);
  out('number', String(t.number));
  console.log(t.prompt);
} else if (cmd === 'stage') {
  // Строка хода работы в чат правки. Не критично: сайт не ответил — работа идёт дальше
  await call('/callback', { method: 'POST', body: JSON.stringify({ status: 'working', stage: process.argv.slice(3).join(' '), runUrl: RUN_URL }) }, 2)
    .catch(e => console.log('стадия не отправлена:', e.message));
} else if (cmd === 'report') {
  const body = JSON.parse(process.argv[3] || '{}');
  body.runUrl = RUN_URL;
  // Итоговый отчёт уже ушёл — шаг «Сбой» не должен перебить его общей ошибкой
  if (body.status !== 'working') fs.writeFileSync('/tmp/reported', 'done');
  console.log(await call('/callback', { method: 'POST', body: JSON.stringify(body) }));
} else if (cmd === 'ops') {
  // Список изменений каталога от Claude → /tmp/ops.json (на сайт уйдёт с отчётом), из рабочей папки убрать
  const f = '.site-change-ops.json';
  let ops = null;
  if (fs.existsSync(f)) {
    try { ops = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { ops = { ops: [], parseError: e.message }; }
    fs.rmSync(f);
  }
  const n = Array.isArray(ops?.ops) ? ops.ops.length : Array.isArray(ops) ? ops.length : 0;
  fs.writeFileSync('/tmp/ops.json', JSON.stringify(n ? ops : null));
  out('count', String(n));
  console.log('изменений каталога:', n);
} else if (cmd === 'guard') {
  fs.rmSync('.site-change-refs', { recursive: true, force: true });
  fs.rmSync('.site-change-data', { recursive: true, force: true });
  fs.rmSync('.site-change-ops.json', { force: true });
  sh('git add -A');
  const base = sh('git merge-base HEAD origin/main');
  const files = sh(`git diff --cached --name-only ${base}`).split('\n').filter(Boolean);
  const existed = f => { try { sh(`git cat-file -e ${base}:"${f}"`); return true; } catch { return false; } };
  const risky = f => sh(`git diff --cached -U0 ${base} -- "${f}"`).split('\n')
    .filter(l => l.startsWith('+') && !l.startsWith('+++')).some(l => DANGER.test(l));
  const bad = files.filter(f => CATALOG.test(f) ? !existed(f) || risky(f) : !ALLOWED.test(f) || FORBIDDEN.test(f));
  for (const f of bad) {
    // Вернуть файл к состоянию main; новый — удалить
    try { sh(`git cat-file -e ${base}:"${f}"`); sh(`git checkout ${base} -- "${f}"`); }
    catch { sh(`git rm -q --cached -f "${f}"`); fs.rmSync(f, { force: true }); }
  }
  sh('git add -A');
  const left = sh(`git diff --cached --name-only ${base}`).split('\n').filter(Boolean);
  out('reverted', JSON.stringify(bad));
  out('changed', String(left.length));
  out('files', JSON.stringify(left));
  console.log('изменено:', left, '\nотменено:', bad);
} else if (cmd === 'understand') {
  // Итог шага понимания: ПОНЯЛ → дальше правка; ВОПРОС/ОТВЕТ → в чат, ждём дизайнера
  let j = {};
  try { j = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')); } catch {}
  const raw = String(j.result || '').trim();
  const cost = Math.round((j.total_cost_usd || 0) * 10000) / 10000;
  const m = raw.match(/^\**\s*(ПОНЯЛ|ВОПРОС|ОТВЕТ)\s*\**[:\s]*/);
  const kind = m?.[1];
  const text = (m ? raw.slice(m[0].length) : raw).trim().slice(0, 3000);
  let tokenError = '';
  if (j.is_error || !raw) {
    if (/usage limit|rate.?limit|limit reached|out of (extra )?usage|5-hour limit|weekly limit/i.test(raw)) tokenError = 'Кончился лимит подписки Claude — попробуйте через несколько часов';
    else if (/invalid.*(api key|token)|oauth|authenticat|401|unauthori[sz]ed|expired/i.test(raw)) tokenError = 'Токен Claude недействителен или истёк — подключите заново в «Мой Claude»';
  }
  if (tokenError) {
    await call('/callback', { method: 'POST', body: JSON.stringify({ status: 'failed', error: tokenError, tokenError, costUsd: cost, runUrl: RUN_URL }) });
    fs.writeFileSync('/tmp/reported', 'done');
    out('go', 'false');
  } else if (kind === 'ВОПРОС' || kind === 'ОТВЕТ') {
    await call('/callback', { method: 'POST', body: JSON.stringify({ status: 'question', text, answer: kind === 'ОТВЕТ', costUsd: cost, runUrl: RUN_URL }) });
    fs.writeFileSync('/tmp/reported', 'done');
    out('go', 'false');
  } else {
    // ПОНЯЛ (или формат не распознан — считаем, что понял, и показываем как есть)
    await call('/callback', { method: 'POST', body: JSON.stringify({ status: 'working', say: `💡 Понял задачу так:\n${text}\n\nПриступаю.`, costUsd: cost, runUrl: RUN_URL }) }).catch(() => {});
    out('go', 'true');
  }
  out('text', text);
  out('cost', String(cost));
  console.log(kind, cost, '\n' + text);
} else if (cmd === 'summary') {
  // Первый файл — основной запуск (его итог показываем), второй — починка сборки (только стоимость)
  let text = '', cost = 0;
  process.argv.slice(3).forEach((file, i) => {
    if (!fs.existsSync(file)) return;
    try {
      const j = JSON.parse(fs.readFileSync(file, 'utf8'));
      cost += j.total_cost_usd || 0;
      if (i === 0) text = j.is_error ? `Ошибка Claude: ${j.result || j.subtype}` : (j.result || '');
    } catch (e) { if (i === 0) text = `Не удалось прочитать ответ Claude: ${e.message}`; }
  });
  cost = Math.round(cost * 10000) / 10000;
  // Ошибки подписки — отдельно: их видит человек, чей это Claude
  let tokenError = '';
  if (/usage limit|rate.?limit|limit reached|out of (extra )?usage|5-hour limit|weekly limit/i.test(text)) tokenError = 'Кончился лимит подписки Claude — попробуйте через несколько часов';
  else if (/invalid.*(api key|token)|oauth|authenticat|401|unauthori[sz]ed|expired/i.test(text)) tokenError = 'Токен Claude недействителен или истёк — подключите заново в «Мой Claude»';
  out('token_error', tokenError);
  out('text', text.slice(0, 3500));
  out('cost', String(cost));
  console.log(`$${cost}\n${text}`);
} else {
  console.error('неизвестная команда', cmd); process.exit(2);
}
