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
      name: 'projects',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });

    const key = id || name; // если id не передан, используем имя (для обратной совместимости)
    const project = {
      id: key,       // сохраняем id внутри объекта
      name: name,
      updatedAt: new Date().toISOString()
    };

    await store.setJSON(key, project);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, project })
    };
  } catch (error) {
    console.error('Error in saveProject:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};