const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const SITE_URL = process.env.SITE_URL || 'https://matkasym-site.onrender.com';
const ADMIN_EMAIL = process.env.GMAIL_USER;

// Письмо админу — новый пользователь хочет доступ
async function sendApprovalRequest({ adminName, adminEmail, newUser }) {
  const approveLink = `${SITE_URL}/api/auth/approve/${newUser._id}?secret=${process.env.JWT_SECRET.slice(0, 12)}`;
  const rejectLink  = `${SITE_URL}/api/auth/reject/${newUser._id}?secret=${process.env.JWT_SECRET.slice(0, 12)}`;

  await transporter.sendMail({
    from: `"Продакт матрица" <${ADMIN_EMAIL}>`,
    to:   ADMIN_EMAIL,
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
  await transporter.sendMail({
    from: `"Продакт матрица" <${ADMIN_EMAIL}>`,
    to:   toEmail,
    subject: '✅ Доступ подтверждён — Продакт матрица',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <div style="background: #000; padding: 20px 24px; border-radius: 8px 8px 0 0;">
          <span style="color: #fff; font-weight: 800; font-size: 16px; letter-spacing: 1px;">MATKASYM</span>
        </div>
        <div style="border: 1px solid #e8e8e8; border-top: none; padding: 28px 24px; border-radius: 0 0 8px 8px;">
          <h2 style="margin: 0 0 12px; color: #000;">Привет, ${toName}!</h2>
          <p style="color: #4d4d4d;">Твой доступ к Продакт матрице подтверждён. Можешь войти:</p>
          <a href="https://matkasym-site.onrender.com/admin/login" style="display: inline-block; background: #e10523; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 700; margin-top: 16px;">
            Войти в матрицу
          </a>
        </div>
      </div>
    `,
  });
}

// Письмо пользователю — отклонено
async function sendRejected({ toEmail, toName }) {
  await transporter.sendMail({
    from: `"Продакт матрица" <${ADMIN_EMAIL}>`,
    to:   toEmail,
    subject: 'Запрос доступа отклонён',
    html: `<p>Привет, ${toName}. К сожалению, твой запрос доступа к Продакт матрице был отклонён.</p>`,
  });
}

// Письмо пользователю — сброс пароля
async function sendPasswordReset({ toEmail, toName, resetLink }) {
  await transporter.sendMail({
    from: `"Продакт матрица" <${ADMIN_EMAIL}>`,
    to:   toEmail,
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

module.exports = { sendApprovalRequest, sendApproved, sendRejected, sendPasswordReset };
