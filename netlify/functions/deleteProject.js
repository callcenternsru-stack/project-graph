const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'DELETE') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  const id = event.queryStringParameters?.id;
  if (!id) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing id' }) };
  }
  try {
    const store = getStore({
      name: 'projects',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });

    let projects = await store.get('_all', { type: 'json' }) || [];
    const newProjects = projects.filter(p => p.id !== id);
    if (newProjects.length === projects.length) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Project not found' }) };
    }
    await store.setJSON('_all', newProjects);

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (error) {
    console.error('Error in deleteProject:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};