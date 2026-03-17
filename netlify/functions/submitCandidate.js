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
      candidates[index] = updatedCandidate;
    } else {
      candidates.push(updatedCandidate);
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