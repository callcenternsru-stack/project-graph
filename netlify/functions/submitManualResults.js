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

  console.log('submitManualResults invoked, body length:', event.body?.length);

  return new Promise((resolve, reject) => {
    const bb = Busboy({
      headers: { 'content-type': contentType },
      limits: {
        fileSize: 15 * 1024 * 1024, // 15 MB (но Netlify может обрезать раньше)
        fieldSize: 10 * 1024 * 1024,
        fields: 50,
        files: 10
      }
    });

    const fields = {};
    const files = {};

    bb.on('field', (name, val) => {
      console.log(`Field received: ${name}=${val.substring(0, 100)}...`);
      fields[name] = val;
    });

    bb.on('file', (name, file, info) => {
      const { filename, encoding, mimeType } = info;
      console.log(`File received: ${name}, filename=${filename}`);
      const chunks = [];
      let fileSize = 0;
      file.on('data', (chunk) => {
        chunks.push(chunk);
        fileSize += chunk.length;
        if (fileSize > 15 * 1024 * 1024) {
          file.destroy(new Error('File too large'));
        }
      });
      file.on('end', () => {
        console.log(`File ${name} ended, total size: ${fileSize}`);
        files[name] = {
          filename,
          mimeType,
          data: Buffer.concat(chunks)
        };
      });
      file.on('error', (err) => {
        console.error('File stream error:', err);
      });
    });

    bb.on('finish', async () => {
      try {
        console.log('All fields:', Object.keys(fields));
        const requiredFields = ['fullName', 'nickname', 'telegram', 'phone', 'email', 'project', 'projectId'];
        for (const field of requiredFields) {
          if (!fields[field]) {
            console.error(`Missing required field: ${field}`);
          }
        }

        const store = getStore({
          name: 'manualForms',
          siteID: process.env.NETLIFY_SITE_ID,
          token: process.env.NETLIFY_ACCESS_TOKEN,
          apiURL: 'https://api.netlify.com'
        });

        const recordId = fields.id || `manual_${Date.now()}`;

        const record = {
          id: recordId,
          fullName: fields.fullName,
          nickname: fields.nickname,
          telegram: fields.telegram,
          phone: fields.phone,
          email: fields.email,
          project: fields.project,
          projectId: fields.projectId,
          status: fields.status || 'draft',
          submittedAt: new Date().toISOString()
        };

        if (fields.taskAnswers) {
          try { record.taskAnswers = JSON.parse(fields.taskAnswers); } catch (e) { console.error('Error parsing taskAnswers', e); }
        }
        if (fields.taskScores) {
          try { record.taskScores = JSON.parse(fields.taskScores); } catch (e) { console.error('Error parsing taskScores', e); }
        }

        const fileUrls = {};
        for (const [name, fileInfo] of Object.entries(files)) {
          const fileKey = `${recordId}/${fileInfo.filename}`;
          await store.set(fileKey, fileInfo.data);
          fileUrls[name] = `/.netlify/functions/getFile?code=${recordId}&file=${fileInfo.filename}`;
        }
        if (Object.keys(fileUrls).length > 0) {
          record.files = fileUrls;
        }

        await store.setJSON(recordId, record);

        // Обновляем индекс
        const indexKey = '_index';
        let index = await store.get(indexKey, { type: 'json' }) || [];
        index = index.filter(item => item.id !== recordId);
        index.push({ id: recordId, submittedAt: record.submittedAt, status: record.status });
        if (index.length > 200) index = index.slice(-200);
        await store.setJSON(indexKey, index);

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
      console.error('Busboy error:', error);
      resolve({
        statusCode: 400,
        body: JSON.stringify({ error: error.message })
      });
    });

    try {
      const buffer = Buffer.from(event.body, 'base64');
      const readable = Readable.from(buffer);
      readable.pipe(bb);
    } catch (err) {
      console.error('Error creating readable stream:', err);
      resolve({
        statusCode: 500,
        body: JSON.stringify({ error: 'Internal server error' })
      });
    }
  });
};