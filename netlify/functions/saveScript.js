const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const body = JSON.parse(event.body);
    const { projectIds, projectNames, title, content, id, statuses, type } = body;

    if (!title || !content) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields: title, content' }) };
    }

    // Поддержка старого формата (один проект) и нового (массивы)
    let finalProjectIds = projectIds;
    let finalProjectNames = projectNames;

    if (!finalProjectIds && body.projectId) {
      finalProjectIds = [body.projectId];
      finalProjectNames = [body.projectName || body.projectId];
    }

    if (!finalProjectIds || finalProjectIds.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'At least one project is required' }) };
    }

    const store = getStore({
      name: 'scripts',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
    });

    let scripts = await store.get('_all', { type: 'json' }) || [];

    const newScript = {
      projectIds: finalProjectIds,
      projectNames: finalProjectNames,
      title,
      content,
      statuses: statuses || [],
      type: type || 'call', // по умолчанию 'call'
      updatedAt: new Date().toISOString()
    };

    if (id) {
      // обновление: ищем по старому title (id === старый title)
      const index = scripts.findIndex(s => s.title === id);
      if (index !== -1) {
        scripts[index] = newScript;
      } else {
        scripts.push(newScript);
      }
    } else {
      scripts.push(newScript);
    }

    await store.setJSON('_all', scripts);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, script: newScript })
    };
  } catch (error) {
    console.error('Error in saveScript:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};