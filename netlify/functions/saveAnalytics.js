const { getStore } = require('@netlify/blobs');
const Busboy = require('busboy');
const { Readable } = require('stream');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const contentType = event.headers['content-type'] || '';

  // Если это multipart (с файлом)
  if (contentType.includes('multipart/form-data')) {
    return new Promise((resolve) => {
      const bb = Busboy({
        headers: { 'content-type': contentType },
        limits: { fileSize: 20 * 1024 * 1024, fields: 20, files: 1 }
      });

      const fields = {};
      let fileData = null;
      let fileName = null;
      let fileMime = null;

      bb.on('field', (name, val) => {
        fields[name] = val;
      });

      bb.on('file', (name, file, info) => {
        fileName = info.filename;
        fileMime = info.mimeType;
        const chunks = [];
        file.on('data', (chunk) => chunks.push(chunk));
        file.on('end', () => {
          fileData = Buffer.concat(chunks);
        });
      });

      bb.on('finish', async () => {
        try {
          const result = await saveEntry(fields, fileData, fileName, fileMime);
          resolve(result);
        } catch (error) {
          console.error('Error in saveAnalytics (multipart):', error);
          resolve({ statusCode: 500, body: JSON.stringify({ error: error.message }) });
        }
      });

      bb.on('error', (error) => {
        resolve({ statusCode: 400, body: JSON.stringify({ error: error.message }) });
      });

      const buffer = Buffer.from(event.body, 'base64');
      const readable = Readable.from(buffer);
      readable.pipe(bb);
    });
  }

  // JSON без файла
  try {
    const fields = JSON.parse(event.body);
    return await saveEntry(fields, null, null, null);
  } catch (error) {
    console.error('Error in saveAnalytics (json):', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};

async function saveEntry(fields, fileData, fileName, fileMime) {
  const { recruiterName, description, quality } = fields;

  if (!recruiterName || !description || quality === undefined || quality === null || quality === '') {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing required fields: recruiterName, description, quality' })
    };
  }

  const qualityNum = parseInt(quality, 10);
  if (isNaN(qualityNum) || qualityNum < 0 || qualityNum > 100) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Quality must be a number between 0 and 100' })
    };
  }

  // Парсим параметры оценки
  let params = [];
  try {
    if (fields.params) params = JSON.parse(fields.params);
  } catch { params = []; }

  const store = getStore({
    name: 'analytics',
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_ACCESS_TOKEN,
  });

  let analytics = await store.get('all', { type: 'json' }) || [];

  const id = `analytics_${Date.now()}`;
  let fileUrl = null;

  if (fileData && fileName) {
    const fileKey = `${id}/${fileName}`;
    await store.set(fileKey, fileData);
    fileUrl = `/.netlify/functions/getFile?code=${id}&file=${encodeURIComponent(fileName)}&type=analytics`;
  }

  const newEntry = {
    id,
    recruiterName,
    description,
    quality: qualityNum,
    params,
    fileUrl,
    createdAt: new Date().toISOString()
  };

  analytics.push(newEntry);
  await store.setJSON('all', analytics);

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true, entry: newEntry })
  };
}
