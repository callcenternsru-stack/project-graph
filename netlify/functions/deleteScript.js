const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'DELETE') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  const name = event.queryStringParameters?.name; // имя скрипта (title)
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

    let scripts = await store.get('_all', { type: 'json' }) || [];
    const newScripts = scripts.filter(s => s.title !== name);
    if (newScripts.length === scripts.length) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Script not found' }) };
    }
    await store.setJSON('_all', newScripts);

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (error) {
    console.error('Error in deleteScript:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};