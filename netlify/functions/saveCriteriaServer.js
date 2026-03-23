const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const criteria = JSON.parse(event.body);
    if (!Array.isArray(criteria)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Expected array of criteria' }) };
    }
    const store = getStore({
      name: 'analyticsCriteria',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });
    await store.setJSON('all', criteria);
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };
  } catch (error) {
    console.error('Error in saveCriteriaServer:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
