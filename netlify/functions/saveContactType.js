const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const { name, id } = JSON.parse(event.body);
    if (!name) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Name required' }) };
    }
    const store = getStore({
      name: 'contactTypes',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });

    let items = await store.get('_all', { type: 'json' }) || [];
    const newItem = { name, updatedAt: new Date().toISOString() };

    if (id) {
      // обновление: ищем по старому имени (id === старое имя)
      const index = items.findIndex(i => i.name === id);
      if (index !== -1) {
        items[index] = newItem;
      } else {
        items.push(newItem);
      }
    } else {
      // добавление нового
      items.push(newItem);
    }

    await store.setJSON('_all', items);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, item: newItem })
    };
  } catch (error) {
    console.error('Error in saveContactType:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};