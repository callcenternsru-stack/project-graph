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

    // Оставляем только основные ключи (без слеша) – это сами анкеты
    const formKeys = blobs
      .map(item => item.key)
      .filter(key => !key.includes('/'));

    const forms = [];

    for (const key of formKeys) {
      const data = await store.get(key, { type: 'json' });
      if (data) {
        // Добавляем код в сам объект для удобства
        forms.push({ code: key, ...data });
      }
    }

    // Сортируем по дате создания (новые сверху)
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