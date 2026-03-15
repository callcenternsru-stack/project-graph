const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'DELETE') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  const name = event.queryStringParameters?.name;
  if (!name) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing name' }) };
  }
  try {
    const store = getStore({
      name: 'scripts',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });
    await store.delete(name);
    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (error) {
    console.error('Error in deleteScript:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};