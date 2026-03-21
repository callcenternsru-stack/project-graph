const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { id, type, recruitmentStatus } = JSON.parse(event.body);
    if (!id || !type || !recruitmentStatus) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing fields' }) };
    }

    const storeName = type === 'auto' ? 'candidates-data' : 'manualForms';
    const store = getStore({
      name: storeName,
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
    });

    const data = await store.get(id, { type: 'json' });
    if (!data) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Not found' }) };
    }

    // Обновляем статус в анкете
    data.recruitmentStatus = recruitmentStatus;
    await store.setJSON(id, data);

    // Если у анкеты есть contactId, обновляем соответствующую запись в базе контактов
    if (data.contactId) {
      const candidatesStore = getStore({
        name: 'candidates',
        siteID: process.env.NETLIFY_SITE_ID,
        token: process.env.NETLIFY_ACCESS_TOKEN,
      });
      let candidates = await candidatesStore.get('_all', { type: 'json' }) || [];
      const candidateIndex = candidates.findIndex(c => c.id === data.contactId);
      if (candidateIndex !== -1) {
        // Синхронизируем статус звонка (callResult) из рекрутингового статуса
        candidates[candidateIndex].callResult = recruitmentStatus;
        await candidatesStore.setJSON('_all', candidates);
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };
  } catch (error) {
    console.error('Error in updateCandidateStatus:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};