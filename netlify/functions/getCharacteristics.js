const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const store = getStore({
      name: 'characteristics',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });

    const characteristics = await store.get('all', { type: 'json' }) || [];

    const project = event.queryStringParameters?.project;
    if (project) {
      const filtered = characteristics.filter(c => c.project === project);
      return {
        statusCode: 200,
        body: JSON.stringify(filtered)
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(characteristics)
    };
  } catch (error) {
    console.error('Error in getCharacteristics:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};