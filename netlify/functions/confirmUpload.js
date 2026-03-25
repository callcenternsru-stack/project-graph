// netlify/functions/confirmUpload.js
const { getStore } = require('@netlify/blobs');
const { appendHistory } = require('./shared/contactHelper');

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

    const wasCompleted = record.status === 'completed';

    // Формируем публичные ссылки на R2
    const files = {};
    for (const f of fileKeys) {
      files[`task_${f.index}`] = `${process.env.R2_PUBLIC_URL}/${f.key}`;
    }

    record.status      = status;
    record.files       = files;
    record.completedAt = new Date().toISOString();

    await manualStore.setJSON(candidateId, record);

    // Обновляем индекс
    let index = await manualStore.get('_index', { type: 'json' }) || [];
    const idxPos = index.findIndex(item => item.id === candidateId);
    if (idxPos !== -1) {
      index[idxPos].status = status;
    }
    await manualStore.setJSON('_index', index);

    // ── Пишем историю в контакт (только при первом completed) ──────────
    if (!wasCompleted && status === 'completed' && record.contactId) {
      try {
        await appendHistory(record.contactId, {
          type:      'form_completed',
          label:     '✅ Прошёл проверку (ручная)',
          recruiter: record.recruiter || null,
          details: {
            formId:            candidateId,
            formType:          'manual',
            recruitmentStatus: record.recruitmentStatus || 'draft'
          }
        });
        console.log('confirmUpload: history written for contactId:', record.contactId);
      } catch (e) {
        console.error('confirmUpload: appendHistory failed:', e);
      }
    } else if (!record.contactId) {
      console.warn('confirmUpload: no contactId on record, history skipped');
    }

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
