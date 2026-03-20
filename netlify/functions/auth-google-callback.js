const { google } = require('googleapis');
const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
    const code = event.queryStringParameters?.code;
    const state = event.queryStringParameters?.state;

    if (!code || !state) {
        return { statusCode: 400, body: 'Missing code or state' };
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    try {
        const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        const store = getStore({
            name: 'google-tokens',
            siteID: process.env.NETLIFY_SITE_ID,
            token: process.env.NETLIFY_ACCESS_TOKEN,
        });
        const key = state;
        let tokenData = await store.get(key, { type: 'json' }) || {};
        tokenData.refresh_token = tokens.refresh_token;
        await store.setJSON(key, tokenData);

        return {
            statusCode: 302,
            headers: {
                Location: `https://grafic1.netlify.app/recruiter.html?connected=true`
            }
        };
    } catch (error) {
        console.error('Error in auth-google-callback:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};