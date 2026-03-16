const { getStore } = require('@netlify/blobs');

exports.handler = async () => {
  try {
    const store = getStore({
      name: 'candidates',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN
    });

    const { blobs } = await store.list();
    const candidateKeys = blobs
      .map(item => item.key)
      .filter(key => !key.includes('/') && key !== '_index' && key !== '_all');

    const index = [];
    const batchSize = 10;

    for (let i = 0; i < candidateKeys.length; i += batchSize) {
      const batch = candidateKeys.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (key) => {
          try {
            const data = await store.get(key, { type: 'json' });
            return { id: key, createdAt: data?.createdAt || new Date(0).toISOString() };
          } catch (e) {
            return null;
          }
        })
      );
      index.push(...batchResults.filter(r => r !== null));
    }

    index.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    await store.setJSON('_index', index);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, count: index.length })
    };
  } catch (error) {
    console.error('Error in migrateCandidatesIndex:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};