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

    let candidates = await store.get('_all', { type: 'json' }) || [];

    const newCandidate = {
      ...candidate,
      id: `${candidate.recruiter}_${Date.now()}`,
      updatedAt: new Date().toISOString(),
      createdAt: candidate.createdAt || new Date().toISOString()
    };
    candidates.push(newCandidate);
    // Ограничим размер хранимого массива (например, последние 500)
    if (candidates.length > 500) candidates = candidates.slice(-500);

    await store.setJSON('_all', candidates);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, candidate: newCandidate })
    };
  } catch (error) {
    console.error('Error in submitCandidate:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};