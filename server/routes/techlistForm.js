/**
 * Публичная форма «Заявка на техлист» → задачи в проекте R&D Битрикс24.
 *
 * Менеджеры по продажам заходят по ссылке без входа (/techlist): у них нет аккаунтов
 * в Продакт матрице, а заявку нужно подать быстро, с телефона. Один заказчик может
 * заказать несколько изделий — на каждое изделие создаётся своя задача, потому что
 * по этапам канбана (техлист → 3D → чертёж → образец…) изделия идут независимо.
 *
 * Задачи ставятся в проект Product Management (группа 31), колонка «Заявка на техлист»,
 * ответственный — тот, кого менеджер выбрал в «Кто делает техлист» (Жанат или Абдил). Дальше конструкторы сами переносят
 * задачу на «3D моделирование», назначают себя и ставят срок.
 *
 * Вебхук с правами task + sonet_group живёт только в env B24_TASKS_WEBHOOK
 * (репозиторий публичный). Файлы прикрепляются к задаче через task.item.addfile —
 * они ложатся на Диск владельца вебхука, отдельные права на disk не нужны.
 */
const router = require('express').Router();
const multer = require('multer');
const axios  = require('axios');

const PORTAL         = 'https://matkasymov.bitrix24.kz';
const GROUP_ID       = process.env.TECHLIST_GROUP_ID       || '31';
const STAGE_ID       = process.env.TECHLIST_STAGE_ID       || '1169'; // «Заявка на техлист»

// Кто делает техлист — менеджер выбирает в форме, задача ставится на этого человека.
const MAKERS = [
  { id: '153247', name: 'Жанат' },
  { id: '88257',  name: 'Абдил' },
];

// Менеджеры по продажам и их id в Битриксе. Менеджер становится постановщиком задачи:
// так он сразу в чате задачи и видит, как идёт его заявка, а ответственному (Жанату
// или Абдилу) приходит уведомление о новой задаче — «сам себе» Битрикс не уведомляет.
// Список можно переопределить в env TECHLIST_MANAGERS: «Имя:id,Имя:id».
const DEFAULT_MANAGERS = [
  { name: 'Медербеков Абдил',        id: '88257' },
  { name: 'Бейшеналиева Айзат',      id: '80535' },
  { name: 'Мустапакул кызы Айчүрөк', id: '4431' },
  { name: 'Жаныбек уулу Муктарали',  id: '16799' },
  { name: 'Кубатбеков Саламат',      id: '6539' },
];
const managerList = () => (process.env.TECHLIST_MANAGERS
  ? process.env.TECHLIST_MANAGERS.split(',').map(s => { const [name, id] = s.split(':'); return { name: name.trim(), id: (id || '').trim() }; }).filter(m => m.name)
  : DEFAULT_MANAGERS);
const managers = () => managerList().map(m => m.name);

// Render free — 512 МБ памяти, файлы держим в памяти и ещё кодируем в base64.
const MAX_FILE  = 10 * 1024 * 1024;
const MAX_FILES = 15;
const MAX_TOTAL = 40 * 1024 * 1024;
const MAX_ITEMS = 20;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE, files: MAX_FILES } });

// Ссылка открытая — простая защита от случайного флуда: не больше 20 отправок в час с адреса.
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < 60 * 60 * 1000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 20;
}

function bitrix() {
  const hook = process.env.B24_TASKS_WEBHOOK;
  if (!hook) throw new Error('Форма не подключена к Битриксу: не задан B24_TASKS_WEBHOOK');
  return axios.create({ baseURL: hook.replace(/\/?$/, '/'), timeout: 120000, maxBodyLength: Infinity });
}

async function call(client, method, params) {
  try {
    const { data } = await client.post(`${method}.json`, params);
    if (data.error) throw new Error(data.error_description || data.error);
    return data.result;
  } catch (err) {
    const body = err.response?.data;
    if (body?.error) throw new Error(`Bitrix24 ${method}: ${body.error_description || body.error}`);
    throw err;
  }
}

// Квадратные скобки в тексте Битрикс принимает за BB-код — меняем на круглые.
const clean = (v, max = 500) => String(v ?? '').replace(/\[/g, '(').replace(/]/g, ')').trim().slice(0, max);
const fileNameOf = f => Buffer.from(f.originalname || 'file', 'latin1').toString('utf8');
const fmtNum = n => Number(n).toLocaleString('ru-RU');

function describe({ order, item, index, total, others }) {
  const line = (label, value) => (value ? `[b]${label}:[/b] ${value}\n` : '');
  let d = '';
  d += line('Заказчик', order.client);
  d += line('Менеджер', order.manager);
  d += line('Объект', order.object);
  d += '\n';
  d += line('Изделие', item.name);
  d += line('Количество', `${fmtNum(item.qty)} шт`);
  d += line('Цена за ед.', `${fmtNum(item.price)} сом`);
  d += line('Размеры', item.dimensions);
  d += line('Материал / толщина', item.material);
  d += line('Покрытие / RAL', item.coating);
  d += line('Комментарий к изделию', item.note);
  d += '\n';
  d += line('Желаемый срок', order.deadline);
  d += line('Примечание к заказу', order.note);
  if (total > 1) d += `\nВ заказе ${total} изделия, это ${index + 1}-е. Остальные: ${others.join('; ')}\n`;
  d += `\nЗаявка с формы ${order.createdAt}, метка заказа: ${order.code}`;
  return d;
}

