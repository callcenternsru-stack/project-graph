const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const { name, id } = JSON.parse(event.body);
    if (!name) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Name required' }) };
    }
    const store = getStore({
      name: 'projects',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });

    let projects = await store.get('_all', { type: 'json' }) || [];
    // Если id не передан, генерируем новый ключ (PROJ-XXXX-XXXX)
    const projectId = id || generateProjectKey();
    const newProject = { id: projectId, name, updatedAt: new Date().toISOString() };

    if (id) {
      // обновление: ищем по id
      const index = projects.findIndex(p => p.id === id);
      if (index !== -1) {
        projects[index] = newProject;
      } else {
        projects.push(newProject);
      }
    } else {
      projects.push(newProject);
    }

    await store.setJSON('_all', projects);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, project: newProject })
    };
  } catch (error) {
    console.error('Error in saveProject:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};

// Вспомогательная функция генерации ключа проекта
function generateProjectKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let part1 = '', part2 = '';
  for (let i = 0; i < 4; i++) {
    part1 += chars.charAt(Math.floor(Math.random() * chars.length));
    part2 += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `PROJ-${part1}-${part2}`;
}