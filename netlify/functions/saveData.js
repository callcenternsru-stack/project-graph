const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
    }

    const siteID = process.env.NETLIFY_SITE_ID;
    const token = process.env.NETLIFY_ACCESS_TOKEN;

    if (!siteID || !token) {
      throw new Error('Missing siteID or token in environment variables');
    }

    const store = getStore({
      name: 'app-data',
      siteID,
      token,
      apiURL: 'https://api.netlify.com'
    });

    const newData = JSON.parse(event.body);
    await store.setJSON('appData', newData);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Данные сохранены' })
    };
  } catch (error) {
    console.error('Error in saveData:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
};