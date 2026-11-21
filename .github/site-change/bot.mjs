// Помощник воркфлоу «Правки сайта» (.github/workflows/site-change.yml).
//   node bot.mjs task             — забрать задачу с сайта: /tmp/task.md + картинки в .site-change-refs/
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
  const t = await call('/task');
  fs.mkdirSync('.site-change-refs', { recursive: true });
  for (const img of t.images || []) {
    const r = await fetch(img.url);
    if (r.ok) fs.writeFileSync(`.site-change-refs/${img.name}`, Buffer.from(await r.arrayBuffer()));
  }
  fs.writeFileSync('/tmp/task.md', t.prompt);
  out('title', t.title);
  out('number', String(t.number));
  console.log(t.prompt);
} else if (cmd === 'report') {
  const body = JSON.parse(process.argv[3] || '{}');
  body.runUrl = RUN_URL;
  console.log(await call('/callback', { method: 'POST', body: JSON.stringify(body) }));
} else if (cmd === 'guard') {
  fs.rmSync('.site-change-refs', { recursive: true, force: true });
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
  console.log('изменено:', left, '\nотменено:', bad);
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
  out('text', text.slice(0, 3500));
  out('cost', String(cost));
  console.log(`$${cost}\n${text}`);
} else {
  console.error('неизвестная команда', cmd); process.exit(2);
}
