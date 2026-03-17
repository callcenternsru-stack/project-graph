const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const { username, password } = JSON.parse(event.body);
    if (!username || !password) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing credentials' }) };
    }
    const store = getStore({
      name: 'recruiters',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });
    // Читаем массив рекрутеров
    const recruiters = await store.get('_all', { type: 'json' }) || [];
    const recruiter = recruiters.find(r => r.name === username);
    if (recruiter && recruiter.password === password) {
      const { password: _, ...safe } = recruiter;
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, recruiter: safe })
      };
    } else {
      return {
        statusCode: 401,
        body: JSON.stringify({ success: false, error: 'Invalid credentials' })
      };
    }
  } catch (error) {
    console.error('Error in loginRecruiter:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};