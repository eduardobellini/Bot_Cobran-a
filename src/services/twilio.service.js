const twilio = require('twilio');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

function whatsappNumber(value) {
  if (!value) return value;
  return value.startsWith('whatsapp:') ? value : `whatsapp:${value}`;
}

async function sendWhatsAppText(to, body) {
  return client.messages.create({
    from: process.env.TWILIO_WHATSAPP_FROM,
    to: whatsappNumber(to),
    body
  });
}

async function sendWhatsAppTemplate(to, contentSid, contentVariables) {
  return client.messages.create({
    from: process.env.TWILIO_WHATSAPP_FROM,
    to: whatsappNumber(to),
    contentSid,
    contentVariables: JSON.stringify(contentVariables)
  });
}

module.exports = {
  sendWhatsAppText,
  sendWhatsAppTemplate
};