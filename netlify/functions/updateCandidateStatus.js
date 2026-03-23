const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { id, type, recruitmentStatus, reminderCount, contactId } = JSON.parse(event.body);
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

    // Обновляем статус и contactId в анкете
    data.recruitmentStatus = recruitmentStatus;
    if (reminderCount !== undefined) data.reminderCount = reminderCount;
    if (contactId !== undefined) data.contactId = contactId;
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
        // Если статус поменялся (не напоминание) — обнуляем reminderCount в контакте
        if (reminderCount !== undefined) {
          candidates[candidateIndex].reminderCount = reminderCount;
        } else if (recruitmentStatus !== '__reminder__') {
          // При любой смене статуса через updateCandidateStatus сбрасываем напоминания
          candidates[candidateIndex].reminderCount = 0;
        }
        await candidatesStore.setJSON('_all', candidates);
      }
    }

    // Фиксируем смену статуса анкеты в истории
    const resolvedContactId = contactId || data.contactId || null;
    if (resolvedContactId) {
      await appendHistory(resolvedContactId, {
        type: 'form_status_changed',
        label: '🔄 Статус анкеты изменён',
        details: {
          status:    recruitmentStatus,
          formId:    id,
          formType:  type
        }
      });
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

async function appendHistory(contactId, event) {
  try {
    const { getStore } = require('@netlify/blobs');
    const store = getStore({
      name: 'candidate-history',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
    });
    let history = [];
    try { history = await store.get(contactId, { type: 'json' }) || []; } catch(e) {}
    history.push({
      ...event,
      timestamp: new Date().toISOString(),
      id: 'evt_' + Date.now() + '_' + Math.random().toString(36).slice(2,7)
    });
    await store.setJSON(contactId, history);
  } catch(e) {
    console.error('appendHistory error:', e);
  }
}