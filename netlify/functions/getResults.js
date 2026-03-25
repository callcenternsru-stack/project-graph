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

    // Читаем индекс (все записи без лимита)
    const index = await store.get('_index', { type: 'json' }) || [];
    const allCodes = index.map(item => item.code);

    // Загружаем данные параллельно
    const candidatesData = await Promise.all(
      allCodes.map(async (code) => {
        try {
          return await store.get(code, { type: 'json' });
        } catch (e) {
          console.error(`Error loading code ${code}:`, e);
          return null;
        }
      })
    );

    const baseUrl = `${event.headers['x-forwarded-proto'] || 'https'}://${event.headers.host}/.netlify/functions/getFile`;
    const results = [];

    for (let i = 0; i < allCodes.length; i++) {
      const code = allCodes[i];
      const candidateData = candidatesData[i];
      if (!candidateData) continue;
      if (candidateData.status === 'completed') {
        results.push({
          code,
          formData: candidateData.formData,
          createdAt: candidateData.createdAt,
          completedAt: candidateData.completedAt,
          files: {
            report:      baseUrl + `?code=${encodeURIComponent(code)}&file=report.txt&type=auto`,
            results: baseUrl + `?code=${encodeURIComponent(code)}&file=results.json&type=auto`,
            voice:       baseUrl + `?code=${encodeURIComponent(code)}&file=voice_recording.wav&type=auto`
          }
        });
      }
    }

    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60'
      },
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
