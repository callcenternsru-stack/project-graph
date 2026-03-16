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

    const { blobs } = await store.list();
    const candidateKeys = blobs
      .map(item => item.key)
      .filter(key => !key.includes('/'));

    const MAX_FORMS = 20;
    const keysToLoad = candidateKeys.slice(-MAX_FORMS);

    const forms = await Promise.all(
      keysToLoad.map(async (key) => {
        try {
          const data = await store.get(key, { type: 'json' });
          return data ? { code: key, ...data } : null;
        } catch (e) {
          console.error(`Error loading key ${key}:`, e);
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