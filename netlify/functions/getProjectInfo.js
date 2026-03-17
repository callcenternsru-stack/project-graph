// netlify/functions/getProjectInfo.js
const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  const projectId = event.queryStringParameters?.projectId;
  if (!projectId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing projectId' }) };
  }
  try {
    const store = getStore({
      name: 'projects',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });
    const projects = await store.get('_all', { type: 'json' }) || [];
    const project = projects.find(p => p.id === projectId);
    if (!project) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Project not found' }) };
    }
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project)
    };
  } catch (error) {
    console.error('Error in getProjectInfo:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};