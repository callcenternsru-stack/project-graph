const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  const recruiterName = event.queryStringParameters?.recruiter;
  if (!recruiterName) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing recruiter' }) };
  }
  try {
    const store = getStore({
      name: 'candidates',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
    });

    const candidates = await store.get('_all', { type: 'json' }) || [];
    const filtered = candidates.filter(c => c.recruiter === recruiterName);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(filtered)
    };
  } catch (error) {
    console.error('Error in getMyCandidates:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};