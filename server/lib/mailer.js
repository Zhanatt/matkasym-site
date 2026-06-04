const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const SITE_URL = process.env.SITE_URL || 'https://matkasym-site.onrender.com';
const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev';

// Письмо админу — новый пользователь хочет доступ
async function sendApprovalRequest({ adminName, adminEmail, newUser }) {
  if (!resend) {
    console.log('[Mailer] Resend not configured, skipping approval request email');
    return;
  }
  const approveLink = `${SITE_URL}/api/auth/approve/${newUser._id}?secret=${process.env.JWT_SECRET.slice(0, 12)}`;
  const rejectLink  = `${SITE_URL}/api/auth/reject/${newUser._id}?secret=${process.env.JWT_SECRET.slice(0, 12)}`;

  await resend.emails.send({
    from: `Продакт матрица <${FROM_EMAIL}>`,
    to: adminEmail,
    subject: `🔐 Новый запрос доступа — ${newUser.name}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <div style="background: #000; padding: 20px 24px; border-radius: 8px 8px 0 0;">
          <span style="color: #fff; font-weight: 800; font-size: 16px; letter-spacing: 1px;">MATKASYM</span>
          <span style="background: #e10523; color: #fff; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 4px; margin-left: 8px;">Продакт матрица</span>
        </div>
        <div style="border: 1px solid #e8e8e8; border-top: none; padding: 28px 24px; border-radius: 0 0 8px 8px;">
          <h2 style="margin: 0 0 16px; color: #000;">Запрос доступа</h2>
          <p style="color: #4d4d4d; margin: 0 0 20px;">Новый пользователь хочет войти в Продакт матрицу:</p>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 28px;">
            <tr><td style="padding: 8px 0; color: #7d96a0; font-size: 13px;">Имя</td><td style="padding: 8px 0; font-weight: 600; color: #000;">${newUser.name}</td></tr>
            <tr><td style="padding: 8px 0; color: #7d96a0; font-size: 13px;">Email</td><td style="padding: 8px 0; font-weight: 600; color: #000;">${newUser.email}</td></tr>
          </table>
          <div style="display: flex; gap: 12px;">
            <a href="${approveLink}" style="display: inline-block; background: #2d7a3a; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 700; font-size: 14px; margin-right: 12px;">
              ✓ Подтвердить
            </a>
            <a href="${rejectLink}" style="display: inline-block; background: #f5c6c6; color: #c0392b; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 700; font-size: 14px;">
              ✕ Отклонить
            </a>
          </div>
        </div>
      </div>
    `,
  });
}

// Письмо пользователю — доступ подтверждён
async function sendApproved({ toEmail, toName }) {
  if (!resend) return;
  await resend.emails.send({
    from: `Продакт матрица <${FROM_EMAIL}>`,
    to: toEmail,
    subject: '✅ Доступ подтверждён — Продакт матрица',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <div style="background: #000; padding: 20px 24px; border-radius: 8px 8px 0 0;">
          <span style="color: #fff; font-weight: 800; font-size: 16px; letter-spacing: 1px;">MATKASYM</span>
        </div>
        <div style="border: 1px solid #e8e8e8; border-top: none; padding: 28px 24px; border-radius: 0 0 8px 8px;">
          <h2 style="margin: 0 0 12px; color: #000;">Привет, ${toName}!</h2>
          <p style="color: #4d4d4d;">Твой доступ к Продакт матрице подтверждён. Можешь войти:</p>
          <a href="${SITE_URL}/admin/login" style="display: inline-block; background: #e10523; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 700; margin-top: 16px;">
            Войти в матрицу
          </a>
        </div>
      </div>
    `,
  });
}

// Письмо пользователю — отклонено
async function sendRejected({ toEmail, toName }) {
  if (!resend) return;
  await resend.emails.send({
    from: `Продакт матрица <${FROM_EMAIL}>`,
    to: toEmail,
    subject: 'Запрос доступа отклонён',
    html: `<p>Привет, ${toName}. К сожалению, твой запрос доступа к Продакт матрице был отклонён.</p>`,
  });
}

// Письмо пользователю — сброс пароля
async function sendPasswordReset({ toEmail, toName, resetLink }) {
  if (!resend) return;
  await resend.emails.send({
    from: `Продакт матрица <${FROM_EMAIL}>`,
    to: toEmail,
    subject: '🔑 Восстановление пароля — Продакт матрица',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <div style="background: #000; padding: 20px 24px; border-radius: 8px 8px 0 0;">
          <span style="color: #fff; font-weight: 800; font-size: 16px; letter-spacing: 1px;">MATKASYM</span>
          <span style="background: #e10523; color: #fff; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 4px; margin-left: 8px;">Продакт матрица</span>
        </div>
        <div style="border: 1px solid #e8e8e8; border-top: none; padding: 28px 24px; border-radius: 0 0 8px 8px;">
          <h2 style="margin: 0 0 12px; color: #000;">Привет, ${toName}!</h2>
          <p style="color: #4d4d4d; margin: 0 0 20px;">Вы запросили сброс пароля. Нажмите кнопку ниже — ссылка действует <strong>1 час</strong>.</p>
          <a href="${resetLink}" style="display: inline-block; background: #e10523; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 700; font-size: 14px;">
            Сбросить пароль
          </a>
          <p style="color: #7d96a0; font-size: 12px; margin: 20px 0 0;">Если вы не запрашивали сброс — просто проигнорируйте это письмо.</p>
        </div>
      </div>
    `,
  });
}

