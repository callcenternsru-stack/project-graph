const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'DELETE') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const code = event.queryStringParameters?.code;
  if (!code) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing code' }) };
  }

  try {
    const store = getStore({
      name: 'candidates-data',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });

    // Удаляем основную запись кандидата
    await store.delete(code);

    // Получаем список всех ключей и удаляем все, которые начинаются с `${code}/`
    const { blobs } = await store.list();
    const filesToDelete = blobs
      .map(item => item.key)
      .filter(key => key.startsWith(`${code}/`));

    await Promise.all(filesToDelete.map(key => store.delete(key)));

    // Удаляем из индекса
    const index = await store.get('_index', { type: 'json' }) || [];
    const newIndex = index.filter(item => item.code !== code);
    if (newIndex.length !== index.length) {
      await store.setJSON('_index', newIndex);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Auto form deleted' })
    };
  } catch (error) {
    console.error('Error in deleteAutoForm:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};