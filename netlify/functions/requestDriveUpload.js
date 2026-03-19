// netlify/functions/requestDriveUpload.js
const { google } = require('googleapis');
const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { formData, filesInfo, candidateId } = JSON.parse(event.body);
    if (!formData || !filesInfo || !candidateId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
    }

    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });

    const drive = google.drive({ version: 'v3', auth });
    const FOLDER_ID = '1CsXaDQjK1v2AbX_Y2-Kn0a9hhD8DwTRU'; // вынесите в переменные окружения

    const uploadUrls = [];

    for (const fileInfo of filesInfo) {
      console.log(`Processing file: ${fileInfo.name}, index: ${fileInfo.index}`);

      // Шаг 1: Создаём файл (только метаданные)
      const createRes = await drive.files.create({
        requestBody: {
          name: fileInfo.name,
          parents: [FOLDER_ID],
          description: `Candidate: ${formData.fullName}, Project: ${formData.project}`,
        },
        fields: 'id',
      });

      const fileId = createRes.data.id;
      console.log(`File created with ID: ${fileId}`);

      // Шаг 2: Инициируем сессию возобновляемой загрузки (обновление файла с пустым телом)
      const updateRes = await drive.files.update({
        fileId: fileId,
        media: {
          body: '', // пустое тело – только инициализация сессии
          mimeType: fileInfo.type,
        },
        fields: 'id',
      }, {
        uploadType: 'resumable', // ключевая опция
      });

      // Логируем ответ для отладки
      console.log('Update response status:', updateRes.status);
      console.log('Update response headers:', JSON.stringify(updateRes.headers, null, 2));
      console.log('Update response data:', JSON.stringify(updateRes.data, null, 2));

      const uploadUrl = updateRes.headers?.location || updateRes.headers?.Location;
      if (!uploadUrl) {
        throw new Error(`No upload URL returned for file ${fileInfo.name}. Headers: ${JSON.stringify(updateRes.headers)}`);
      }

      console.log(`Upload URL for ${fileInfo.name}: ${uploadUrl}`);
      uploadUrls.push({ uploadUrl, index: fileInfo.index, fileId });
    }

    // Сохраняем черновик в хранилище (без изменений)
    const manualStore = getStore({
      name: 'manualForms',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
    });

    const record = {
      id: candidateId,
      ...formData,
      submittedAt: new Date().toISOString(),
      status: 'uploading',
      recruitmentStatus: 'draft',
      files: [],
    };

    await manualStore.setJSON(candidateId, record);
    let index = await manualStore.get('_index', { type: 'json' }) || [];
    index = index.filter(item => item.id !== candidateId);
    index.push({ id: candidateId, submittedAt: record.submittedAt, status: record.status });
    if (index.length > 200) index = index.slice(-200);
    await manualStore.setJSON('_index', index);

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        success: true,
        uploadUrls: uploadUrls.map(u => u.uploadUrl),
        fileIndices: uploadUrls.map(u => u.index),
        fileIds: uploadUrls.map(u => u.fileId),
        candidateId,
      }),
    };
  } catch (error) {
    console.error('Error in requestDriveUpload:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message }),
    };
  }
};