const nodemailer = require('nodemailer');

let transporter = null;

function getMailConfig() {
  const port = Number(process.env.MAIL_PORT || 587);

  return {
    host: process.env.MAIL_HOST,
    port,
    secure: String(process.env.MAIL_SECURE || 'false').toLowerCase() === 'true',
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS
    },
    from: process.env.MAIL_FROM || process.env.MAIL_USER
  };
}

function isMailConfigured() {
  const cfg = getMailConfig();
  return !!(cfg.host && cfg.auth.user && cfg.auth.pass && cfg.from);
}

function getTransporter() {
  if (transporter) return transporter;

  const cfg = getMailConfig();
  transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.auth
  });

  return transporter;
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function sendTicketNotificationEmail({ to, subject, title, message }) {
  if (!to || !isMailConfigured()) return;

  const mailer = getTransporter();
  const safeTitle = title || subject || 'Notificacion de ticket';
  const safeMessage = message || safeTitle;

  try {
    const htmlMessage = escapeHtml(safeMessage).replace(/\n/g, '<br>');

    await mailer.sendMail({
      from: getMailConfig().from,
      to,
      subject: subject || safeTitle,
      text: safeMessage,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.45;color:#111827">
          <h2 style="font-size:18px;margin:0 0 12px">${escapeHtml(safeTitle)}</h2>
          <p style="margin:0 0 12px">${htmlMessage}</p>
          <p style="margin:16px 0 0;color:#6b7280;font-size:13px">
            Este correo fue enviado automaticamente por el sistema de tickets.
          </p>
        </div>
      `
    });
  } catch (error) {
    console.error('Error enviando correo de notificacion:', error.message || error);
  }
}

module.exports = {
  sendTicketNotificationEmail,
  isMailConfigured
};
