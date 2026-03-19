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

    // Формируем публичные ссылки на файлы
    const baseUrl = process.env.R2_PUBLIC_URL; // для публичного доступа (нужно настроить)
    // Или используем endpoint для скачивания (если включено публичное чтение)
    const files = fileKeys.map(f => ({
      index: f.index,
      url: `${baseUrl}/${f.key}`, // предполагаем, что бакет публичный
      key: f.key,
    }));

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