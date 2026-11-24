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

const GROUP_ID = process.env.TECHLIST_GROUP_ID || '31';
// Этапы после «Завершённых техлистов»: Техлисты с подписью, 3D, Чертёж, Норма расхода,
// Образец, Передали на производство.
const AUTO_STAGES = new Set((process.env.RND_AUTO_STAGES || '2285,2287,2289,2291,2293,2295').split(','));

let lastSweep = Date.now() - 48 * 3600 * 1000;
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

async function checkTask(c, task) {
  if (!AUTO_STAGES.has(String(task.stageId))) return null;
  const { result } = await call(c, 'tasks.task.history.list', { taskId: task.id });
  const list = result.list || [];
  const lastOf = field => list.filter(h => h.field === field).sort((a, b) => b.id - a.id)[0];
  const move = lastOf('STAGE');
  if (!move) return null;
  const reassign = lastOf('RESPONSIBLE_ID');
  if (reassign && reassign.id > move.id) return null; // после переноса ответственного уже меняли
  const mover = String(move.user?.id || '');
  if (!mover || mover === String(task.responsibleId)) return null;
  await call(c, 'tasks.task.update', { taskId: task.id, fields: { RESPONSIBLE_ID: mover } });
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

module.exports = { sweep, start, checkTask };
