// netlify/functions/getHistory.js
const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const contactId = event.queryStringParameters?.contactId;
  if (!contactId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing contactId' }) };
  }

  try {
    const store = getStore({
      name: 'candidate-history',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
    });

    let history = [];
    try {
      history = await store.get(contactId, { type: 'json' }) || [];
    } catch (e) {}

    // Сортируем по времени
    history.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(history)
    };
  } catch (error) {
    console.error('Error in getHistory:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
