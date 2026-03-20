const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const store = getStore({
      name: 'analytics',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
    });
    const analytics = await store.get('all', { type: 'json' }) || [];

    // Если передан параметр recruiterId, фильтруем записи
    const recruiterId = event.queryStringParameters?.recruiterId;
    if (recruiterId) {
      const filtered = analytics.filter(a => a.recruiterName === recruiterId);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filtered)
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(analytics)
    };
  } catch (error) {
    console.error('Error in getAnalytics:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};