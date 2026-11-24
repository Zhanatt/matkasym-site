/**
 * Общее для канбана R&D в Битрикс24 (проект 31): вызов REST, стадии, ссылки на страницу
 * «Оформить на утверждение».
 */
const axios  = require('axios');
const crypto = require('crypto');

const PORTAL   = 'https://matkasymov.bitrix24.kz';
const SITE_URL = process.env.PUBLIC_SITE_URL || 'https://matkasym-site.onrender.com';
const GROUP_ID = process.env.TECHLIST_GROUP_ID || '31';

const STAGES = {
  request:    '1169', // Заявка на техлист
  processing: '2281', // Обработка техлиста
  approval:   '2283', // Завершённые техлисты = на утверждении
  signed:     '2285', // Техлисты с подписью
};
const APPROVAL_STAGE_TITLE = 'Завершённые техлисты';
// Назад из утверждения — только через «Вернуть на доработку» с комментарием
const BEFORE_APPROVAL_TITLES = ['Заявка на техлист', 'Обработка техлиста'];

function client() {
  const hook = process.env.B24_TASKS_WEBHOOK;
  if (!hook) throw new Error('Не задан B24_TASKS_WEBHOOK');
  return axios.create({ baseURL: hook.replace(/\/?$/, '/'), timeout: 120000, maxBodyLength: Infinity });
}

async function call(method, params, c = client()) {
  try {
    const { data } = await c.post(`${method}.json`, params);
    if (data.error) throw new Error(data.error_description || data.error);
    return data.result;
  } catch (err) {
    const body = err.response?.data;
    if (body?.error) throw new Error(`Bitrix24 ${method}: ${body.error_description || body.error}`);
    throw err;
  }
}

// Ссылка на оформление открыта без входа, поэтому в ней подпись: без неё по номеру
// задачи чужой человек не сможет отправить «утверждение» и двигать карточки.
const secret = () => process.env.TECHLIST_LINK_SECRET || process.env.B24_TASKS_WEBHOOK || '';
const sign = taskId => crypto.createHmac('sha256', secret()).update(`approve:${taskId}`).digest('hex').slice(0, 16);
const checkSign = (taskId, k) => !!k && k.length === 16 &&
  crypto.timingSafeEqual(Buffer.from(sign(taskId)), Buffer.from(String(k)));
const approveUrl = taskId => `${SITE_URL}/techlist/approve/${taskId}?k=${sign(taskId)}`;
const reworkUrl  = taskId => `${SITE_URL}/techlist/rework/${taskId}?k=${sign(taskId)}`;
const taskUrl = taskId => `${PORTAL}/workgroups/group/${GROUP_ID}/tasks/task/view/${taskId}/`;

module.exports = { PORTAL, SITE_URL, GROUP_ID, STAGES, APPROVAL_STAGE_TITLE, BEFORE_APPROVAL_TITLES, client, call, sign, checkSign, approveUrl, reworkUrl, taskUrl };
