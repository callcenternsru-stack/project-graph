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

    // Читаем индекс
    const indexKey = '_index';
    let index = await store.get(indexKey, { type: 'json' }) || [];

    const newCandidate = {
      ...candidate,
      id: `${candidate.recruiter}_${Date.now()}`,
      updatedAt: new Date().toISOString(),
      createdAt: candidate.createdAt || new Date().toISOString()
    };

    // Сохраняем кандидата
    await store.setJSON(newCandidate.id, newCandidate);

    // Обновляем индекс
    index.push({ id: newCandidate.id, createdAt: newCandidate.createdAt });
    if (index.length > 500) index = index.slice(-500); // храним только последние 500 ID
    await store.setJSON(indexKey, index);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, candidate: newCandidate })
    };
  } catch (error) {
    console.error('Error in submitCandidate:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};