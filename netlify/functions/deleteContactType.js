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
      name: 'contactTypes',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });

    let items = await store.get('_all', { type: 'json' }) || [];
    const newItems = items.filter(i => i.name !== name);
    if (newItems.length === items.length) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Item not found' }) };
    }
    await store.setJSON('_all', newItems);

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (error) {
    console.error('Error in deleteContactType:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};