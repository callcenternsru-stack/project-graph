const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const { name, color, id } = JSON.parse(event.body);
    if (!name) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Name required' }) };
    }
    const store = getStore({
      name: 'callResults',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });
    const key = id || name;
    const item = { name, color, updatedAt: new Date().toISOString() };
    await store.setJSON(key, item);
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, item })
    };
  } catch (error) {
    console.error('Error in saveCallResult:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};