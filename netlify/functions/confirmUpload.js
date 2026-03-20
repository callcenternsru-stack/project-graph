// netlify/functions/confirmUpload.js
const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { candidateId, fileKeys, status } = JSON.parse(event.body);
    if (!candidateId || !fileKeys || !status) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
    }

    const manualStore = getStore({
      name: 'manualForms',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
    });

    const record = await manualStore.get(candidateId, { type: 'json' });
    if (!record) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Candidate not found' }) };
    }

    // Формируем объект files, где ключи — task_индекс, значения — ссылки для скачивания через getFile
    const files = {};
    for (const f of fileKeys) {
      const fileName = f.key.split('/').pop(); // извлекаем имя файла
      files[`task_${f.index}`] = `/.netlify/functions/getFile?code=${candidateId}&file=${encodeURIComponent(fileName)}&type=manual`;
    }

    record.status = status;
    record.files = files;
    record.completedAt = new Date().toISOString();

    await manualStore.setJSON(candidateId, record);

    // Обновляем индекс
    let index = await manualStore.get('_index', { type: 'json' }) || [];
    const idxPos = index.findIndex(item => item.id === candidateId);
    if (idxPos !== -1) {
      index[idxPos].status = status;
    }
    await manualStore.setJSON('_index', index);

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: true }),
    };
  } catch (error) {
    console.error('Error in confirmUpload:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message }),
    };
  }
};