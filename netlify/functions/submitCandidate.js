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
      apiURL: 'https://api.netlify.com'
    });

    // Определяем ID: если передан, используем его (обновление), иначе генерируем новый (создание)
    const candidateId = candidate.id || `${candidate.recruiter}_${Date.now()}`;

    // Работа с индексом (только для новых кандидатов)
    const indexKey = '_index';
    let index = await store.get(indexKey, { type: 'json' }) || [];

    if (!candidate.id) {
      // Новый кандидат – добавляем в индекс
      index.push({ id: candidateId, createdAt: candidate.createdAt || new Date().toISOString() });
      if (index.length > 500) index = index.slice(-500);
      await store.setJSON(indexKey, index);
    }
    // При обновлении существующего кандидата индекс не меняем (ID остаётся прежним)

    const updatedCandidate = {
      ...candidate,
      id: candidateId,
      updatedAt: new Date().toISOString(),
      createdAt: candidate.createdAt || new Date().toISOString()
    };

    await store.setJSON(candidateId, updatedCandidate);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, candidate: updatedCandidate })
    };
  } catch (error) {
    console.error('Error in submitCandidate:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};