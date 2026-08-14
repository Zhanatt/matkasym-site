/**
 * Заводит в сделке поле «Наличие для клиента» (список: Есть / Нет).
 *
 * Им менеджер отвечает покупателю из Telegram-магазина: сервер раз в минуту видит
 * новое значение и пишет клиенту в бот (server/lib/shopDealSync.js). Стадия сделки
 * для этого не годится — она про этап продажи, а вопрос у покупателя ровно один.
 *
 *   node scripts/create-shop-stock-field.js           # показать, что будет
 *   node scripts/create-shop-stock-field.js --apply   # создать
 *
 * Повторный запуск безопасен: если поле уже есть, скрипт только покажет его id.
 */
const { call } = require('../utils/bitrix24');

const APPLY = process.argv.includes('--apply');
const FIELD_NAME = process.env.BITRIX_SHOP_STOCK_FIELD || 'UF_CRM_SHOP_STOCK';
const LABEL = 'Наличие для клиента';
const VALUES = ['Есть в наличии', 'Нет в наличии'];

async function main() {
  const existing = await call('crm.deal.userfield.list', { filter: { FIELD_NAME } });
  if (existing?.length) {
    const f = existing[0];
    console.log(`Поле уже есть: ${f.FIELD_NAME} (id ${f.ID})`);
    (f.LIST || []).forEach(i => console.log(`   ${i.ID} — ${i.VALUE}`));
    return;
  }

  console.log(`Создать поле ${FIELD_NAME} «${LABEL}» со значениями: ${VALUES.join(' / ')}`);
  if (!APPLY) { console.log('\n(предпросмотр — запусти с --apply)'); return; }

  const id = await call('crm.deal.userfield.add', {
    fields: {
      FIELD_NAME,
      USER_TYPE_ID:      'enumeration',
      EDIT_FORM_LABEL:   { ru: LABEL, en: 'Stock answer' },
      LIST_COLUMN_LABEL: { ru: LABEL, en: 'Stock answer' },
      LIST_FILTER_LABEL: { ru: LABEL, en: 'Stock answer' },
      SHOW_IN_LIST:      'Y',
      EDIT_IN_LIST:      'Y',
      SETTINGS:          { DISPLAY: 'LIST' },   // выпадающий список, а не радиокнопки
      LIST: VALUES.map((VALUE, i) => ({ VALUE, SORT: (i + 1) * 100, DEF: 'N' })),
    },
  });
  console.log(`Создано, id ${id}`);

  const created = await call('crm.deal.userfield.list', { filter: { FIELD_NAME } });
  (created?.[0]?.LIST || []).forEach(i => console.log(`   ${i.ID} — ${i.VALUE}`));
}

main().catch(e => { console.error('Ошибка:', e.message); process.exit(1); });
