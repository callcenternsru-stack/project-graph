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
        break;
      }
    }

    // Сохраняем новую анкету
    const candidateData = {
      formData,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    await store.setJSON(code, candidateData);

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