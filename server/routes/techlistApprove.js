/**
 * «Оформить на утверждение» — единственный путь задачи R&D в «Завершённые техлисты».
 *
 * Страница /techlist/approve/:taskId?k=… (ссылка с подписью лежит в описании задачи и
 * в комментарии, если задачу вернули). Подставляет данные заявки, требует заполнить
 * параметры сообщения «Техлист на утверждение» и приложить PDF техлиста. После отправки:
 * PDF прикрепляется к задачам, сообщение уходит комментарием в чат каждой задачи (там
 * менеджер-постановщик), задачи переходят в «Завершённые техлисты».
 *
 * Если в заказе несколько изделий (задачи с общей меткой ТЛ-…), они оформляются одним
 * сообщением — как «Щиты, 2 позиции» в образце из инструкции техлистов (раздел 16).
 */
const router = require('express').Router();
const multer = require('multer');
const TechlistApproval = require('../models/TechlistApproval');
const { GROUP_ID, STAGES, client, call, checkSign, taskUrl, reworkUrl } = require('../lib/rndBitrix');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 5 } });

const fileNameOf = f => Buffer.from(f.originalname || 'techlist.pdf', 'latin1').toString('utf8');
const clean = (v, max = 500) => String(v ?? '').replace(/\[/g, '(').replace(/]/g, ')').trim().slice(0, max);
const num = v => Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
const money = n => Math.round(n).toLocaleString('ru-RU').replace(/\s/g, ' ');
const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

// Описание задачи с формы: строки «[b]Подпись:[/b] значение»
function parseDescription(text = '') {
  const out = {};
  for (const m of String(text).matchAll(/\[b\]([^[]+?):\[\/b\]\s*([^\n]*)/g)) out[m[1].trim()] = m[2].trim();
  return out;
}
const orderTag = task => Object.values(task.tags || {}).map(t => t.title).find(t => /^ТЛ-/.test(t)) || '';

function buildMessage({ category, client: cl, manager, positions }) {
  const total = positions.reduce((s, p) => s + p.qty * p.price, 0);
  const items = positions.reduce((s, p) => s + p.qty, 0);
  const n = positions.length;
  const lines = [
    'Техлист на утверждение', '',
    `${category}, ${n} ${plural(n, 'позиция', 'позиции', 'позиций')}:`,
    ...positions.map(p => ` • ${p.fullName}`), '',
    'Количество:', '', ...positions.map(p => ` • ${p.short} : ${p.qty}шт`), '',
    'Цена:', '', ...positions.map(p => ` • ${p.short} : ${money(p.price)} сом`), '',
    'Сумма по позициям:', '', ...positions.map(p => ` • ${p.short} : ${money(p.qty * p.price)} сом`), '',
    `Общая сумма: ${money(total)} сом (${items} ${plural(items, 'изделие', 'изделия', 'изделий')})`, '',
    `Менеджер: ${manager}`,
    `Клиент: ${cl}`,
  ];
  return lines.join('\n');
}

// Задача + остальные изделия того же заказа (общая метка ТЛ-…)
async function loadOrder(taskId) {
  const c = client();
  const sel = ['ID', 'TITLE', 'DESCRIPTION', 'TAGS', 'GROUP_ID', 'STAGE_ID'];
  const { task } = await call('tasks.task.get', { taskId, select: sel }, c);
  if (!task || String(task.groupId) !== GROUP_ID) throw Object.assign(new Error('Задача не из проекта R&D'), { status: 404 });
  const tag = orderTag(task);
  let tasks = [task];
  if (tag) {
    const r = await call('tasks.task.list', { filter: { GROUP_ID, TAG: tag }, select: sel }, c);
    const same = (r.tasks || []).filter(t => orderTag(t) === tag);
    if (same.length) tasks = same.sort((a, b) => a.id - b.id);
    if (!tasks.some(t => String(t.id) === String(task.id))) tasks.unshift(task);
  }
  return { task, tag, tasks, c };
}

router.get('/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    if (!checkSign(taskId, req.query.k)) return res.status(403).json({ message: 'Ссылка неверная — откройте её из задачи в Битриксе' });
    const { task, tag, tasks } = await loadOrder(taskId);
    const d = parseDescription(task.description);
    res.json({
      taskId: String(task.id), tag, taskUrl: taskUrl(task.id),
      client: d['Заказчик'] || '', manager: d['Менеджер'] || '',
      positions: tasks.map(t => {
        const td = parseDescription(t.description);
        const name = td['Изделие'] || t.title.replace(/^Техлист:\s*/, '').replace(/\s+—\s+.*$/, '');
        return {
          taskId: String(t.id), stageId: String(t.stageId), short: name,
          fullName: [name, td['Размеры']].filter(Boolean).join(' '),
          qty: td['Количество'] ? num(td['Количество'].replace(/шт/i, '')) || '' : '',
          price: td['Цена за ед.'] ? num(td['Цена за ед.'].replace(/сом/i, '')) || '' : '',
        };
      }),
    });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
});

