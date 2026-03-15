const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const candidate = JSON.parse(event.body);
    if (!candidate.fullName || !candidate.phone || !candidate.recruiter) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
    }
    const store = getStore({
      name: 'candidates',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });
    const key = `${candidate.recruiter}_${Date.now()}`;
    candidate.id = key;
    candidate.updatedAt = new Date().toISOString();
    await store.setJSON(key, candidate);
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, candidate })
    };
  } catch (error) {
    console.error('Error in submitCandidate:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};