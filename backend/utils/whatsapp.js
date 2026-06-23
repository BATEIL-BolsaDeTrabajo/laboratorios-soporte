const https = require('https');

function normalizeWhatsappNumber(value = '') {
  return String(value).replace(/[^\d]/g, '');
}

function postWhatsappMessage(to, payloadBody) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const cleanTo = normalizeWhatsappNumber(to);

  if (!token || !phoneNumberId || !cleanTo) {
    return Promise.resolve(false);
  }

  const payload = JSON.stringify({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanTo,
    ...payloadBody
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'graph.facebook.com',
        path: `/v20.0/${phoneNumberId}/messages`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      },
      res => {
        let data = '';
        res.on('data', chunk => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) return resolve(true);
          console.error('Error enviando WhatsApp:', res.statusCode, data);
          resolve(false);
        });
      }
    );

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function sendWhatsappText(to, text) {
  if (!text) return Promise.resolve(false);

  return postWhatsappMessage(to, {
    type: 'text',
    text: {
      preview_url: false,
      body: text
    }
  });
}

function sendWhatsappNotification(to, { title, message }) {
  const templateName = process.env.WHATSAPP_NOTIFICATION_TEMPLATE_NAME;
  const languageCode = process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'es_MX';
  const sanitizeTemplateParam = value =>
    String(value || '')
      .replace(/[\r\n\t]+/g, ' | ')
      .replace(/\s{2,}/g, ' ')
      .trim();

  const cleanTitle = sanitizeTemplateParam(title || 'Notificacion de ticket').slice(0, 250);
  const cleanMessage = sanitizeTemplateParam(
    message || title || 'Tienes una actualizacion en el sistema de tickets.'
  ).slice(0, 900);

  if (!templateName) {
    return sendWhatsappText(to, `${cleanTitle}\n\n${cleanMessage}`);
  }

  if (templateName === 'hello_world') {
    return postWhatsappMessage(to, {
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode }
      }
    });
  }

  return postWhatsappMessage(to, {
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: cleanTitle },
            { type: 'text', text: cleanMessage }
          ]
        }
      ]
    }
  });
}

module.exports = {
  normalizeWhatsappNumber,
  sendWhatsappText,
  sendWhatsappNotification
};
