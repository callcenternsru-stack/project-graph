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

    // Читаем индекс
    const index = await store.get('_index', { type: 'json' }) || [];
    const MAX_CANDIDATES = 50;
    const recentIds = index.slice(-MAX_CANDIDATES).map(item => item.id);

    // Загружаем параллельно
    const candidates = await Promise.all(
      recentIds.map(async (id) => {
        try {
          const data = await store.get(id, { type: 'json' });
          return data || null;
        } catch (e) {
          console.error(`Error loading candidate ${id}:`, e);
          return null;
        }
      })
    );

    const filtered = candidates.filter(c => c !== null);
    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=120'
      },
      body: JSON.stringify(filtered)
    };
  } catch (error) {
    console.error('Error in getCandidates:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};