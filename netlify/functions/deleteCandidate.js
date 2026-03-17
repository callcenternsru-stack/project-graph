const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'DELETE') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  const id = event.queryStringParameters?.id;
  if (!id) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing id' }) };
  }
  try {
    const store = getStore({
      name: 'candidates',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
    });

    let candidates = await store.get('_all', { type: 'json' }) || [];
    const newCandidates = candidates.filter(c => c.id !== id);
    if (newCandidates.length === candidates.length) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Candidate not found' }) };
    }
    await store.setJSON('_all', newCandidates);

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (error) {
    console.error('Error in deleteCandidate:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};