const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const code = event.queryStringParameters?.code;
  if (!code) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing code parameter' })
    };
  }

  try {
    const store = getStore({
      name: 'candidates-data',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });

    const candidateData = await store.get(code, { type: 'json' });

    if (!candidateData) {
      return {
        statusCode: 200,
        body: JSON.stringify({ valid: false, reason: 'not_found' })
      };
    }

    if (candidateData.status !== 'pending') {
      return {
        statusCode: 200,
        body: JSON.stringify({ valid: false, reason: 'already_processed' })
      };
    }

    // Возвращаем projectId из сохранённых данных кандидата
    const projectId = candidateData.formData?.projectId || null;

    return {
      statusCode: 200,
      body: JSON.stringify({
        valid: true,
        formData: {
          ...candidateData.formData,
          projectId
        }
      })
    };
  } catch (error) {
    console.error('Error in checkCode:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};