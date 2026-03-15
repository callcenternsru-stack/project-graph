const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const { title, content, id } = JSON.parse(event.body);
    if (!title || !content) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Title and content required' }) };
    }
    const store = getStore({
      name: 'scripts',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });
    const key = id || title;
    const script = { title, content, updatedAt: new Date().toISOString() };
    await store.setJSON(key, script);
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, script })
    };
  } catch (error) {
    console.error('Error in saveScript:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};