const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { id, type, recruiter } = JSON.parse(event.body);
    if (!id || !type || recruiter === undefined) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing fields' }) };
    }

    const storeName = type === 'auto' ? 'candidates-data' : 'manualForms';
    const store = getStore({
      name: storeName,
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
    });

    const data = await store.get(id, { type: 'json' });
    if (!data) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Not found' }) };
    }

    data.recruiter = recruiter;
    await store.setJSON(id, data);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };
  } catch (error) {
    console.error('Error in updateCandidateRecruiter:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};