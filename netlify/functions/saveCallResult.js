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

    let items = await store.get('_all', { type: 'json' }) || [];
    const newItem = { name, color, updatedAt: new Date().toISOString() };

    if (id) {
      const index = items.findIndex(i => i.name === id);
      if (index !== -1) items[index] = newItem;
      else items.push(newItem);
    } else {
      items.push(newItem);
    }

    await store.setJSON('_all', items);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, item: newItem })
    };
  } catch (error) {
    console.error('Error in saveCallResult:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};