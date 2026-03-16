const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const store = getStore({
      name: 'candidates-data',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });

    const { blobs } = await store.list();
    // Оставляем только ключи без слеша (основные анкеты)
    const candidateKeys = blobs
      .map(item => item.key)
      .filter(key => !key.includes('/'));

    // Загружаем данные параллельно пачками по 10
    const forms = [];
    const batchSize = 10;
    for (let i = 0; i < candidateKeys.length; i += batchSize) {
      const batch = candidateKeys.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (key) => {
          try {
            const data = await store.get(key, { type: 'json' });
            return data ? { code: key, ...data } : null;
          } catch (e) {
            console.error(`Error loading key ${key}:`, e);
            return null;
          }
        })
      );
      forms.push(...batchResults.filter(d => d !== null));
    }

    // Сортировка по дате создания (новые сверху)
    forms.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(forms)
    };
  } catch (error) {
    console.error('Error in getAllForms:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};