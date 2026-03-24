const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const store = getStore({
      name: 'manualForms',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });

    // Читаем индекс (все записи без лимита)
    const index = await store.get('_index', { type: 'json' }) || [];
    const allIds = index.map(item => item.id);

    // Загружаем данные параллельно
    const forms = await Promise.all(
      allIds.map(async (id) => {
        try {
          const data = await store.get(id, { type: 'json' });
          return data ? { id, ...data } : null;
        } catch (e) {
          console.error(`Error loading manual form ${id}:`, e);
          return null;
        }
      })
    );

    const filtered = forms.filter(f => f !== null);
    // Сортируем по дате (новые сверху)
    filtered.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60'
      },
      body: JSON.stringify(filtered)
    };
  } catch (error) {
    console.error('Error in getManualForms:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
