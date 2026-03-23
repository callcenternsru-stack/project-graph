// netlify/functions/getHistory.js
const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const contactId = event.queryStringParameters?.contactId;
  if (!contactId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing contactId' }) };
  }

  try {
    const store = getStore({
      name: 'candidate-history',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
    });

    let history = [];
    try {
      history = await store.get(contactId, { type: 'json' }) || [];
    } catch (e) {}

    // Также пытаемся восстановить историю из существующих данных
    // если история пустая
    if (history.length === 0) {
      history = await restoreHistory(contactId);
      // Сохраняем восстановленную историю
      if (history.length > 0) {
        await store.setJSON(contactId, history);
      }
    }

    // Сортируем по времени
    history.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(history)
    };
  } catch (error) {
    console.error('Error in getHistory:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};

// Восстановление истории из существующих данных
async function restoreHistory(contactId) {
  const history = [];

  try {
    // Читаем контакт из базы
    const candidatesStore = getStore({
      name: 'candidates',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
    });
    const allContacts = await candidatesStore.get('_all', { type: 'json' }) || [];
    const contact = allContacts.find(c => c.id === contactId);

    if (contact) {
      // Событие загрузки в базу
      history.push({
        id: `evt_restored_created`,
        type: 'contact_created',
        timestamp: contact.createdAt || new Date().toISOString(),
        label: '📥 Загружен в базу контактов',
        recruiter: contact.recruiter || '—',
        details: {
          id: contact.id,
          fullName: contact.fullName,
          phone: contact.phone,
          project: contact.project
        }
      });

      // Если есть статус — фиксируем его
      if (contact.callResult) {
        history.push({
          id: `evt_restored_status`,
          type: 'status_changed',
          timestamp: contact.updatedAt || contact.createdAt,
          label: '🔄 Статус изменён',
          recruiter: contact.recruiter || '—',
          details: {
            status: contact.callResult,
            project: contact.project,
            trainingDate: contact.trainingDate,
            trainingTime: contact.trainingTime,
            comment: contact.comment
          }
        });
      }
    }

    // Ищем анкеты по contactId
    const autoStore = getStore({
      name: 'candidates-data',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
    });
    const manualStore = getStore({
      name: 'manualForms',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
    });

    // Авто-анкеты
    const autoIndex = await autoStore.get('_index', { type: 'json' }) || [];
    for (const item of autoIndex) {
      try {
        const data = await autoStore.get(item.code, { type: 'json' });
        if (data && data.contactId === contactId) {
          history.push({
            id: `evt_restored_auto_draft_${item.code}`,
            type: 'form_draft',
            timestamp: data.createdAt,
            label: '📝 Попал в черновики (авто-анкета)',
            details: { formId: item.code, type: 'auto' }
          });
          if (data.completedAt) {
            history.push({
              id: `evt_restored_auto_completed_${item.code}`,
              type: 'form_completed',
              timestamp: data.completedAt,
              label: '✅ Прошёл проверку (авто)',
              details: { formId: item.code, type: 'auto' }
            });
          }
          if (data.recruitmentStatus && data.recruitmentStatus !== 'draft') {
            history.push({
              id: `evt_restored_auto_status_${item.code}`,
              type: 'form_status_changed',
              timestamp: data.updatedAt || data.createdAt,
              label: '🔄 Статус анкеты изменён',
              details: { status: data.recruitmentStatus, formId: item.code, type: 'auto' }
            });
          }
        }
      } catch (e) {}
    }

    // Ручные анкеты
    const manualIndex = await manualStore.get('_index', { type: 'json' }) || [];
    for (const item of manualIndex) {
      try {
        const data = await manualStore.get(item.id, { type: 'json' });
        if (data && data.contactId === contactId) {
          history.push({
            id: `evt_restored_manual_draft_${item.id}`,
            type: 'form_draft',
            timestamp: data.submittedAt,
            label: '📝 Попал в черновики (ручная анкета)',
            details: { formId: item.id, type: 'manual' }
          });
          if (data.recruitmentStatus && data.recruitmentStatus !== 'draft') {
            history.push({
              id: `evt_restored_manual_status_${item.id}`,
              type: 'form_status_changed',
              timestamp: data.submittedAt,
              label: '🔄 Статус анкеты изменён',
              details: { status: data.recruitmentStatus, formId: item.id, type: 'manual' }
            });
          }
        }
      } catch (e) {}
    }

  } catch (e) {
    console.error('Error restoring history:', e);
  }

  return history;
}
