const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const code     = event.queryStringParameters?.code;
  const fileName = event.queryStringParameters?.file;
  const type     = event.queryStringParameters?.type || 'auto';

  if (!code || !fileName) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing code or file parameter' }) };
  }

  let storeName;
  if (code.startsWith('manual_')) {
    storeName = 'manualForms';
  } else {
    storeName = type === 'manual' ? 'manualForms' : 'candidates-data';
  }

  console.log(`[getFile] Request: code=${code}, file=${fileName}, store=${storeName}`);

  try {
    const store = getStore({
      name: storeName,
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });

    const base = fileName.includes('.') ? fileName.split('.').slice(0, -1).join('.') : fileName;
    const keysToTry = [...new Set([
      `${code}/${fileName}`,
      `${code}/voice_recording.wav`,
      `${code}/voice_recording.mp3`,
      `${code}/voice`,
      `${code}/${base}`,
      `${code}/${fileName.replace('.wav','.mp3')}`,
      `${code}/${fileName.replace('.mp3','.wav')}`,
    ])];

    let fileData = null;
    let foundKey = null;

    for (const key of keysToTry) {
      try {
        const data = await store.get(key, { type: 'arrayBuffer' });
        if (data && data.byteLength > 0) { fileData = data; foundKey = key; break; }
      } catch (e) { /* не найден */ }
    }

    if (!fileData) {
      console.log(`[getFile] Not found. Tried: ${keysToTry.join(', ')}`);
      return { statusCode: 404, body: JSON.stringify({ error: 'File not found' }) };
    }

    console.log(`[getFile] Found: ${foundKey}, size: ${fileData.byteLength}`);

    const ext = (foundKey.split('.').pop() || '').toLowerCase();
    let contentType = 'application/octet-stream';
    if      (ext === 'txt')  contentType = 'text/plain; charset=utf-8';
    else if (ext === 'json') contentType = 'application/json';
    else if (ext === 'wav')  contentType = 'audio/wav';
    else if (ext === 'mp3')  contentType = 'audio/mpeg';
    else if (ext === 'png')  contentType = 'image/png';
    else if (ext === 'jpg' || ext === 'jpeg') contentType = 'image/jpeg';
    else if (ext === 'pdf')  contentType = 'application/pdf';
    else {
      const bytes = new Uint8Array(fileData.slice(0, 4));
      if (bytes[0]===0x52&&bytes[1]===0x49&&bytes[2]===0x46&&bytes[3]===0x46) contentType='audio/wav';
      else if ((bytes[0]===0x49&&bytes[1]===0x44&&bytes[2]===0x33)||(bytes[0]===0xFF&&(bytes[1]&0xE0)===0xE0)) contentType='audio/mpeg';
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': contentType, 'Content-Disposition': 'inline' },
      body: Buffer.from(fileData).toString('base64'),
      isBase64Encoded: true
    };
  } catch (error) {
    console.error('[getFile] Error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
