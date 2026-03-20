const { google } = require('googleapis');
const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
    const code = event.queryStringParameters?.code;
    const state = event.queryStringParameters?.state;

    console.log('Callback invoked with code:', code ? 'present' : 'missing', 'state:', state);

    if (!code || !state) {
        return { statusCode: 400, body: 'Missing code or state' };
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    console.log('Using redirectUri:', redirectUri);
    console.log('NETLIFY_SITE_ID:', process.env.NETLIFY_SITE_ID);
    console.log('NETLIFY_ACCESS_TOKEN defined:', !!process.env.NETLIFY_ACCESS_TOKEN);

    try {
        const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
        const { tokens } = await oauth2Client.getToken(code);
        console.log('Tokens obtained:', tokens ? 'yes' : 'no');

        // Создаём хранилище с явным apiURL
        const store = getStore({
            name: 'google-tokens',
            siteID: process.env.NETLIFY_SITE_ID,
            token: process.env.NETLIFY_ACCESS_TOKEN,
            apiURL: 'https://api.netlify.com'
        });

        const key = state;
        let tokenData = {};
        try {
            tokenData = await store.get(key, { type: 'json' });
            if (!tokenData) tokenData = {};
        } catch (err) {
            console.error('Error reading token from store (assuming empty):', err.message);
            tokenData = {};
        }

        tokenData.refresh_token = tokens.refresh_token;
        await store.setJSON(key, tokenData);
        console.log('Token saved for user:', key);

        return {
            statusCode: 302,
            headers: {
                Location: `https://grafic1.netlify.app/recruiter.html?connected=true`
            }
        };
    } catch (error) {
        console.error('Error in auth-google-callback:', error);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};