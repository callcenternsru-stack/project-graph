const { getStore } = require('@netlify/blobs');
const Busboy = require('busboy');
const { Readable } = require('stream');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Проверяем, что заголовок Content-Type содержит multipart/form-data
  const contentType = event.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Expected multipart/form-data' })
    };
  }

  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: { 'content-type': contentType } });

    let code = null;
    const files = {};

    busboy.on('field', (fieldname, val) => {
      if (fieldname === 'code') {
        code = val;
      }
    });

    busboy.on('file', (fieldname, file, info) => {
      const { filename, encoding, mimeType } = info;
      // Сохраняем файл в буфер
      const chunks = [];
      file.on('data', (chunk) => chunks.push(chunk));
      file.on('end', () => {
        files[fieldname] = {
          filename,
          mimeType,
          data: Buffer.concat(chunks)
        };
      });
    });

    busboy.on('finish', async () => {
      if (!code) {
        resolve({
          statusCode: 400,
          body: JSON.stringify({ error: 'Missing code field' })
        });
        return;
      }

      try {
        const store = getStore({
          name: 'candidates-data',
          siteID: process.env.NETLIFY_SITE_ID,
          token: process.env.NETLIFY_ACCESS_TOKEN,
          apiURL: 'https://api.netlify.com'
        });

        // Проверяем, существует ли кандидат и имеет ли статус pending
        const candidateData = await store.get(code, { type: 'json' });
        if (!candidateData) {
          resolve({
            statusCode: 404,
            body: JSON.stringify({ error: 'Code not found' })
          });
          return;
        }
        if (candidateData.status !== 'pending') {
          resolve({
            statusCode: 400,
            body: JSON.stringify({ error: 'Code already processed' })
          });
          return;
        }

        // Сохраняем каждый файл в отдельный блоб
        for (const [fieldname, fileInfo] of Object.entries(files)) {
          const fileKey = `${code}/${fieldname}`; // например, ROSSETI-XXXX/report.txt
          await store.set(fileKey, fileInfo.data);
        }

        // Обновляем статус кандидата на completed
        candidateData.status = 'completed';
        candidateData.completedAt = new Date().toISOString();
        await store.setJSON(code, candidateData);

        resolve({
          statusCode: 200,
          body: JSON.stringify({ success: true, message: 'Results saved' })
        });
      } catch (error) {
        console.error('Error in submitResults:', error);
        resolve({
          statusCode: 500,
          body: JSON.stringify({ error: error.message })
        });
      }
    });

    busboy.on('error', (error) => {
      reject({
        statusCode: 500,
        body: JSON.stringify({ error: error.message })
      });
    });

    // Передаём тело запроса в busboy
    const buffer = Buffer.from(event.body, 'base64');
    const readable = Readable.from(buffer);
    readable.pipe(busboy);
  });
};