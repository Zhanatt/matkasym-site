// Планировщик очереди публикаций в Telegram-канал.
// Постит по одному посту за тик, с интервалом и окном по времени Кыргызстана (UTC+6).
// Тик дёргается и внутренним таймером (index.js), и внешним cron-пингом
// (/api/telegram-queue/tick) — на бесплатном Render внутренний таймер может «спать».
const { TelegramQueue, TelegramQueueConfig } = require('../models/TelegramQueue');
const { publishToChannel } = require('./telegram');

const KG_OFFSET = 6; // Кыргызстан = UTC+6, без перехода на летнее время

function fmtPrice(n) {
  return Number(n || 0).toLocaleString('ru-RU');
}

// Авто-черновик текста поста: название + характеристики + розничная цена.
// Остатки НЕ включаются — это витрина для клиентов. Совпадает с логикой AdminTelegramPost.
function buildCaption(p) {
  if (!p) return '';
  const lines = [];
  lines.push(`🆕 <b>${p.fullName || p.name || ''}</b>`);

  const specs = (p.specs || []).filter(s => s && s.key && s.value);
  if (specs.length) {
    lines.push('');
    specs.forEach(s => lines.push(`• ${s.key}: ${s.value}`));
  }

  lines.push('');
  if (p.priceUndefined || !p.price) {
    lines.push('💰 Цена по запросу');
  } else {
    lines.push(`💰 Цена: <b>${fmtPrice(p.price)} сом</b>`);
  }
  return lines.join('\n');
}

// Обложка поста: первая http-картинка Cloudinary, иначе Google Drive thumbnail.
function pickPhoto(p) {
  const http = (p.images || []).find(u => u && u.startsWith('http'));
  if (http) return http;
  const driveId = (p.driveImages || []).find(Boolean);
  if (driveId) return `https://drive.google.com/thumbnail?id=${driveId}&sz=w1200`;
  return '';
}

async function getConfig() {
  let cfg = await TelegramQueueConfig.findOne({ key: 'default' });
  if (!cfg) cfg = await TelegramQueueConfig.create({ key: 'default' });
  return cfg;
}

// Добавить товары в конец очереди. products — массив документов Product.
async function enqueueProducts(products, userId) {
  if (!products || !products.length) return 0;
  const last = await TelegramQueue.findOne().sort({ order: -1 }).select('order').lean();
  let order = (last?.order || 0) + 1;
  const docs = products.map(p => ({
    product:     p._id,
    productName: p.fullName || p.name || '',
    caption:     buildCaption(p),
    photoUrl:    pickPhoto(p),
    status:      'pending',
    order:       order++,
    createdBy:   userId || null,
  }));
  await TelegramQueue.insertMany(docs);
  return docs.length;
}

// Местный час Кыргызстана для даты.
function kgHour(date) {
  return (date.getUTCHours() + KG_OFFSET + 24) % 24;
}

// Попадает ли момент в окно публикации [start, end).
// Поддерживает как дневное окно (start<end), так и «через полночь» (start>end).
function inWindow(date, startHour, endHour) {
  if (startHour === endHour) return true; // окно на все сутки
  const h = kgHour(date);
  return startHour < endHour ? (h >= startHour && h < endHour) : (h >= startHour || h < endHour);
}

// Ближайший будущий момент начала окна (UTC).
function nextWindowStart(now, startHour) {
  const targetUtcHour = (startHour - KG_OFFSET + 24) % 24;
  const d = new Date(now);
  d.setUTCMinutes(0, 0, 0);
  d.setUTCHours(targetUtcHour);
  if (d <= now) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

let running = false; // защита от параллельного тика внутри одного процесса

// Один шаг планировщика: при наступлении времени публикует следующий пост.
async function tickQueue() {
  if (running) return { skipped: 'busy' };
  running = true;
  try {
    const cfg = await getConfig();
    if (!cfg.active) return { skipped: 'inactive' };

    const now = new Date();

    // Вне окна публикации — сдвигаем следующее время на начало окна и ждём.
    if (!inWindow(now, cfg.windowStartHour, cfg.windowEndHour)) {
      const ws = nextWindowStart(now, cfg.windowStartHour);
      if (!cfg.nextAt || cfg.nextAt < ws) {
        await TelegramQueueConfig.updateOne({ key: 'default' }, { $set: { nextAt: ws } });
      }
      return { skipped: 'outside-window' };
    }

    // Ещё не подошло время следующего поста.
    if (cfg.nextAt && now < cfg.nextAt) return { skipped: 'not-due' };

    // Атомарно забираем следующий ожидающий пост (pending → publishing).
    // Это же защищает от двойной публикации, если тик придёт параллельно.
    const item = await TelegramQueue.findOneAndUpdate(
      { status: 'pending' },
      { $set: { status: 'publishing' } },
      { sort: { order: 1 }, new: true },
    );
    if (!item) return { skipped: 'empty' }; // очередь пуста — nextAt НЕ двигаем

    // Пост есть — двигаем расписание на интервал вперёд.
    await TelegramQueueConfig.updateOne(
      { key: 'default' },
      { $set: { nextAt: new Date(now.getTime() + cfg.intervalMinutes * 60 * 1000), lastPublishedAt: now } },
    );

    const result = await publishToChannel({ photoUrl: item.photoUrl || null, caption: item.caption });
    if (result.ok) {
      item.status = 'published';
      item.publishedAt = new Date();
      item.error = '';
    } else {
      item.status = 'failed';
      item.error = result.error || 'unknown error';
    }
    await item.save();

    return { published: result.ok, itemId: String(item._id), error: result.ok ? undefined : item.error };
  } catch (e) {
    console.error('[TelegramQueue] tick error:', e.message);
    return { error: e.message };
  } finally {
    running = false;
  }
}

module.exports = { buildCaption, pickPhoto, getConfig, enqueueProducts, tickQueue };
