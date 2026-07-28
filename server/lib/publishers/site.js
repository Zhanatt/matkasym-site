// Публикация в ленту новостей самого сайта (/admin/news).
//
// Персональные уведомления (личка в Telegram, почта) отсюда НЕ шлём: за них отвечает
// модуль новостей, а в автопубликации Telegram обычно стоит отдельной площадкой —
// иначе один и тот же пост придёт сотруднику дважды. Здесь только запись в ленте.
//
// account.config = { newsType } — необязательно, по умолчанию тип определяется сам.
const News = require('../../models/News');
const User = require('../../models/User');

const SITE_URL = process.env.SITE_URL || 'https://matkasym-site.onrender.com';

// В ленте обычный текст, разметка Telegram там не нужна.
const stripHtml = (s) => String(s || '')
  .replace(/<\/?[bi]>/g, '')
  .replace(/&amp;/g, '&');

// Заголовок новости: имя товара, иначе первая непустая строка текста.
function pickTitle(caption, product) {
  const name = product?.fullName || product?.name;
  if (name) return String(name).slice(0, 200);
  const first = stripHtml(caption).split('\n').map(s => s.trim()).find(Boolean);
  return (first || 'Публикация').slice(0, 200);
}

async function publish({ account, caption, images, publication }) {
  try {
    const product = publication?.product || null;
    const type = account?.config?.newsType || (product ? 'new_product' : 'custom');

    // Новость видят все сотрудники — как при обычном создании через /admin/news/create.
    const users = await User.find({
      role:      { $in: ['owner', 'editor', 'viewer'] },
      isPending: false,
    }).select('_id name email').lean();

    const authorId = publication?.createdBy ? String(publication.createdBy) : '';
    const recipients = users.map(u => ({
      userId: u._id,
      name:   u.name,
      email:  u.email,
      read:   String(u._id) === authorId, // свою же новость автор непрочитанной не считает
    }));

    const author = authorId
      ? await User.findById(authorId).select('name email').lean()
      : null;

    const news = await News.create({
      type,
      title:   pickTitle(caption, product),
      message: stripHtml(caption),
      images:  images || [],
      product: product ? {
        id:          product._id,
        name:        product.fullName || product.name,
        brand:       product.brand,
        set:         product.set,
        stock:       product.stock,
        images:      product.images || [],
        driveImages: product.driveImages || [],
      } : undefined,
      recipients,
      createdBy: author ? { id: author._id, name: author.name, email: author.email } : undefined,
    });

    return { ok: true, externalId: String(news._id), externalUrl: `${SITE_URL}/admin/news` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { publish, pickTitle };
