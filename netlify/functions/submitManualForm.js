const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { formData } = JSON.parse(event.body);
    if (!formData) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing formData' }) };
    }

    const store = getStore({
      name: 'manualForms',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });

    // Получаем список всех ключей в хранилище
    const { blobs } = await store.list();

    // Функция для сравнения двух объектов анкет (без учёта временных меток)
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
      const existing = await store.get(blob.key, { type: 'json' });
      if (existing && isSameCandidate(existing, formData)) {
        // Нашли дубликат – удаляем его
        await store.delete(blob.key);
        console.log(`Deleted duplicate manual form with key ${blob.key}`);
        break;
      }
    }

    // Сохраняем новую анкету
    const key = `manual_${Date.now()}`;
    const record = { ...formData, id: key, submittedAt: new Date().toISOString() };
    await store.setJSON(key, record);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, id: key })
    };
  } catch (error) {
    console.error('Error in submitManualForm:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};