const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const code = event.queryStringParameters?.code;
  const fileName = event.queryStringParameters?.file;
  const type = event.queryStringParameters?.type || 'auto';

  if (!code || !fileName) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing code or file parameter' })
    };
  }

  const storeName = type === 'manual' ? 'manualForms' : 'candidates-data';
  console.log(`[getFile] Request for code: ${code}, file: ${fileName}, type: ${type}, store: ${storeName}`);

  try {
    const store = getStore({
      name: storeName,
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });

    const fileKey = `${code}/${fileName}`;
    console.log(`[getFile] Trying key: ${fileKey}`);
    let fileData = await store.get(fileKey, { type: 'arrayBuffer' });

    if (!fileData) {
      const baseName = fileName.split('.').slice(0, -1).join('.');
      if (baseName) {
        const oldKey = `${code}/${baseName}`;
        console.log(`[getFile] Not found with extension, trying old key: ${oldKey}`);
        fileData = await store.get(oldKey, { type: 'arrayBuffer' });
      }
    }

    if (!fileData) {
      console.log(`[getFile] File not found for code: ${code}, file: ${fileName}`);
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'File not found' })
      };
    }

    let contentType = 'application/octet-stream';
    if (fileName.endsWith('.txt')) contentType = 'text/plain; charset=utf-8';
    else if (fileName.endsWith('.json')) contentType = 'application/json';
    else if (fileName.endsWith('.wav')) contentType = 'audio/wav';
    else if (fileName.endsWith('.mp3')) contentType = 'audio/mpeg';

    console.log(`[getFile] File found, size: ${fileData.byteLength} bytes, returning`);

    const buffer = Buffer.from(fileData);
    const base64 = buffer.toString('base64');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': contentType,
        // Content-Disposition убран – браузер будет открывать файлы, которые может отобразить
      },
      body: base64,
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