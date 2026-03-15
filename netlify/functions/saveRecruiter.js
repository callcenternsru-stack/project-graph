const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const { name, password, phone, email, id } = JSON.parse(event.body);
    if (!name) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Name required' }) };
    }
    const store = getStore({
      name: 'recruiters',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });
    const key = id || name; // предполагаем, что имя уникально
    const recruiter = { name, password, phone, email, updatedAt: new Date().toISOString() };
    await store.setJSON(key, recruiter);
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, recruiter })
    };
  } catch (error) {
    console.error('Error in saveRecruiter:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};