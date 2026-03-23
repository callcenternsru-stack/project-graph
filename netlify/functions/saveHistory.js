// netlify/functions/saveHistory.js
const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { contactId, event: historyEvent } = JSON.parse(event.body);
    if (!contactId || !historyEvent || !historyEvent.type) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing contactId or event' }) };
    }

    const store = getStore({
      name: 'candidate-history',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
    });

    // Читаем существующую историю
    let history = [];
    try {
      history = await store.get(contactId, { type: 'json' }) || [];
    } catch (e) {}

    // Добавляем новое событие
    history.push({
      ...historyEvent,
      timestamp: historyEvent.timestamp || new Date().toISOString(),
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    });

    await store.setJSON(contactId, history);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };
  } catch (error) {
    console.error('Error in saveHistory:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
