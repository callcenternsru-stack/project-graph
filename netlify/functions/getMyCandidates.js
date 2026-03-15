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
      apiURL: 'https://api.netlify.com'
    });
    const { blobs } = await store.list();
    const candidates = [];
    for (const blob of blobs) {
      const data = await store.get(blob.key, { type: 'json' });
      if (data && data.recruiter === recruiterName) candidates.push(data);
    }
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(candidates)
    };
  } catch (error) {
    console.error('Error in getMyCandidates:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};