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
        fileSize: 10 * 1024 * 1024, // 10 MB
        fieldSize: 10 * 1024 * 1024,
        fields: 50,
        files: 10
      }
    });

    const fields = {};
    const files = {};

    bb.on('field', (name, val) => {
      console.log(`Field received: ${name}=${val.substring(0, 50)}...`);
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
        if (fileSize > 10 * 1024 * 1024) {
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
        console.log('All fields keys:', Object.keys(fields));
        // Проверка наличия обязательных полей
        const requiredFields = ['fullName', 'nickname', 'telegram', 'phone', 'email', 'project', 'projectId'];
        const missing = requiredFields.filter(f => !fields[f]);
        if (missing.length > 0) {
          throw new Error(`Missing required fields: ${missing.join(', ')}`);
        }

        // Удаляем все существующие черновики с такими же контактными данными из обоих хранилищ
        const autoStore = getStore({
          name: 'candidates-data',
          siteID: process.env.NETLIFY_SITE_ID,
          token: process.env.NETLIFY_ACCESS_TOKEN,
        });
        const manualStore = getStore({
          name: 'manualForms',
          siteID: process.env.NETLIFY_SITE_ID,
          token: process.env.NETLIFY_ACCESS_TOKEN,
        });

        const contactKey = `${fields.fullName}_${fields.phone}_${fields.email}_${fields.projectId}`;

        // Удаляем из auto-хранилища
        const autoList = await autoStore.list();
        for (const blob of autoList.blobs) {
          if (blob.key.includes('/')) continue;
          const data = await autoStore.get(blob.key, { type: 'json' });
          if (data && data.formData) {
            const key = `${data.formData.fullName}_${data.formData.phone}_${data.formData.email}_${data.formData.projectId}`;
            if (key === contactKey) {
              await autoStore.delete(blob.key);
              console.log(`Deleted auto draft with key ${blob.key}`);
              // Также удаляем из индекса
              const index = await autoStore.get('_index', { type: 'json' }) || [];
              const newIndex = index.filter(item => item.code !== blob.key);
              if (newIndex.length !== index.length) {
                await autoStore.setJSON('_index', newIndex);
              }
            }
          }
        }

        // Удаляем из manual-хранилища
        const manualList = await manualStore.list();
        for (const blob of manualList.blobs) {
          if (blob.key.includes('/')) continue;
          const data = await manualStore.get(blob.key, { type: 'json' });
          if (data) {
            const key = `${data.fullName}_${data.phone}_${data.email}_${data.projectId}`;
            if (key === contactKey && blob.key !== fields.id) { // не удаляем текущий, если обновляем
              await manualStore.delete(blob.key);
              console.log(`Deleted manual draft with key ${blob.key}`);
              const index = await manualStore.get('_index', { type: 'json' }) || [];
              const newIndex = index.filter(item => item.id !== blob.key);
              if (newIndex.length !== index.length) {
                await manualStore.setJSON('_index', newIndex);
              }
            }
          }
        }

        const recordId = fields.id || `manual_${Date.now()}`;
        console.log('Record ID:', recordId);

        // Сохраняем все поля в запись
        const record = {
          id: recordId,
          ...fields,
          submittedAt: new Date().toISOString(),
          recruitmentStatus: fields.status || 'draft'
        };

        // Удаляем лишние поля, если нужно
        delete record.id; // не дублировать

        const fileUrls = {};
        for (const [name, fileInfo] of Object.entries(files)) {
          const fileKey = `${recordId}/${fileInfo.filename}`;
          await manualStore.set(fileKey, fileInfo.data);
          // ВАЖНО: добавляем type=manual
          fileUrls[name] = `/.netlify/functions/getFile?code=${recordId}&file=${encodeURIComponent(fileInfo.filename)}&type=manual`;
        }
        if (Object.keys(fileUrls).length > 0) {
          record.files = fileUrls;
        }

        await manualStore.setJSON(recordId, record);
        console.log('Record saved:', recordId);

        // Обновляем индекс
        const indexKey = '_index';
        let index = await manualStore.get(indexKey, { type: 'json' }) || [];
        index = index.filter(item => item.id !== recordId);
        index.push({ id: recordId, submittedAt: record.submittedAt, status: record.status });
        if (index.length > 200) index = index.slice(-200);
        await manualStore.setJSON(indexKey, index);
        console.log('Index updated');

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