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
    const bb = Busboy({ headers: { 'content-type': contentType } });

    const fields = {};
    const files = {};

    bb.on('field', (name, val) => {
      fields[name] = val;
    });

    bb.on('file', (name, file, info) => {
      const { filename, encoding, mimeType } = info;
      const chunks = [];
      file.on('data', (chunk) => chunks.push(chunk));
      file.on('end', () => {
        files[name] = {
          filename,
          mimeType,
          data: Buffer.concat(chunks)
        };
      });
    });

    bb.on('finish', async () => {
      try {
        const store = getStore({
          name: 'manualForms',
          siteID: process.env.NETLIFY_SITE_ID,
          token: process.env.NETLIFY_ACCESS_TOKEN,
          apiURL: 'https://api.netlify.com'
        });

        // Определяем ID записи: если передан, используем его, иначе генерируем новый
        const recordId = fields.id || `manual_${Date.now()}`;

        // Сохраняем текстовые поля
        const record = {
          id: recordId,
          fullName: fields.fullName,
          nickname: fields.nickname,
          telegram: fields.telegram,
          phone: fields.phone,
          email: fields.email,
          project: fields.project,
          projectId: fields.projectId,
          status: fields.status || 'draft', // draft, completed
          submittedAt: new Date().toISOString()
        };

        // Если есть дополнительные поля (ответы на тесты, результаты), добавляем их
        if (fields.taskAnswers) {
          try {
            record.taskAnswers = JSON.parse(fields.taskAnswers);
          } catch (e) {
            console.error('Error parsing taskAnswers', e);
          }
        }
        if (fields.taskScores) {
          try {
            record.taskScores = JSON.parse(fields.taskScores);
          } catch (e) {
            console.error('Error parsing taskScores', e);
          }
        }

        // Сохраняем файлы, если они есть
        const fileUrls = {};
        for (const [name, fileInfo] of Object.entries(files)) {
          const fileKey = `${recordId}/${fileInfo.filename}`;
          await store.set(fileKey, fileInfo.data);
          fileUrls[name] = `/.netlify/functions/getFile?code=${recordId}&file=${fileInfo.filename}`;
        }
        if (Object.keys(fileUrls).length > 0) {
          record.files = fileUrls;
        }

        // Сохраняем запись (перезаписываем, если уже существует)
        await store.setJSON(recordId, record);

        resolve({
          statusCode: 200,
          body: JSON.stringify({ success: true, id: recordId })
        });
      } catch (error) {
        console.error('Error in submitManualResults:', error);
        resolve({
          statusCode: 500,
          body: JSON.stringify({ error: error.message })
        });
      }
    });

    bb.on('error', (error) => {
      reject({
        statusCode: 500,
        body: JSON.stringify({ error: error.message })
      });
    });

    const buffer = Buffer.from(event.body, 'base64');
    const readable = Readable.from(buffer);
    readable.pipe(bb);
  });
};