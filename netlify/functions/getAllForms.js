const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const store = getStore({
      name: 'candidates-data',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });

    // Читаем индекс
    const index = await store.get('_index', { type: 'json' }) || [];
    const MAX_FORMS = 20;
    const recentCodes = index.slice(-MAX_FORMS).map(item => item.code);

    // Загружаем данные параллельно
    const forms = await Promise.all(
      recentCodes.map(async (code) => {
        try {
          const data = await store.get(code, { type: 'json' });
          return data ? { code, ...data } : null;
        } catch (e) {
          console.error(`Error loading code ${code}:`, e);
          return null;
        }
      })
    );

    const filteredForms = forms.filter(f => f !== null);
    filteredForms.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60'
      },
      body: JSON.stringify(filteredForms)
    };
  } catch (error) {
    console.error('Error in getAllForms:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};