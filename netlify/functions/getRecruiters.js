const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const store = getStore({
      name: 'recruiters',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });
    // Читаем весь массив из одного ключа
    const recruiters = await store.get('_all', { type: 'json' }) || [];
    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300' // кэш 5 минут
      },
      body: JSON.stringify(recruiters)
    };
  } catch (error) {
    console.error('Error in getRecruiters:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};