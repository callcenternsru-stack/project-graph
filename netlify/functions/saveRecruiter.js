const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const { name, password, phone, email, id } = JSON.parse(event.body);
    if (!name) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Name required' }) };
    }
    const store = getStore({
      name: 'recruiters',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });

    // Читаем текущий массив
    let recruiters = await store.get('_all', { type: 'json' }) || [];

    const newRecruiter = { name, password, phone, email, updatedAt: new Date().toISOString() };

    if (id) {
      // обновление: ищем по имени (id === старое имя)
      const index = recruiters.findIndex(r => r.name === id);
      if (index !== -1) {
        recruiters[index] = newRecruiter;
      } else {
        // если не нашли, добавляем
        recruiters.push(newRecruiter);
      }
    } else {
      // добавление нового
      recruiters.push(newRecruiter);
    }

    await store.setJSON('_all', recruiters);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, recruiter: newRecruiter })
    };
  } catch (error) {
    console.error('Error in saveRecruiter:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};