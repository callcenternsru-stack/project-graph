const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  // Разрешаем только GET-запросы
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Получаем параметры запроса
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
  console.log(`[getFile] Request for code: ${code}, file: ${fileName}`);

  try {
    // Получаем доступ к хранилищу
    const store = getStore({
      name: 'candidates-data',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });

    // Пытаемся получить файл по полному имени (с расширением)
    console.log(`[getFile] Trying key: ${fileKey}`);
    let fileData = await store.get(fileKey, { type: 'arrayBuffer' });

    // Если не найден, пробуем без расширения (для старых данных)
    if (!fileData) {
      const baseName = fileName.split('.').slice(0, -1).join('.');
      if (baseName) {
        const oldKey = `${code}/${baseName}`;
        console.log(`[getFile] Not found with extension, trying old key: ${oldKey}`);
        fileData = await store.get(oldKey, { type: 'arrayBuffer' });
        if (fileData) {
          console.log(`[getFile] Found using old key: ${oldKey}`);
        }
      } else {
        console.log(`[getFile] File name has no extension, cannot fallback`);
      }
    }

    if (!fileData) {
      console.log(`[getFile] File not found for code: ${code}, file: ${fileName}`);
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'File not found' })
      };
    }

    // Определяем MIME-тип по расширению
    let contentType = 'application/octet-stream';
    if (fileName.endsWith('.txt')) contentType = 'text/plain; charset=utf-8';
    else if (fileName.endsWith('.json')) contentType = 'application/json';
    else if (fileName.endsWith('.wav')) contentType = 'audio/wav';

    console.log(`[getFile] File found, size: ${fileData.byteLength} bytes, returning`);

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
    console.error('[getFile] Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};