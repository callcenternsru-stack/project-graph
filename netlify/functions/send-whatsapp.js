// netlify/functions/send-whatsapp.js
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { phoneNumber } = JSON.parse(event.body);
    if (!phoneNumber) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing phoneNumber' }),
      };
    }

    // Очищаем номер от всего, кроме цифр
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    // Формируем ссылку WhatsApp
    const whatsappUrl = `https://wa.me/${cleanPhone}`;

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, whatsappUrl }),
    };
  } catch (error) {
    console.error('Error in send-whatsapp:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};