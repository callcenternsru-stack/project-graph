const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const data = JSON.parse(event.body);
    const { code, formData } = data;

    if (!code || !formData) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing code or formData' })
      };
    }

    const store = getStore({
      name: 'candidates-data',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });

    // Получаем список всех ключей в хранилище
    const { blobs } = await store.list();

    // Функция для сравнения двух объектов анкет (без учёта кода и временных меток)
    const isSameCandidate = (a, b) => {
      return a.fullName === b.fullName &&
             a.nickname === b.nickname &&
             a.telegram === b.telegram &&
             a.phone === b.phone &&
             a.email === b.email &&
             a.project === b.project;
    };

    // Перебираем все ключи и ищем дубликат
    for (const blob of blobs) {
      if (blob.key.includes('/')) continue;
      const existing = await store.get(blob.key, { type: 'json' });
      if (existing && existing.formData && isSameCandidate(existing.formData, formData)) {
        await store.delete(blob.key);
        console.log(`Deleted duplicate form with key ${blob.key}`);
        // Также удаляем из индекса
        const index = await store.get('_index', { type: 'json' }) || [];
        const newIndex = index.filter(item => item.code !== blob.key);
        if (newIndex.length !== index.length) {
          await store.setJSON('_index', newIndex);
        }
        break;
      }
    }

    // Сохраняем новую анкету
    const candidateData = {
      formData,
      status: 'pending',
      createdAt: new Date().toISOString(),
      recruitmentStatus: 'draft'  // <-- NEW: инициализация статуса
    };
    await store.setJSON(code, candidateData);

    // Обновляем индекс
    const indexKey = '_index';
    let index = await store.get(indexKey, { type: 'json' }) || [];
    index.push({ code, createdAt: candidateData.createdAt });
    // Оставляем только последние 200 записей (чтобы индекс не рос бесконечно)
    if (index.length > 200) index = index.slice(-200);
    await store.setJSON(indexKey, index);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Candidate saved' })
    };
  } catch (error) {
    console.error('Error in submitForm:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};