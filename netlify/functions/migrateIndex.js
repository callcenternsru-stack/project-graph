const { getStore } = require('@netlify/blobs');

exports.handler = async () => {
  try {
    const store = getStore({
      name: 'candidates-data',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });

    const { blobs } = await store.list();
    const candidateKeys = blobs
      .map(item => item.key)
      .filter(key => !key.includes('/'));

    const index = [];
    const batchSize = 10; // можно увеличить до 20, если анкет много

    for (let i = 0; i < candidateKeys.length; i += batchSize) {
      const batch = candidateKeys.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (key) => {
          try {
            const data = await store.get(key, { type: 'json' });
            // Если есть поле createdAt – используем его, иначе ставим очень старую дату
            const createdAt = data?.createdAt || new Date(0).toISOString();
            return { code: key, createdAt };
          } catch (e) {
            console.error(`Error loading key ${key}:`, e);
            return null;
          }
        })
      );
      index.push(...batchResults.filter(r => r !== null));
    }

    // Сортируем по дате (старые в начале, новые в конце – так slice(-N) будет давать последние)
    index.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    await store.setJSON('_index', index);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, count: index.length })
    };
  } catch (error) {
    console.error('Error in migrateIndex:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};