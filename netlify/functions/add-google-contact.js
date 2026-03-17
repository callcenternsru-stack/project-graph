// netlify/functions/add-google-contact.js
const { getStore } = require('@netlify/blobs');
const { google } = require('googleapis');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { recruiterId, phoneNumber, fullName } = JSON.parse(event.body);

  if (!recruiterId || !phoneNumber || !fullName) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing required fields' }),
    };
  }

  try {
    const store = getStore({
      name: 'google-tokens',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
    });
    const refreshToken = await store.get(recruiterId);

    if (!refreshToken) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Recruiter not authorized' }),
      };
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    const people = google.people({ version: 'v1', auth: oauth2Client });

    const contact = {
      names: [{ givenName: fullName }],
      phoneNumbers: [{ value: phoneNumber, type: 'mobile' }],
    };

    await people.people.createContact({
      requestBody: contact,
    });

    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const chatUrl = `https://t.me/${cleanPhone}`;

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, chatUrl }),
    };
  } catch (error) {
    console.error('Error adding contact:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};