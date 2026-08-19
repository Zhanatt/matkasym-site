/**
 * Обращения из Битрикса — сколько людей написало нам за период и по какому каналу.
 *
 * Метки постов (#inst_matrix, #tg_matrix) сюда не годятся: Wazzup оставляет текст
 * первого сообщения внутри чата открытой линии, в поля CRM он не попадает, а наш
 * вебхук выдан с правами только на crm. Поэтому считаем не по метке, а по источнику
 * обращения — так Битрикс сам размечает лид или сделку в момент создания.
 *
 * Считаем через total ответа, а не выкачиванием записей: за неделю в портале
 * набегает больше двух тысяч сделок, постранично это полсотни запросов на цифру.
 */
const { count } = require('../utils/bitrix24');

// Источники в портале заведены по одному на каждый подключённый номер и аккаунт
// («WAZZUP: WhatsApp - 996703939070 Город»), поэтому канал определяем по образцу
// в коде источника, а не перечислением.
const CHANNELS = [
  { key: 'instagram', label: 'Instagram Direct', re: /FBINSTAGRAMDIRECT/i },
  { key: 'whatsapp',  label: 'WhatsApp',         re: /WZ_WHATSAPP|^WZ[0-9a-f]{8}-/i },
  { key: 'facebook',  label: 'Facebook',         re: /FACEBOOK/i },
  { key: 'webform',   label: 'Формы сайта',      re: /^WEBFORM$/i },
  { key: 'site',      label: 'Сайт и магазин',   re: /^(WEB|STORE)$/i },
];

// Воронка Telegram-магазина — наша собственная, источник у её сделок не проставлен,
// поэтому считаем её отдельно по номеру воронки.
const SHOP_CATEGORY_ID = process.env.BITRIX_SHOP_CATEGORY_ID || '49';

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();

let sourcesCache = null;
let sourcesAt = 0;

// Список источников портала: их переименовывают и добавляют, зашивать нельзя.
async function loadSources() {
  if (sourcesCache && Date.now() - sourcesAt < 6 * 60 * 60 * 1000) return sourcesCache;
  const { call } = require('../utils/bitrix24');
  const list = await call('crm.status.list', { filter: { ENTITY_ID: 'SOURCE' } });
  sourcesCache = (list || []).map(s => ({ id: s.STATUS_ID, name: s.NAME }));
  sourcesAt = Date.now();
  return sourcesCache;
}

const dayStr = d => d.toISOString().slice(0, 10);

/**
 * @param {number} days — 0 означает «за всё время», но Битрикс без даты считает
 *                        весь портал целиком, поэтому дно ставим на год.
 */
async function leadsByChannel({ days = 30 } = {}) {
  const key = `d${days}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - ((days > 0 ? days : 365) - 1));
  const period = { '>=DATE_CREATE': dayStr(from) };

  const sources = await loadSources();
  const idsOf = re => sources.filter(s => re.test(s.id)).map(s => s.id);

  const channels = [];
  for (const c of CHANNELS) {
    const ids = idsOf(c.re);
    if (!ids.length) { channels.push({ ...c, re: undefined, ids: 0, leads: 0, deals: 0 }); continue; }
    const filter = { ...period, SOURCE_ID: ids };
    const [leads, deals] = await Promise.all([
      count('crm.lead.list', filter),
      count('crm.deal.list', filter),
    ]);
    channels.push({ key: c.key, label: c.label, ids: ids.length, leads, deals });
  }

  const [totalLeads, totalDeals, shopDeals] = await Promise.all([
    count('crm.lead.list', period),
    count('crm.deal.list', period),
    count('crm.deal.list', { ...period, CATEGORY_ID: SHOP_CATEGORY_ID }),
  ]);
  channels.push({ key: 'tgshop', label: 'Telegram-магазин', ids: 1, leads: 0, deals: shopDeals });

  // Остальное — звонки, почта, ручные сделки менеджеров. Показываем одной строкой,
  // иначе не сходится с итогом, и читатель ищет пропажу.
  const known = channels.reduce((s, c) => ({ leads: s.leads + c.leads, deals: s.deals + c.deals }), { leads: 0, deals: 0 });
  channels.push({
    key: 'other', label: 'Прочее',
    leads: Math.max(0, totalLeads - known.leads),
    deals: Math.max(0, totalDeals - known.deals),
  });

  const data = {
    days,
    from: dayStr(from),
    totals: { leads: totalLeads, deals: totalDeals, all: totalLeads + totalDeals },
    channels: channels.filter(c => c.leads || c.deals)
      .sort((a, b) => (b.leads + b.deals) - (a.leads + a.deals)),
  };
  cache.set(key, { at: Date.now(), data });
  return data;
}

module.exports = { leadsByChannel, CHANNELS };
