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
    const { blobs } = await store.list();
    const recruiters = [];
    for (const blob of blobs) {
      const data = await store.get(blob.key, { type: 'json' });
      if (data) recruiters.push(data);
    }
    recruiters.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
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