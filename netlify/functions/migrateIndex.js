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

    // Собираем информацию о каждой анкете
    const index = [];
    for (const key of candidateKeys) {
      const data = await store.get(key, { type: 'json' });
      if (data && data.createdAt) {
        index.push({ code: key, createdAt: data.createdAt });
      } else {
        // fallback – используем текущее время, но это не идеально
        index.push({ code: key, createdAt: new Date().toISOString() });
      }
    }

    // Сортируем по дате (старые сначала, новые в конце – так slice(-N) будет давать последние)
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