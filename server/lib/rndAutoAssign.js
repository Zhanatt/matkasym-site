/**
 * Канбан R&D (Битрикс24, проект 31): кто перевёл задачу из «Завершённых техлистов»
 * дальше — тот и становится ответственным.
 *
 * Конструктор берёт подписанный техлист и тащит карточку в «3D моделирование»: задача
 * должна сразу стать его, без ручной смены ответственного. То же на каждом следующем
 * этапе (Чертёж, Норма расхода, Образец, Передали на производство).
 *
 * Как определяем «кто перевёл»: в истории задачи (tasks.task.history.list) есть запись
 * STAGE с пользователем. Меняем ответственного, только если последний перенос НОВЕЕ
 * последней смены ответственного: если после переноса кто-то сам назначил другого
 * человека, его решение не перебиваем. Наша же смена ответственного становится
 * самой свежей записью — повторно задача не трогается. Состояние хранить не нужно.
 *
 * Когда проверяем: Битрикс шлёт исходящий вебхук ONTASKUPDATE на /api/techlist-form/b24-event,
 * а мы пробегаем задачи проекта, изменённые с прошлой проверки. Тело события не читаем
 * (ему не нужно доверять — проверка всё берёт из самого Битрикса). На Render free сервер
 * засыпает, и событие, разбудившее его, может потеряться — поэтому при старте проверяем
 * задачи за двое суток, а пока сервер не спит — ещё и каждую минуту.
 */
const axios = require('axios');
const { STAGES, APPROVAL_STAGE_TITLE, BEFORE_APPROVAL_TITLES, approveUrl, reworkUrl } = require('./rndBitrix');

const GROUP_ID = process.env.TECHLIST_GROUP_ID || '31';
// Этапы после «Завершённых техлистов»: Техлисты с подписью, 3D, Чертёж, Норма расхода,
// Образец, Передали на производство.
const AUTO_STAGES = new Set((process.env.RND_AUTO_STAGES || '2285,2287,2289,2291,2293,2295').split(','));

let lastSweep = Date.now() - 48 * 3600 * 1000;
const status = { lastEventAt: null, lastSweepAt: null, lastChange: null };
let running = null;
let again = false;

function client() {
  const hook = process.env.B24_TASKS_WEBHOOK;
  if (!hook) return null;
  return axios.create({ baseURL: hook.replace(/\/?$/, '/'), timeout: 60000 });
}

async function call(c, method, params) {
  const { data } = await c.post(`${method}.json`, params);
  if (data.error) throw new Error(`${method}: ${data.error_description || data.error}`);
  return data;
}

// «Завершённые техлисты» = этап утверждения. Попасть туда можно только через страницу
// «Оформить на утверждение» (она пишет TechlistApproval перед переносом). Перетащили
// вручную — возвращаем в «Обработку техлиста» и пишем в чат, как оформить.
async function checkApproval(c, task, list) {
  const moves = list.filter(h => h.field === 'STAGE').sort((a, b) => b.id - a.id);
  const move = moves.find(h => h.value?.to === APPROVAL_STAGE_TITLE) || moves[0];
  if (!move) return null;
  const at = new Date(move.createdDate).getTime();
  const TechlistApproval = require('../models/TechlistApproval');
  const ok = await TechlistApproval.exists({
    taskId: String(task.id), kind: { $in: ['approval', 'restore'] },
    createdAt: { $gte: new Date(at - 15 * 60 * 1000), $lte: new Date(at + 2 * 60 * 1000) },
  });
  if (ok) return null;
  await TechlistApproval.create({ taskId: String(task.id), kind: 'bounce' }); // чтобы checkRework не вернул её обратно
  await call(c, 'tasks.task.update', { taskId: task.id, fields: { STAGE_ID: STAGES.processing } });
  await call(c, 'task.commentitem.add', { TASKID: task.id, fields: { POST_MESSAGE:
    `⚠️ Задача возвращена в «Обработку техлиста». В «${APPROVAL_STAGE_TITLE}» её переводит только оформление на утверждение — `
    + `заполните параметры и приложите PDF техлиста: [url=${approveUrl(task.id)}]Оформить на утверждение[/url]` } });
  status.lastChange = { at: new Date().toISOString(), task: task.id, bounced: true };
  console.log(`[rnd-auto-assign] задача ${task.id} «${task.title}»: перенесли в утверждение без оформления — вернули`);
  return 'bounced';
}

