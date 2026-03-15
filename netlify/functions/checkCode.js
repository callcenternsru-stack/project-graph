const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  // Разрешаем только GET-запросы с параметром code
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const code = event.queryStringParameters?.code;
  if (!code) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing code parameter' })
    };
  }

  try {
    const store = getStore({
      name: 'candidates-data',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });

    // Пытаемся получить данные кандидата
    const candidateData = await store.get(code, { type: 'json' });

    // Если запись не найдена или статус не pending – код недействителен
    if (!candidateData) {
      return {
        statusCode: 200,
        body: JSON.stringify({ valid: false, reason: 'not_found' })
      };
    }

    if (candidateData.status !== 'pending') {
      return {
        statusCode: 200,
        body: JSON.stringify({ valid: false, reason: 'already_processed' })
      };
    }

    // Всё хорошо, код действителен
    return {
      statusCode: 200,
      body: JSON.stringify({ valid: true })
    };
  } catch (error) {
    console.error('Error in checkCode:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};