const NEWS_TYPE_LABELS = {
  discontinued:          'Снят с производства',
  liquidation:              'Ликвидация',
  out_of_stock:          'Нет в наличии',
  restocked:             'Появился на складе',
  price_change:          'Изменение цены',
  custom:                'Объявление',
  new_product:           'Новый товар',
  status_planned:        'В планах',
  status_in_development: 'В разработке',
  status_improvement:    'На улучшении',
  status_for_sale:       'В продаже',
};

// Новость/объявление — рассылка пользователям
async function sendNewsNotification({ type, title, message, product }, recipients) {
  if (!resend) {
    console.log('[Mailer] Resend not configured, skipping news notification email');
    return;
  }
  const typeLabel = NEWS_TYPE_LABELS[type] || 'Новость';
  const typeColors = {
    discontinued: '#c0392b', liquidation: '#8e44ad',
    out_of_stock: '#7f8c8d', restocked: '#27ae60', price_change: '#2980b9', custom: '#2c3e50',
    new_product: '#27ae60', status_planned: '#f39c12', status_in_development: '#3498db',
    status_improvement: '#9b59b6', status_for_sale: '#27ae60',
  };
  const typeColor = typeColors[type] || '#2c3e50';

  const productName = product?.fullName || product?.name || product?.product?.name;
  const productStock = product?.stock ?? product?.product?.stock;
  const images = product?.images || product?.driveImages || product?.product?.images || product?.product?.driveImages;
  const imgUrl = images?.[0]?.startsWith?.('http') ? images[0]
    : images?.[0] ? `https://drive.google.com/uc?export=view&id=${images[0]}`
    : null;

  const productBlock = productName ? `
    <div style="display:flex;align-items:center;gap:16px;background:#f7f8fa;border-radius:8px;padding:14px 16px;margin-bottom:20px;">
      ${imgUrl ? `<img src="${imgUrl}" alt="${productName}" style="width:64px;height:64px;object-fit:cover;border-radius:6px;flex-shrink:0;" />` : ''}
      <div>
        <div style="font-weight:700;font-size:15px;color:#111;margin-bottom:4px;">${productName}</div>
        ${productStock != null ? `<div style="font-size:12px;color:#7d96a0;">Остаток на складе: <b style="color:#111;">${productStock} шт.</b></div>` : ''}
      </div>
    </div>` : '';

  const recipientsList = Array.isArray(recipients) ? recipients : [recipients];
  console.log(`[Mailer] Sending news "${title}" to ${recipientsList.length} recipients`);

  for (const r of recipientsList) {
    const toEmail = r.email;
    const toName  = r.name || r.email;
    if (!toEmail) {
      console.log('[Mailer] Skipping recipient without email:', r);
      continue;
    }

    try {
      console.log(`[Mailer] Sending to: ${toEmail}`);
      await resend.emails.send({
        from: `Продакт матрица <${FROM_EMAIL}>`,
        to: toEmail,
        subject: `📢 ${title}`,
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
            <div style="background:#000;padding:20px 24px;border-radius:8px 8px 0 0;">
              <span style="color:#fff;font-weight:800;font-size:16px;letter-spacing:1px;">MATKASYM</span>
              <span style="background:#e10523;color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;margin-left:8px;">Продакт матрица</span>
            </div>
            <div style="border:1px solid #e8e8e8;border-top:none;padding:28px 24px;border-radius:0 0 8px 8px;">
              <div style="display:inline-block;background:${typeColor}1a;color:${typeColor};font-size:11px;font-weight:700;padding:3px 10px;border-radius:12px;margin-bottom:14px;letter-spacing:.4px;">
                ${typeLabel.toUpperCase()}
              </div>
              <h2 style="margin:0 0 16px;color:#000;font-size:18px;">${title}</h2>
              ${productBlock}
              ${message ? `<p style="color:#333;margin:0 0 20px;line-height:1.6;white-space:pre-wrap;">${message}</p>` : ''}
              <a href="${SITE_URL}/admin/news" style="display:inline-block;background:#000;color:#fff;text-decoration:none;padding:10px 24px;border-radius:6px;font-weight:700;font-size:13px;">
                Открыть в матрице
              </a>
              <p style="color:#bbb;font-size:11px;margin:20px 0 0;">Привет, ${toName} — это автоматическое уведомление от Продакт матрицы.</p>
            </div>
          </div>
        `,
      });
      console.log(`[Mailer] ✓ Sent to ${toEmail}`);
    } catch (e) {
      console.error(`[Mailer] ✗ Failed to send to ${toEmail}:`, e.message);
    }
  }
}

module.exports = { sendApprovalRequest, sendApproved, sendRejected, sendPasswordReset, sendNewsNotification };
