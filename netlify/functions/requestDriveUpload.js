// netlify/functions/requestDriveUpload.js
const { google } = require('googleapis');
const { getStore } = require('@netlify/blobs');
const axios = require('axios');

// Задержка для retry
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

    // Увеличиваем таймауты для всех HTTP-запросов
    const drive = google.drive({
      version: 'v3',
      auth,
      timeout: 30000, // 30 секунд
    });

    const FOLDER_ID = '1CsXaDQjK1v2AbX_Y2-Kn0a9hhD8DwTRU';

    // Получаем токен заранее
    const accessToken = await auth.getAccessToken();
    const token = accessToken.token;

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

      // Шаг 2: Устанавливаем разрешение на запись для всех с повторными попытками
      let permissionSet = false;
      let attempts = 0;
      const maxAttempts = 3;
      while (!permissionSet && attempts < maxAttempts) {
        try {
          await drive.permissions.create({
            fileId: fileId,
            requestBody: {
              type: 'anyone',
              role: 'writer',
            },
          });
          console.log(`Permission set for file ${fileId} (attempt ${attempts + 1})`);
          permissionSet = true;
        } catch (permError) {
          attempts++;
          console.error(`Permission error for file ${fileId} (attempt ${attempts}):`, permError.message);
          if (attempts >= maxAttempts) {
            console.error(`Failed to set permission after ${maxAttempts} attempts, continuing without public write`);
            // Не прерываем выполнение, просто логируем
          } else {
            await sleep(1000 * attempts); // ждём 1, 2, 3 секунды перед повтором
          }
        }
      }

      // Шаг 3: Инициируем сессию возобновляемой загрузки (PATCH с пустым телом)
      const url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=resumable`;
      const response = await axios.patch(
        url,
        null,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Upload-Content-Type': fileInfo.type,
            'Content-Length': 0,
          },
          timeout: 30000, // 30 секунд
        }
      );

      const uploadUrl = response.headers.location || response.headers.Location;
      if (!uploadUrl) {
        throw new Error(`No upload URL returned for file ${fileInfo.name}. Headers: ${JSON.stringify(response.headers)}`);
      }

      console.log(`Upload URL for ${fileInfo.name}: ${uploadUrl}`);
      uploadUrls.push({ uploadUrl, index: fileInfo.index, fileId });
    }

    // Сохраняем черновик в хранилище
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
        token, // всё равно передаём токен на случай, если permissions не сработают
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