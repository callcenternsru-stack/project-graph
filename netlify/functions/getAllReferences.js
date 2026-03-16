const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const stores = {
      recruiters: getStore({ name: 'recruiters', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_ACCESS_TOKEN }),
      callResults: getStore({ name: 'callResults', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_ACCESS_TOKEN }),
      contactTypes: getStore({ name: 'contactTypes', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_ACCESS_TOKEN }),
      projects: getStore({ name: 'projects', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_ACCESS_TOKEN }),
      scripts: getStore({ name: 'scripts', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_ACCESS_TOKEN })
    };

    // Загружаем все массивы параллельно
    const [recruiters, callResults, contactTypes, projects, scripts] = await Promise.all([
      stores.recruiters.get('_all', { type: 'json' }).catch(() => []),
      stores.callResults.get('_all', { type: 'json' }).catch(() => []),
      stores.contactTypes.get('_all', { type: 'json' }).catch(() => []),
      stores.projects.get('_all', { type: 'json' }).catch(() => []),
      stores.scripts.get('_all', { type: 'json' }).catch(() => [])
    ]);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300' // 5 минут
      },
      body: JSON.stringify({
        recruiters,
        callResults,
        contactTypes,
        projects,
        scripts
      })
    };
  } catch (error) {
    console.error('Error in getAllReferences:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};