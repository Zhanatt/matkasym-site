const mongoose = require('mongoose');

/**
 * Заявка «Уточнить наличие» из Telegram-магазина.
 *
 * Клиент из канала открывает Mini App, выбирает товар и просит уточнить наличие.
 * Заявка уходит сделкой в Битрикс24 (воронка розничных продаж) — там её ведёт менеджер,
 * он же связывается с клиентом и присылает реквизиты MBank. Здесь копия нужна,
 * чтобы: показать клиенту его заявки в Mini App, уведомить его, когда товар снова
 * появится на складе, и не терять обращение, если Битрикс в момент заявки недоступен.
 *
 * snapshot — товар на момент заявки. Цена и остаток меняются каждой выгрузкой из 1С,
 * а разговор менеджера с клиентом идёт про то, что клиент видел в приложении.
 */
const shopRequestSchema = new mongoose.Schema({
  product:  { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  snapshot: {
    name:  { type: String, default: '' },
    sku:   { type: String, default: '' },
    price: { type: Number, default: 0 },
    stock: { type: Number, default: 0 },   // остаток в момент заявки
    image: { type: String, default: '' },
    set:   { type: String, default: '' },
    brand: { type: String, default: '' },
  },
  qty:     { type: Number, default: 1, min: 1 },
  comment: { type: String, default: '' },

  // Кто просит. tgUserId приходит из подписанного Telegram initData — подделать нельзя.
  customer: {
    tgUserId:   { type: String, default: '', index: true },
    tgUsername: { type: String, default: '' },
    tgName:     { type: String, default: '' },
    name:       { type: String, default: '' },
    phone:      { type: String, default: '' },
  },

  // new — менеджер ещё не ответил. Дальше статус ведётся в Битриксе, здесь он
  // меняется вручную из админки: сайт не знает, чем закончился разговор.
  status: {
    type: String,
    enum: ['new', 'in_stock', 'out_of_stock', 'done', 'canceled'],
    default: 'new',
    index: true,
  },

  // Сделка в Битриксе. error — если создать не удалось: заявка всё равно сохранена,
  // менеджер увидит её в админке, а в логах будет причина.
  bitrix: {
    dealId: { type: String, default: '' },
    error:  { type: String, default: '' },
    // Последняя увиденная стадия сделки. По её смене мы понимаем, что ответил
    // менеджер, и пишем клиенту — сам он в Битрикс не заходит.
    stage:  { type: String, default: '' },
    // Последнее значение поля «Наличие для клиента» в карточке сделки:
    // менеджеру так прямее, чем двигать стадию ради ответа «есть / нет».
    stockAnswer: { type: String, default: '' },
  },

  // Сообщение клиенту не доставлено (он не нажимал «Начать» у бота) —
  // менеджеру видно в админке, что отвечать придётся звонком.
  notifyFailed: { type: Boolean, default: false },

  // «Сообщить, когда появится»: остаток пришёл нулевым или менеджер ответил «нет в наличии».
  // Уведомление уходит ботом при первой же выгрузке остатков, где товар снова > 0.
  notifyOnRestock: { type: Boolean, default: true },
  notifiedAt:      { type: Date },
}, { timestamps: true });

shopRequestSchema.index({ createdAt: -1 });
shopRequestSchema.index({ product: 1, notifyOnRestock: 1, notifiedAt: 1 });

module.exports = mongoose.model('ShopRequest', shopRequestSchema);
