const querystring = require('querystring');

exports.handler = async (event) => {
    const state = event.queryStringParameters?.state;
    if (!state) {
        return { statusCode: 400, body: 'Missing state parameter' };
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    const scope = 'https://www.googleapis.com/auth/contacts';

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${querystring.stringify({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: scope,
        access_type: 'offline',
        prompt: 'consent',
        state: state
    })}`;

    return {
        statusCode: 302,
        headers: { Location: authUrl }
    };
};