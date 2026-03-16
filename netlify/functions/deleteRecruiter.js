const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'DELETE') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  const name = event.queryStringParameters?.name;
  if (!name) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing name' }) };
  }
  try {
    const store = getStore({
      name: 'recruiters',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });

    let recruiters = await store.get('_all', { type: 'json' }) || [];
    const newRecruiters = recruiters.filter(r => r.name !== name);
    if (newRecruiters.length === recruiters.length) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Recruiter not found' }) };
    }
    await store.setJSON('_all', newRecruiters);

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (error) {
    console.error('Error in deleteRecruiter:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};