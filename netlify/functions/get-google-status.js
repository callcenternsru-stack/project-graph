// netlify/functions/get-google-status.js
const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  const recruiterId = event.queryStringParameters?.recruiterId;
  if (!recruiterId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing recruiterId' }) };
  }
  try {
    const store = getStore({
      name: 'google-tokens',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
    });
    const token = await store.get(recruiterId);
    return {
      statusCode: 200,
      body: JSON.stringify({ connected: !!token }),
    };
  } catch (error) {
    console.error('Error in get-google-status:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};