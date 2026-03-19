// netlify/functions/requestUploadUrls.js
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
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

    // Настройка клиента R2
    const s3Client = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });

    const uploadUrls = [];
    const fileKeys = []; // для сохранения в БД

    for (const fileInfo of filesInfo) {
      // Генерируем уникальный ключ для файла в бакете
      const fileKey = `${candidateId}/${Date.now()}_${fileInfo.name}`;
      fileKeys.push({ index: fileInfo.index, key: fileKey });

      // Создаем команду на загрузку
      const command = new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: fileKey,
        ContentType: fileInfo.type,
      });

      // Генерируем подписанный URL (действителен 1 час)
      const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
      uploadUrls.push({ index: fileInfo.index, url: uploadUrl, key: fileKey });
    }

    // Сохраняем черновик в хранилище Netlify Blobs
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
      files: [], // пока пусто, заполним после загрузки
      fileKeys: fileKeys.map(f => ({ index: f.index, key: f.key })),
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
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        success: true,
        uploadUrls: uploadUrls.map(u => u.url),
        fileIndices: uploadUrls.map(u => u.index),
        fileKeys: uploadUrls.map(u => u.key),
        candidateId,
      }),
    };
  } catch (error) {
    console.error('Error in requestUploadUrls:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message }),
    };
  }
};