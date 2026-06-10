const nodemailer = require('nodemailer');

let transporter = null;

function getMailConfig() {
  const port = Number(process.env.MAIL_PORT || 587);

  return {
    brevoApiKey: process.env.BREVO_API_KEY,
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
  return !!(cfg.brevoApiKey && cfg.from) || !!(cfg.host && cfg.auth.user && cfg.auth.pass && cfg.from);
}

function maskEmail(email = '') {
  const [name, domain] = String(email).split('@');
  if (!name || !domain) return 'correo-no-valido';
  const visible = name.slice(0, 2);
  return `${visible}***@${domain}`;
}

function getTransporter() {
  if (transporter) return transporter;

  const cfg = getMailConfig();
  transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    family: Number(process.env.MAIL_FAMILY || 4),
    auth: cfg.auth,
    connectionTimeout: Number(process.env.MAIL_CONNECTION_TIMEOUT || 10000),
    greetingTimeout: Number(process.env.MAIL_GREETING_TIMEOUT || 10000),
    socketTimeout: Number(process.env.MAIL_SOCKET_TIMEOUT || 15000)
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

function parseMailFrom(from = '') {
  const value = String(from || '').trim();
  const match = value.match(/^(.*?)\s*<([^>]+)>$/);

  if (match) {
    return {
      name: match[1].replace(/^"|"$/g, '').trim() || match[2].trim(),
      email: match[2].trim()
    };
  }

  return {
    name: value,
    email: value
  };
}

async function sendWithBrevo({ to, subject, title, text, html }) {
  const cfg = getMailConfig();
  const sender = parseMailFrom(cfg.from);

  console.log(`Enviando correo de ticket por Brevo a ${maskEmail(to)}: ${subject || title}`);

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': cfg.brevoApiKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      sender,
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || `Brevo respondio HTTP ${response.status}`);
    error.code = data.code || `HTTP_${response.status}`;
    error.response = data;
    throw error;
  }

  console.log(`Correo enviado por Brevo a ${maskEmail(to)}. messageId=${data.messageId || 'sin-id'}`);
}

async function sendWithSmtp({ to, subject, title, text, html }) {
  const mailer = getTransporter();

  console.log(`Enviando correo de ticket por SMTP a ${maskEmail(to)}: ${subject || title}`);

  const info = await mailer.sendMail({
    from: getMailConfig().from,
    to,
    subject,
    text,
    html
  });

  console.log(`Correo enviado por SMTP a ${maskEmail(to)}. messageId=${info.messageId || 'sin-id'}`);
}

async function sendTicketNotificationEmail({ to, subject, title, message }) {
  if (!to) {
    console.warn('Correo no enviado: destinatario vacio.');
    return;
  }

  if (!isMailConfigured()) {
    console.warn('Correo no enviado: falta BREVO_API_KEY o variables SMTP completas.');
    return;
  }

  const safeTitle = title || subject || 'Notificacion de ticket';
  const safeMessage = message || safeTitle;

  try {
    const htmlMessage = escapeHtml(safeMessage).replace(/\n/g, '<br>');
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.45;color:#111827">
        <h2 style="font-size:18px;margin:0 0 12px">${escapeHtml(safeTitle)}</h2>
        <p style="margin:0 0 12px">${htmlMessage}</p>
        <p style="margin:16px 0 0;color:#6b7280;font-size:13px">
          Este correo fue enviado automaticamente por el sistema de tickets.
        </p>
      </div>
    `;

    const cfg = getMailConfig();
    const payload = {
      to,
      subject: subject || safeTitle,
      title: safeTitle,
      text: safeMessage,
      html
    };

    if (cfg.brevoApiKey) {
      await sendWithBrevo(payload);
    } else {
      await sendWithSmtp(payload);
    }
  } catch (error) {
    console.error('Error enviando correo de notificacion:', {
      to: maskEmail(to),
      code: error.code,
      command: error.command,
      responseCode: error.responseCode,
      response: error.response,
      message: error.message
    });
  }
}

module.exports = {
  sendTicketNotificationEmail,
  isMailConfigured
};
