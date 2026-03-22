const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'DELETE') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const id = event.queryStringParameters?.id;
  if (!id) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing id parameter' }) };
  }

  try {
    const store = getStore({
      name: 'analytics',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
    });

    let analytics = await store.get('all', { type: 'json' }) || [];

    const index = analytics.findIndex(a => a.id === id);
    if (index === -1) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Analytics entry not found' }) };
    }

    // Удаляем связанный файл если есть
    const entry = analytics[index];
    if (entry.fileUrl) {
      try {
        const urlParams = new URL(entry.fileUrl, 'https://example.com');
        const fileName = urlParams.searchParams.get('file');
        if (fileName) {
          const fileKey = `${id}/${fileName}`;
          await store.delete(fileKey);
        }
      } catch (e) {
        console.error('Error deleting analytics file:', e);
      }
    }

    analytics.splice(index, 1);
    await store.setJSON('all', analytics);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };
  } catch (error) {
    console.error('Error in deleteAnalytics:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
