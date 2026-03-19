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

    // Аутентификация сервисного аккаунта
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });

    const drive = google.drive({ version: 'v3', auth });

    // ID вашей папки на Google Drive
    const FOLDER_ID = '1CsXaDQjK1v2AbX_Y2-Kn0a9hhD8DwTRU';

    const uploadUrls = [];

    for (const fileInfo of filesInfo) {
      const requestBody = {
        name: fileInfo.name,
        parents: [FOLDER_ID],
        description: `Candidate: ${formData.fullName}, Project: ${formData.project}`,
      };

      // Создаём файл и получаем ссылку для возобновляемой загрузки
      const res = await drive.files.create({
        requestBody,
        media: { mimeType: fileInfo.type, body: '' },
        fields: 'id',
      }, {
        onUploadProgress: () => {}, // заглушка
      });

      // В ответе есть uploadUrl в конфиге
      const uploadUrl = res.config.url;
      uploadUrls.push({
        uploadUrl,
        index: fileInfo.index,
      });
    }

    // Сохраняем черновик (или обновляем существующий) со статусом 'uploading'
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

    // Обновляем индекс
    let index = await manualStore.get('_index', { type: 'json' }) || [];
    index = index.filter(item => item.id !== candidateId);
    index.push({ id: candidateId, submittedAt: record.submittedAt, status: record.status });
    if (index.length > 200) index = index.slice(-200);
    await manualStore.setJSON('_index', index);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        uploadUrls: uploadUrls.map(u => u.uploadUrl),
        fileIndices: uploadUrls.map(u => u.index),
        candidateId,
      }),
    };
  } catch (error) {
    console.error('Error in requestDriveUpload:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};