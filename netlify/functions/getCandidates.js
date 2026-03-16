const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const store = getStore({
      name: 'candidates',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });

    // Читаем весь массив (если кандидатов много, можно хранить в одном ключе)
    const candidates = await store.get('_all', { type: 'json' }) || [];
    // Сортируем по дате создания (новые сверху)
    candidates.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    // Возвращаем только последние 50 для быстрой загрузки
    const MAX_CANDIDATES = 50;
    const limited = candidates.slice(0, MAX_CANDIDATES);

    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=120'
      },
      body: JSON.stringify(limited)
    };
  } catch (error) {
    console.error('Error in getCandidates:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};