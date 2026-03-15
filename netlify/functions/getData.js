const { getStore } = require('@netlify/blobs');

exports.handler = async () => {
  console.log('NETLIFY_SITE_ID:', process.env.NETLIFY_SITE_ID);
  console.log('NETLIFY_ACCESS_TOKEN defined:', !!process.env.NETLIFY_ACCESS_TOKEN);

  try {
    const siteID = process.env.NETLIFY_SITE_ID;
    const token = process.env.NETLIFY_ACCESS_TOKEN;

    if (!siteID || !token) {
      throw new Error('Missing siteID or token in environment variables');
    }

    const store = getStore({
      name: 'app-data',
      siteID,
      token,
      apiURL: 'https://api.netlify.com'
    });

    let data = await store.get('appData', { type: 'json' });

    if (!data) {
      data = {
        projects: [],
        monthsByProject: {},
        employees: {},
        employeeData: {},
        entries: {},
        partners: [],
        comments: {},
        // новые поля для рекрутинга
        recruiters: [],
        callResults: [],
        contactTypes: [],
        candidates: []
      };
    } else {
      // Если данные уже есть, но новых полей нет, добавим их с пустыми значениями
      if (!data.recruiters) data.recruiters = [];
      if (!data.callResults) data.callResults = [];
      if (!data.contactTypes) data.contactTypes = [];
      if (!data.candidates) data.candidates = [];
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