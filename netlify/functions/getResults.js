const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const store = getStore({
      name: 'candidates-data',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });

    // Получаем список всех ключей в хранилище
    const { blobs } = await store.list();

    // Оставляем только те ключи, которые не содержат слеша (это основные записи кандидатов)
    const candidateKeys = blobs
      .map(item => item.key)
      .filter(key => !key.includes('/'));

    const results = [];

    for (const key of candidateKeys) {
      const candidateData = await store.get(key, { type: 'json' });
      if (!candidateData) continue;

      // Если статус completed – формируем объект с данными и ссылками
      if (candidateData.status === 'completed') {
        // Формируем ссылки на скачивание файлов (через функцию getFile)
        // Определяем базовый URL (например, https://ваш-сайт.netlify.app/.netlify/functions/getFile?code=...)
        // В локальном режиме можно использовать относительный путь, но для продакшена лучше полный
        const baseUrl = `${event.headers['x-forwarded-proto'] || 'https'}://${event.headers.host}/.netlify/functions/getFile`;
        const files = {
          report: baseUrl + `?code=${encodeURIComponent(key)}&file=report.txt`,
          resultsJson: baseUrl + `?code=${encodeURIComponent(key)}&file=results.json`,
          voice: baseUrl + `?code=${encodeURIComponent(key)}&file=voice_recording.wav`
        };

        results.push({
          code: key,
          formData: candidateData.formData,
          createdAt: candidateData.createdAt,
          completedAt: candidateData.completedAt,
          files
        });
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(results)
    };
  } catch (error) {
    console.error('Error in getResults:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};