const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const { formData } = JSON.parse(event.body);
    if (!formData) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing formData' }) };
    }
    const store = getStore({
      name: 'manualForms',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });
    const key = `manual_${Date.now()}`;
    const record = { ...formData, id: key, submittedAt: new Date().toISOString() };
    await store.setJSON(key, record);
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, id: key })
    };
  } catch (error) {
    console.error('Error in submitManualForm:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};