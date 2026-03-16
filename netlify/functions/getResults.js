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

    // Читаем индекс
    const index = await store.get('_index', { type: 'json' }) || [];
    const MAX_FORMS = 20;
    const recentCodes = index.slice(-MAX_FORMS).map(item => item.code);

    const results = [];
    for (const code of recentCodes) {
      const candidateData = await store.get(code, { type: 'json' });
      if (!candidateData) continue;
      if (candidateData.status === 'completed') {
        const baseUrl = `${event.headers['x-forwarded-proto'] || 'https'}://${event.headers.host}/.netlify/functions/getFile`;
        results.push({
          code,
          formData: candidateData.formData,
          createdAt: candidateData.createdAt,
          completedAt: candidateData.completedAt,
          files: {
            report: baseUrl + `?code=${encodeURIComponent(code)}&file=report.txt`,
            resultsJson: baseUrl + `?code=${encodeURIComponent(code)}&file=results.json`,
            voice: baseUrl + `?code=${encodeURIComponent(code)}&file=voice_recording.wav`
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