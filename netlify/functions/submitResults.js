const { getStore } = require('@netlify/blobs');
const Busboy = require('busboy');
const { Readable } = require('stream');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

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

        // Проверяем существование кандидата
        const candidateData = await store.get(code, { type: 'json' });
        if (!candidateData) {
          resolve({
            statusCode: 404,
            body: JSON.stringify({ error: 'Code not found' })
          });
          return;
        }

        // Разрешаем повторную отправку если статус уже completed
        // (на случай если предыдущая отправка прервалась на стороне клиента)
        // НЕ блокируем — просто перезаписываем файлы

        // Сохраняем файлы
        for (const [fieldname, fileInfo] of Object.entries(files)) {
          // Используем стандартные имена файлов для надёжности
          let saveFilename = fileInfo.filename;
          if (!saveFilename || saveFilename.trim() === '') {
            // Если имя пустое — используем fieldname с расширением по mimeType
            const extMap = { 'audio/wav': '.wav', 'audio/mpeg': '.mp3', 'text/plain': '.txt', 'application/json': '.json' };
            saveFilename = fieldname + (extMap[fileInfo.mimeType] || '');
          }
          const fileKey = `${code}/${saveFilename}`;
          console.log(`[submitResults] Saving file: ${fileKey}, size: ${fileInfo.data.length}`);
          await store.set(fileKey, fileInfo.data);
        }

        // Обновляем статус
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

    const buffer = Buffer.from(event.body, 'base64');
    const readable = Readable.from(buffer);
    readable.pipe(busboy);
  });
};
