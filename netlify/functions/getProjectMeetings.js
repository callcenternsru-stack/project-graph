const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const store = getStore({
      name: 'projectMeetings',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });
    const data = await store.get('meetings', { type: 'json' }) || {};
    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60' // 1 минута, так как данные могут обновляться
      },
      body: JSON.stringify(data)
    };
  } catch (error) {
    console.error('Error in getProjectMeetings:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};