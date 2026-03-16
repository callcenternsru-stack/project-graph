const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const store = getStore({
      name: 'projects',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });

    const { blobs } = await store.list();
    const projects = [];

    for (const blob of blobs) {
      const data = await store.get(blob.key, { type: 'json' });
      if (data) {
        projects.push({
          id: blob.key,
          name: data.name
        });
      }
    }

    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300'
      },
      body: JSON.stringify(projects)
    };
  } catch (error) {
    console.error('Error in getProjects:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};