// Исходящий вебхук Битрикса (ONTASKUPDATE): тело не читаем — это только сигнал «что-то
// изменилось», сама проверка берёт данные из Битрикса. См. lib/rndAutoAssign.js.
router.post('/b24-event', (req, res) => {
  res.json({ ok: true });
  require('../lib/rndAutoAssign').sweep();
});

router.get('/config', (req, res) => res.json({ managers: managers(), makers: MAKERS.map(m => ({ id: m.id, name: m.name })), maxFile: MAX_FILE, maxFiles: MAX_FILES, maxTotal: MAX_TOTAL }));

router.post('/', upload.any(), async (req, res) => {
  try {
    if (req.body.website) return res.json({ ok: true, tasks: [] }); // поле-ловушка для ботов

    const ip = String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
    if (rateLimited(ip)) return res.status(429).json({ message: 'Слишком много заявок подряд. Попробуйте через час.' });

    let items;
    try { items = JSON.parse(req.body.items || '[]'); } catch { items = null; }
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ message: 'Добавьте хотя бы одно изделие' });
    if (items.length > MAX_ITEMS) return res.status(400).json({ message: `Не больше ${MAX_ITEMS} изделий в одной заявке` });

    const now = new Date(Date.now() + 6 * 3600 * 1000); // Бишкек, UTC+6
    const order = {
      client:   clean(req.body.client, 200),
      manager:  clean(req.body.manager, 100),
      object:   clean(req.body.object, 200),
      deadline: clean(req.body.deadline, 30),
      note:     clean(req.body.note, 3000),
      createdAt: now.toISOString().slice(0, 16).replace('T', ' '),
      code: `ТЛ-${now.toISOString().slice(2, 16).replace(/[-T:]/g, '')}`,
    };

    const problems = [];
    if (!order.client)  problems.push('заказчик');
    if (!order.manager) problems.push('менеджер');
    const maker = MAKERS.find(m => m.id === String(req.body.maker));
    if (!maker) problems.push('кто делает техлист');
    items = items.map((it, i) => {
      const item = {
        name: clean(it.name, 200), dimensions: clean(it.dimensions, 200), material: clean(it.material, 200),
        coating: clean(it.coating, 200), note: clean(it.note, 2000),
        qty: Number(String(it.qty).replace(',', '.')), price: Number(String(it.price).replace(/\s/g, '').replace(',', '.')),
      };
      if (!item.name) problems.push(`изделие ${i + 1}: название`);
      if (!(item.qty > 0)) problems.push(`изделие ${i + 1}: количество`);
      if (!(item.price >= 0) || String(it.price).trim() === '') problems.push(`изделие ${i + 1}: цена за ед.`);
      return item;
    });

    const managerId = managerList().find(m => m.name === order.manager)?.id || '';
    const files = req.files || [];
    if (!files.length) problems.push('файлы: приложите чертёж, фото или заявку клиента');
    if (problems.length) return res.status(400).json({ message: `Не заполнено: ${problems.join(', ')}` });
    if (files.reduce((s, f) => s + f.size, 0) > MAX_TOTAL) return res.status(400).json({ message: 'Файлы вместе больше 40 МБ' });

    // Поле files_common — общие файлы заказа (попадут в каждую задачу), files_<i> — к изделию i.
    const filesFor = i => files.filter(f => f.fieldname === 'files_common' || f.fieldname === `files_${i}`);

    const client = bitrix();
    const created = [];
    const warnings = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const others = items.filter((_, j) => j !== i).map(x => x.name);
      const fields = {
        TITLE: `Техлист: ${item.name} — ${order.client}`.slice(0, 250),
        DESCRIPTION: describe({ order, item, index: i, total: items.length, others }),
        GROUP_ID, STAGE_ID, RESPONSIBLE_ID: maker.id,
        TAGS: [order.code],
      };
      let task;
      if (managerId) {
        try {
          task = await call(client, 'tasks.task.add', { fields: { ...fields, CREATED_BY: managerId } });
        } catch (e) {
          // Не дали поставить менеджера постановщиком — пусть хотя бы наблюдает (он тоже в чате задачи)
          console.error('[techlist-form] постановщик', managerId, e.message);
          task = await call(client, 'tasks.task.add', { fields: { ...fields, AUDITORS: [managerId] } });
        }
      } else {
        task = await call(client, 'tasks.task.add', { fields });
      }
      const id = task.task.id;
      created.push({ id, title: item.name, url: `${PORTAL}/workgroups/group/${GROUP_ID}/tasks/task/view/${id}/` });

      for (const f of filesFor(i)) {
        try {
          await call(client, 'task.item.addfile', {
            TASK_ID: id,
            FILE: { NAME: fileNameOf(f), CONTENT: f.buffer.toString('base64') },
          });
        } catch (e) {
          warnings.push(`«${fileNameOf(f)}» не прикрепился к «${item.name}»: ${e.message}`);
        }
      }
    }

    console.log(`[techlist-form] ${order.code}: ${order.manager} → ${order.client}, задач ${created.length}`);
    res.json({ ok: true, code: order.code, tasks: created, warnings });
  } catch (e) {
    console.error('[techlist-form]', e.message);
    res.status(500).json({ message: e.message });
  }
});

router.use((err, req, res, next) => {
  if (err?.code === 'LIMIT_FILE_SIZE')  return res.status(400).json({ message: 'Один из файлов больше 10 МБ' });
  if (err?.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ message: `Не больше ${MAX_FILES} файлов в заявке` });
  next(err);
});

module.exports = router;
