const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  // Разрешаем только POST-запросы
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // Получаем данные из тела запроса
    const data = JSON.parse(event.body);
    const { code, formData } = data;

    // Проверяем обязательные поля
    if (!code || !formData) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing code or formData' })
      };
    }

    // Получаем доступ к хранилищу
    const store = getStore({
      name: 'candidates-data',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });

    // Сохраняем данные кандидата по ключу = code
    const candidateData = {
      formData,
      status: 'pending',       // начальный статус – ожидание проверки
      createdAt: new Date().toISOString()
    };

    await store.setJSON(code, candidateData);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Candidate saved' })
    };
  } catch (error) {
    console.error('Error in submitForm:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};