const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const code = event.queryStringParameters?.code;
  const fileName = event.queryStringParameters?.file;

  if (!code || !fileName) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing code or file parameter' })
    };
  }

  // Формируем ключ файла с расширением (новый формат)
  let fileKey = `${code}/${fileName}`;

  try {
    const store = getStore({
      name: 'candidates-data',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });

    // Пытаемся получить файл по полному имени
    let fileData = await store.get(fileKey, { type: 'arrayBuffer' });

    // Если не найден, пробуем без расширения (для старых данных)
    if (!fileData) {
      const baseName = fileName.split('.').slice(0, -1).join('.');
      if (baseName) {
        fileKey = `${code}/${baseName}`;
        fileData = await store.get(fileKey, { type: 'arrayBuffer' });
      }
    }

    if (!fileData) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'File not found' })
      };
    }

    // Определяем MIME-тип по расширению (если есть)
    let contentType = 'application/octet-stream';
    if (fileName.endsWith('.txt')) contentType = 'text/plain; charset=utf-8';
    else if (fileName.endsWith('.json')) contentType = 'application/json';
    else if (fileName.endsWith('.wav')) contentType = 'audio/wav';

    return {
      statusCode: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${fileName}"`
      },
      body: fileData.toString('base64'),
      isBase64Encoded: true
    };
  } catch (error) {
    console.error('Error in getFile:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};