router.post('/:taskId', upload.array('techlist', 5), async (req, res) => {
  try {
    const { taskId } = req.params;
    if (!checkSign(taskId, req.query.k)) return res.status(403).json({ message: 'Ссылка неверная — откройте её из задачи в Битриксе' });

    let positions;
    try { positions = JSON.parse(req.body.positions || '[]'); } catch { positions = []; }
    const data = {
      category: clean(req.body.category, 100),
      client:   clean(req.body.client, 200),
      manager:  clean(req.body.manager, 100),
      positions: positions.slice(0, 20).map(p => ({
        taskId: p.taskId ? String(p.taskId) : '',
        fullName: clean(p.fullName, 400), short: clean(p.short, 100),
        qty: num(p.qty), price: num(p.price), priceRaw: String(p.price ?? '').trim(),
      })),
    };

    const problems = [];
    if (!data.category) problems.push('категория');
    if (!data.client) problems.push('клиент');
    if (!data.manager) problems.push('менеджер');
    if (!data.positions.length) problems.push('позиции');
    data.positions.forEach((p, i) => {
      if (!p.fullName) problems.push(`позиция ${i + 1}: название с параметрами`);
      if (!p.short) problems.push(`позиция ${i + 1}: краткое название`);
      if (!(p.qty > 0)) problems.push(`позиция ${i + 1}: количество`);
      if (!p.priceRaw || !(p.price >= 0)) problems.push(`позиция ${i + 1}: цена`);
    });
    const files = req.files || [];
    if (!files.length) problems.push('PDF техлиста');
    if (problems.length) return res.status(400).json({ message: `Не заполнено: ${problems.join(', ')}` });

    // Двигать можно только задачи этого же заказа
    const { tasks, c } = await loadOrder(taskId);
    const allowed = new Set(tasks.map(t => String(t.id)));
    const targets = [...new Set([String(taskId), ...data.positions.map(p => p.taskId).filter(id => allowed.has(id))])];

    const message = buildMessage(data);
    const warnings = [];
    for (const id of targets) {
      for (const f of files) {
        try {
          await call('task.item.addfile', { TASK_ID: id, FILE: { NAME: fileNameOf(f), CONTENT: f.buffer.toString('base64') } }, c);
        } catch (e) { warnings.push(`файл «${fileNameOf(f)}» к задаче ${id}: ${e.message}`); }
      }
      await call('task.commentitem.add', { TASKID: id, fields: { POST_MESSAGE:
        `${message}\n\nКлиент просит изменения? [url=${reworkUrl(id)}]Вернуть на доработку[/url]` } }, c);
      // Запись — до переноса: иначе проверка переносов успеет вернуть задачу назад
      await TechlistApproval.create({ taskId: id, message, data: { ...data, files: files.map(fileNameOf) } });
      await call('tasks.task.update', { taskId: id, fields: { STAGE_ID: STAGES.approval } }, c);
    }

    console.log(`[techlist-approve] задачи ${targets.join(', ')} → на утверждение (${data.manager}, ${data.client})`);
    res.json({ ok: true, message, moved: targets, warnings });
  } catch (e) {
    console.error('[techlist-approve]', e.message);
    res.status(e.status || 500).json({ message: e.message });
  }
});

// «Вернуть на доработку»: клиент на утверждении захотел изменений. Менеджер пишет, что
// изменить (обязательно), можно приложить файлы — задача уходит в «Заявку на техлист».
router.get('/:taskId/rework', async (req, res) => {
  try {
    const { taskId } = req.params;
    if (!checkSign(taskId, req.query.k)) return res.status(403).json({ message: 'Ссылка неверная — откройте её из задачи в Битриксе' });
    const { task } = await call('tasks.task.get', { taskId, select: ['ID', 'TITLE', 'GROUP_ID', 'STAGE_ID'] });
    if (!task || String(task.groupId) !== GROUP_ID) return res.status(404).json({ message: 'Задача не из проекта R&D' });
    res.json({ taskId: String(task.id), title: task.title, stageId: String(task.stageId), taskUrl: taskUrl(task.id) });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/:taskId/rework', upload.array('files', 5), async (req, res) => {
  try {
    const { taskId } = req.params;
    if (!checkSign(taskId, req.query.k)) return res.status(403).json({ message: 'Ссылка неверная — откройте её из задачи в Битриксе' });
    const what = String(req.body.what || '').trim().slice(0, 4000);
    if (what.length < 3) return res.status(400).json({ message: 'Напишите, что нужно изменить' });
    const c = client();
    const { task } = await call('tasks.task.get', { taskId, select: ['ID', 'GROUP_ID'] }, c);
    if (!task || String(task.groupId) !== GROUP_ID) return res.status(404).json({ message: 'Задача не из проекта R&D' });
    for (const f of req.files || []) {
      await call('task.item.addfile', { TASK_ID: taskId, FILE: { NAME: fileNameOf(f), CONTENT: f.buffer.toString('base64') } }, c);
    }
    await call('task.commentitem.add', { TASKID: taskId, fields: { POST_MESSAGE:
      `🔁 Клиент просит изменить техлист — задача возвращена в «Заявку на техлист».\n\nЧто изменить:\n${clean(what, 4000)}` } }, c);
    await TechlistApproval.create({ taskId: String(taskId), kind: 'rework', message: what });
    await call('tasks.task.update', { taskId, fields: { STAGE_ID: STAGES.request } }, c);
    console.log(`[techlist-approve] задача ${taskId} возвращена на доработку`);
    res.json({ ok: true });
  } catch (e) {
    console.error('[techlist-rework]', e.message);
    res.status(500).json({ message: e.message });
  }
});

router.use((err, req, res, next) => {
  if (err?.code === 'LIMIT_FILE_SIZE')  return res.status(400).json({ message: 'Файл больше 20 МБ' });
  if (err?.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ message: 'Не больше 5 файлов' });
  next(err);
});

module.exports = router;
module.exports.buildMessage = buildMessage;