// Из «Завершённых техлистов» назад (в «Заявку» или «Обработку») — только через
// «Вернуть на доработку» с комментарием, что изменить. Утащили вручную — возвращаем
// в «Завершённые» (с записью restore, чтобы проверка утверждения её не выкинула).
async function checkRework(c, task, list) {
  const move = list.filter(h => h.field === 'STAGE').sort((a, b) => b.id - a.id)[0];
  if (!move || move.value?.from !== APPROVAL_STAGE_TITLE || !BEFORE_APPROVAL_TITLES.includes(move.value?.to)) return null;
  const at = new Date(move.createdDate).getTime();
  const TechlistApproval = require('../models/TechlistApproval');
  const ok = await TechlistApproval.exists({
    taskId: String(task.id), kind: { $in: ['rework', 'bounce'] },
    createdAt: { $gte: new Date(at - 15 * 60 * 1000), $lte: new Date(at + 2 * 60 * 1000) },
  });
  if (ok) return null;
  await TechlistApproval.create({ taskId: String(task.id), kind: 'restore' });
  await call(c, 'tasks.task.update', { taskId: task.id, fields: { STAGE_ID: STAGES.approval } });
  await call(c, 'task.commentitem.add', { TASKID: task.id, fields: { POST_MESSAGE:
    `⚠️ Задача возвращена в «${APPROVAL_STAGE_TITLE}». Если клиент просит изменения, верните её через `
    + `[url=${reworkUrl(task.id)}]Вернуть на доработку[/url] и напишите, что изменить.` } });
  status.lastChange = { at: new Date().toISOString(), task: task.id, restored: true };
  console.log(`[rnd-auto-assign] задача ${task.id} «${task.title}»: утащили из утверждения без комментария — вернули`);
  return 'restored';
}

async function checkTask(c, task) {
  const stage = String(task.stageId);
  const isApproval = stage === STAGES.approval;
  const isEarly = stage === STAGES.request || stage === STAGES.processing;
  if (!isApproval && !isEarly && !AUTO_STAGES.has(stage)) return null;
  const { result } = await call(c, 'tasks.task.history.list', { taskId: task.id });
  const list = result.list || [];
  if (isApproval) return checkApproval(c, task, list);
  if (isEarly) return checkRework(c, task, list);
  const lastOf = field => list.filter(h => h.field === field).sort((a, b) => b.id - a.id)[0];
  const move = lastOf('STAGE');
  if (!move) return null;
  const reassign = lastOf('RESPONSIBLE_ID');
  if (reassign && reassign.id > move.id) return null; // после переноса ответственного уже меняли
  const mover = String(move.user?.id || '');
  if (!mover || mover === String(task.responsibleId)) return null;
  await call(c, 'tasks.task.update', { taskId: task.id, fields: { RESPONSIBLE_ID: mover } });
  status.lastChange = { at: new Date().toISOString(), task: task.id, to: mover };
  console.log(`[rnd-auto-assign] задача ${task.id} «${task.title}»: ${move.value?.to} → ответственный ${move.user.name} ${move.user.lastName || ''}`);
  return mover;
}

async function sweepOnce() {
  const c = client();
  if (!c) return;
  const since = new Date(lastSweep - 60 * 1000); // минута запаса на расхождение часов
  const startedAt = Date.now();
  let start = 0;
  for (;;) {
    const data = await call(c, 'tasks.task.list', {
      filter: { GROUP_ID, '>=CHANGED_DATE': since.toISOString() },
      select: ['ID', 'TITLE', 'STAGE_ID', 'RESPONSIBLE_ID'],
      start,
    });
    for (const t of data.result.tasks || []) {
      try { await checkTask(c, t); } catch (e) { console.error('[rnd-auto-assign]', t.id, e.message); }
    }
    if (data.next === undefined) break;
    start = data.next;
  }
  lastSweep = startedAt;
  status.lastSweepAt = new Date(startedAt).toISOString();
}

// События приходят пачками (перенос карточки = несколько обновлений) — проверки не
// запускаем параллельно: если во время проверки пришло ещё событие, пройдём ещё раз.
function sweep() {
  if (running) { again = true; return running; }
  running = (async () => {
    try {
      do { again = false; await sweepOnce(); } while (again);
    } catch (e) {
      console.error('[rnd-auto-assign] проверка не удалась:', e.message);
    } finally {
      running = null;
    }
  })();
  return running;
}

function start() {
  if (!process.env.B24_TASKS_WEBHOOK) return;
  setTimeout(sweep, 15 * 1000);
  setInterval(sweep, 60 * 1000).unref();
}

module.exports = { sweep, start, checkTask, status };
