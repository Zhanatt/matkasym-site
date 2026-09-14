// Короткая ссылка на заказ: /w/:sku → редирект в WhatsApp с готовым текстом.
//
// Зачем нужна отдельная ссылка вместо прямой wa.me: в стикер-ссылку истории
// Instagram длинный URL не влезает — «ссылка слишком длинная». Прямая wa.me
// с кыргызским текстом занимает ~270 символов, потому что каждая буква
// кириллицы кодируется в URL шестью символами (Б → %D0%91). Здесь тот же
// текст собирается уже ПОСЛЕ перехода, а наружу торчит ~45 символов.
//
// Метка источника подставляется по площадке (?s=inst|tg|fb), чтобы в WhatsApp
// было видно, откуда пришёл лид: из истории Instagram или из канала.

const express = require('express');
const Product = require('../models/Product');
const Brand   = require('../models/Brand');
const { whatsappLink, setWhatsappLink, orderPhone } = require('../lib/postCaption');
const { normLang } = require('../lib/postLang');

const router = express.Router();

// ?s=inst → instagram. Короткие коды, потому что ссылка и так экономит символы.
const SOURCES = { tg: 'telegram', inst: 'instagram', fb: 'facebook' };

// /w/set/:slug — то же самое для поста про сет целиком: в WhatsApp уйдёт
// «Хотел узнать о сете Kosh Keliniz». Стоит выше /:sku — у артикулов слэша
// не бывает, но правило с двумя сегментами должно объявляться первым.
router.get('/set/:slug', async (req, res) => {
  const platform = SOURCES[String(req.query.s || '').toLowerCase()] || 'instagram';
  const lang = normLang(req.query.lang);
  const slug = String(req.params.slug || '').trim();

  try {
    const brand = await Brand.findOne({ 'sets.key': slug }, 'key sets').lean();
    const row = (brand?.sets || []).find(x => x.key === slug);

    // Сет не нашёлся — клиент всё равно хочет написать: отправляем в WhatsApp
    // без текста, а не показываем ему ошибку.
    if (!row) {
      console.warn(`[wa] сет не найден по слагу «${slug}» — редирект без текста`);
      return res.redirect(302, `https://wa.me/${orderPhone(null, platform)}`);
    }

    return res.redirect(302, setWhatsappLink(
      { slug, label: row.label || slug, brand: brand.key }, lang, platform));
  } catch (e) {
    console.error('[wa:set]', e.message);
    return res.redirect(302, `https://wa.me/${orderPhone(null, platform)}`);
  }
});

router.get('/:sku', async (req, res) => {
  const platform = SOURCES[String(req.query.s || '').toLowerCase()] || 'instagram';
  const lang = normLang(req.query.lang);

  try {
    // Артикул в ссылке набирают и руками — регистр не должен ничего ломать.
    const sku = String(req.params.sku || '').trim();
    const product = await Product.findOne({ sku: new RegExp(`^${sku.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })
      .select('sku name fullName nameKy nameKk category brand');

    // Товар не нашёлся — это не повод показывать клиенту ошибку: он пришёл
    // из истории и хочет написать. Отправляем в WhatsApp без текста заказа.
    if (!product) {
      console.warn(`[wa] товар не найден по артикулу «${sku}» — редирект без текста`);
      return res.redirect(302, `https://wa.me/${orderPhone(null, platform)}`);
    }

    return res.redirect(302, whatsappLink(product, lang, platform));
  } catch (e) {
    console.error('[wa]', e.message);
    return res.redirect(302, `https://wa.me/${orderPhone(null, platform)}`);
  }
});

module.exports = router;
