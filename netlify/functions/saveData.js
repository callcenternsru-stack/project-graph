const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };
    }
    const store = getStore('app-data');
    const newData = JSON.parse(event.body);
    await store.setJSON('appData', newData);
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Данные сохранены' })
    };
  } catch (error) {
    console.error('Error in saveData:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
};