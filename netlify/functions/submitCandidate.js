const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const candidate = JSON.parse(event.body);
    if (!candidate.fullName || !candidate.phone || !candidate.recruiter) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
    }

    const store = getStore({
      name: 'candidates',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
    });

    // Читаем текущий массив всех кандидатов
    let candidates = await store.get('_all', { type: 'json' }) || [];

    const candidateId = candidate.id || `${candidate.recruiter}_${Date.now()}`;
    const updatedCandidate = {
      ...candidate,
      id: candidateId,
      updatedAt: new Date().toISOString(),
      createdAt: candidate.createdAt || new Date().toISOString()
    };

    // Обновляем существующего или добавляем нового
    const index = candidates.findIndex(c => c.id === candidateId);
    if (index !== -1) {
      const prev = candidates[index];
      candidates[index] = updatedCandidate;
      await appendHistory(candidateId, {
        type: 'recruiter_action',
        label: '✏️ Действие рекрутера',
        recruiter: updatedCandidate.recruiter,
        details: {
          project:      updatedCandidate.project,
          trainingDate: updatedCandidate.trainingDate,
          trainingTime: updatedCandidate.trainingTime,
          status:       updatedCandidate.callResult,
          comment:      updatedCandidate.comment,
          prevStatus:   prev.callResult
        }
      });
    } else {
      candidates.push(updatedCandidate);
      await appendHistory(candidateId, {
        type: 'contact_created',
        label: '📥 Загружен в базу контактов',
        recruiter: updatedCandidate.recruiter,
        details: {
          id:       candidateId,
          fullName: updatedCandidate.fullName,
          phone:    updatedCandidate.phone,
          project:  updatedCandidate.project
        }
      });
    }

    // Сохраняем весь массив обратно
    await store.setJSON('_all', candidates);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, candidate: updatedCandidate })
    };
  } catch (error) {
    console.error('Error in submitCandidate:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
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