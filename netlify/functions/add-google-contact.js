const { google } = require('googleapis');
const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { recruiterId, phoneNumber, fullName } = JSON.parse(event.body);
        if (!recruiterId || !phoneNumber || !fullName) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing fields' }) };
        }

        const store = getStore({
            name: 'google-tokens',
            siteID: process.env.NETLIFY_SITE_ID,
            token: process.env.NETLIFY_ACCESS_TOKEN,
        });
        const tokenData = await store.get(recruiterId, { type: 'json' });
        if (!tokenData || !tokenData.refresh_token) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Google not connected' }) };
        }

        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        const redirectUri = process.env.GOOGLE_REDIRECT_URI;

        const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
        oauth2Client.setCredentials({
            refresh_token: tokenData.refresh_token
        });

        // Создание контакта через People API
        const people = google.people({ version: 'v1', auth: oauth2Client });
        const contact = {
            names: [{ givenName: fullName }],
            phoneNumbers: [{ value: phoneNumber, type: 'mobile' }]
        };
        await people.people.createContact({ requestBody: contact });

        // Формируем ссылку для Telegram (можно улучшить)
        const cleanPhone = phoneNumber.replace(/\D/g, '');
        const telegramUrl = `https://t.me/+${cleanPhone}`; // не всегда работает, но оставим как было

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, chatUrl: telegramUrl })
        };
    } catch (error) {
        console.error('Error in add-google-contact:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};