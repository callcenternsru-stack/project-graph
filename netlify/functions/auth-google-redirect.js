const querystring = require('querystring');

exports.handler = async (event) => {
  const state = event.queryStringParameters?.state || 'default';
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:8888/.netlify/functions/auth-google-callback';
  const clientId = process.env.GOOGLE_CLIENT_ID;

  const params = {
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/contacts',
    access_type: 'offline',
    prompt: 'consent',
    state: state,
  };

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${querystring.stringify(params)}`;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html' },
    body: `<a href="${authUrl}">Перейти к авторизации</a><br><code>${authUrl}</code>`
  };
};