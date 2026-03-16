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

    const { blobs } = await store.list();
    // Берём последние 50
    const keysToLoad = blobs.map(b => b.key).slice(-50);

    const candidates = await Promise.all(
      keysToLoad.map(async (key) => {
        try {
          const data = await store.get(key, { type: 'json' });
          return data || null;
        } catch (e) {
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
        'Cache-Control': 'public, max-age=120' // 2 минуты
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