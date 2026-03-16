const { getStore } = require('@netlify/blobs');

exports.handler = async () => {
  try {
    const store = getStore({
      name: 'manualForms',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN
    });

    const { blobs } = await store.list();
    const candidateKeys = blobs
      .map(item => item.key)
      .filter(key => !key.includes('/') && key !== '_index');

    const index = [];
    const batchSize = 10;

    for (let i = 0; i < candidateKeys.length; i += batchSize) {
      const batch = candidateKeys.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (key) => {
          try {
            const data = await store.get(key, { type: 'json' });
            return { id: key, submittedAt: data?.submittedAt || new Date(0).toISOString(), status: data?.status || 'unknown' };
          } catch (e) {
            return null;
          }
        })
      );
      index.push(...batchResults.filter(r => r !== null));
    }

    // Сортируем по дате
    index.sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));
    await store.setJSON('_index', index);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, count: index.length })
    };
  } catch (error) {
    console.error('Error in migrateManualFormsIndex:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};