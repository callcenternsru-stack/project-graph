const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const characteristics = JSON.parse(event.body);

    const store = getStore({
      name: 'characteristics',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });

    await store.setJSON('all', characteristics);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Characteristics saved' })
    };
  } catch (error) {
    console.error('Error in saveCharacteristics:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};