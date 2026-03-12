const { getStore } = require('@netlify/blobs');

exports.handler = async () => {
  try {
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
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
};