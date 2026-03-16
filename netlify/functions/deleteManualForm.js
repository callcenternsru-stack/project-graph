const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'DELETE') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const id = event.queryStringParameters?.id;
  if (!id) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing id' }) };
  }

  try {
    const store = getStore({
      name: 'manualForms',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });

    // Удаляем основную запись
    await store.delete(id);

    // Удаляем связанные файлы (если есть)
    const { blobs } = await store.list();
    const filesToDelete = blobs
      .map(item => item.key)
      .filter(key => key.startsWith(`${id}/`));
    await Promise.all(filesToDelete.map(key => store.delete(key)));

    // Удаляем из индекса
    const index = await store.get('_index', { type: 'json' }) || [];
    const newIndex = index.filter(item => item.id !== id);
    if (newIndex.length !== index.length) {
      await store.setJSON('_index', newIndex);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };
  } catch (error) {
    console.error('Error in deleteManualForm:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};