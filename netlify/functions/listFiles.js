const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
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

    // Список всех файлов в хранилище с префиксом кода
    const { blobs } = await store.list({ prefix: `${code}/` });
    
    // Также получаем данные самого кандидата
    const candidateData = await store.get(code, { type: 'json' }).catch(() => null);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        status: candidateData?.status,
        completedAt: candidateData?.completedAt,
        files: blobs.map(b => ({
          key: b.key,
          size: b.size,
          etag: b.etag
        }))
      }, null, 2)
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
