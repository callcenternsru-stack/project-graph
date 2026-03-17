// netlify/functions/auth-google-redirect.js
const querystring = require('querystring');

exports.handler = async (event) => {
  // Для простоты не передаём state, но в реальном проекте нужно сохранить ID рекрутера
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:8888/.netlify/functions/auth-google-callback';
  const clientId = process.env.GOOGLE_CLIENT_ID;

  const params = {
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/contacts',
    access_type: 'offline',
    prompt: 'consent',
  };

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${querystring.stringify(params)}`;

  return {
    statusCode: 302,
    headers: {
      Location: authUrl,
    },
    body: '',
  };
};