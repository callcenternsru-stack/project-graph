const { getStore } = require('@netlify/blobs');

exports.handler = async () => {
console.log('NETLIFY_SITE_ID:', process.env.NETLIFY_SITE_ID);
console.log('NETLIFY_ACCESS_TOKEN:', process.env.NETLIFY_ACCESS_TOKEN ? 'defined' : 'undefined');
  try {
    // Просто вызываем getStore без параметров – библиотека сама найдёт NETLIFY_SITE_ID и NETLIFY_ACCESS_TOKEN
    const store = getStore('app-data');
    let data = await store.get('appData', { type: 'json' });
    if (!data) {
      data = {
        projects: [],
        monthsByProject: {},
        employees: {},
        employeeData: {},
        entries: {},
        partners: [],
        comments: {}
      };
    }
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, data })
    };
  } catch (error) {
    console.error('Error in getData:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
};