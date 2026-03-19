const { google } = require('googleapis');
const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { candidateId, fileIds, status } = JSON.parse(event.body);
    if (!candidateId || !fileIds || !status) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
    }

    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/drive'],
    });

    const drive = google.drive({ version: 'v3', auth });

    const fileLinks = [];
    for (const fileId of fileIds) {
      // Делаем файл публичным
      await drive.permissions.create({
        fileId,
        requestBody: { type: 'anyone', role: 'reader' },
      });

      // Получаем ссылки
      const fileMeta = await drive.files.get({
        fileId,
        fields: 'webViewLink, webContentLink, name',
      });

      fileLinks.push({
        fileId,
        name: fileMeta.data.name,
        viewLink: fileMeta.data.webViewLink,
        downloadLink: fileMeta.data.webContentLink,
      });
    }

    // Сохраняем ссылки в хранилище
    const manualStore = getStore({
      name: 'manualForms',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
    });

    const record = await manualStore.get(candidateId, { type: 'json' });
    if (!record) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Candidate not found' }) };
    }

    record.status = status; // 'completed'
    record.files = fileLinks;
    await manualStore.setJSON(candidateId, record);

    // Обновляем индекс
    let index = await manualStore.get('_index', { type: 'json' }) || [];
    const idx = index.findIndex(item => item.id === candidateId);
    if (idx !== -1) {
      index[idx].status = status;
    }
    await manualStore.setJSON('_index', index);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, files: fileLinks }),
    };
  } catch (error) {
    console.error('Error in confirmUpload:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};