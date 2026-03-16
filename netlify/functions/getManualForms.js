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

    const { blobs } = await store.list();
    const keysToLoad = blobs.map(b => b.key).slice(-20);

    const forms = await Promise.all(
      keysToLoad.map(async (key) => {
        try {
          const data = await store.get(key, { type: 'json' });
          return data ? { id: key, ...data } : null;
        } catch (e) {
          return null;
        }
      })
    );

    const filtered = forms.filter(f => f !== null);
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