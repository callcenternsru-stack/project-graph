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
    const FOLDER_ID = '1CsXaDQjK1v2AbX_Y2-Kn0a9hhD8DwTRU'; // лучше вынести в env

    const uploadUrls = [];

    for (const fileInfo of filesInfo) {
      console.log(`Processing file: ${fileInfo.name}, index: ${fileInfo.index}`);

      // Создаём файл и получаем ссылку для возобновляемой загрузки
      const res = await drive.files.create(
        {
          requestBody: {
            name: fileInfo.name,
            parents: [FOLDER_ID],
            description: `Candidate: ${formData.fullName}, Project: ${formData.project}`,
          },
          media: {
            body: '', // пустое тело – только инициализация сессии
            mimeType: fileInfo.type,
          },
          fields: 'id',
        },
        {
          uploadType: 'resumable', // ключевая опция
        }
      );

      // Подробное логирование ответа от Google
      console.log('Google response status:', res.status);
      console.log('Google response headers:', JSON.stringify(res.headers, null, 2));
      console.log('Google response data:', JSON.stringify(res.data, null, 2));
      console.log('Google response config:', JSON.stringify(res.config, null, 2));

      // Правильный uploadUrl находится в заголовке location ответа
      const uploadUrl = res.headers?.location || res.headers?.Location;
      const fileId = res.data?.id;

      if (!uploadUrl) {
        throw new Error(`No upload URL returned for file ${fileInfo.name}. Headers: ${JSON.stringify(res.headers)}`);
      }
      if (!fileId) {
        throw new Error(`No file ID returned for file ${fileInfo.name}. Data: ${JSON.stringify(res.data)}`);
      }

      console.log(`Upload URL for ${fileInfo.name}: ${uploadUrl}`);
      uploadUrls.push({ uploadUrl, index: fileInfo.index, fileId });
    }

    // Сохраняем черновик в хранилище (как и раньше)
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
      headers: { 'Access-Control-Allow-Origin': '*' }, // CORS
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