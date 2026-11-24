/**
 * «Вернуть на доработку» (/techlist/rework/:taskId?k=…): клиент на утверждении захотел
 * изменить техлист. Менеджер обязательно пишет, что изменить (можно приложить файлы) —
 * задача уходит в «Заявку на техлист», комментарий — в чат задачи.
 *
 * Отправка на утверждение сайта не требует: её делает перенос в «Завершённые техлисты»
 * (см. lib/rndAutoAssign.js → checkApproval).
 */
const router = require('express').Router();
const multer = require('multer');
const TechlistApproval = require('../models/TechlistApproval');
const { GROUP_ID, STAGES, client, call, checkSign, taskUrl } = require('../lib/rndBitrix');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 5 } });
const fileNameOf = f => Buffer.from(f.originalname || 'file', 'latin1').toString('utf8');
const clean = (v, max = 500) => String(v ?? '').replace(/\[/g, '(').replace(/]/g, ')').trim().slice(0, max);

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
