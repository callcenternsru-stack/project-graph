const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const { projectId, projectName, title, content, id } = JSON.parse(event.body);
    if (!projectId || !title || !content) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
    }
    const store = getStore({
      name: 'scripts',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });

    let scripts = await store.get('_all', { type: 'json' }) || [];
    const newScript = { projectId, projectName, title, content, updatedAt: new Date().toISOString() };

    if (id) {
      // обновление: ищем по старому title (id === старый title)
      const index = scripts.findIndex(s => s.title === id);
      if (index !== -1) {
        scripts[index] = newScript;
      } else {
        scripts.push(newScript);
      }
    } else {
      scripts.push(newScript);
    }

    await store.setJSON('_all', scripts);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, script: newScript })
    };
  } catch (error) {
    console.error('Error in saveScript:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};