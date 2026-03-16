const { getStore } = require('@netlify/blobs');

exports.handler = async () => {
  const results = {};

  // Функция для миграции одного хранилища
  async function migrateStore(storeName) {
    const store = getStore({
      name: storeName,
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });

    const { blobs } = await store.list();
    const keys = blobs.map(b => b.key).filter(k => k !== '_all'); // исключаем уже существующий индекс

    const items = [];
    for (const key of keys) {
      try {
        const data = await store.get(key, { type: 'json' });
        if (data) items.push(data);
      } catch (e) {
        console.error(`Error reading ${storeName}/${key}:`, e);
      }
    }

    if (items.length > 0) {
      await store.setJSON('_all', items);
      results[storeName] = items.length;
    } else {
      results[storeName] = 0;
    }
  }

  await migrateStore('recruiters');
  await migrateStore('callResults');
  await migrateStore('contactTypes');
  await migrateStore('projects');
  await migrateStore('scripts');
  await migrateStore('candidates'); // если хотите и кандидатов тоже

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true, results })
  };
};