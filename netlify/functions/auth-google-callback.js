const { getStore } = require('@netlify/blobs');
const fetch = require('node-fetch');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

exports.handler = async (event) => {
  console.log('auth-google-callback invoked');
  const { code, state } = event.queryStringParameters || {};
  console.log('Code received:', !!code);
  console.log('State received:', state);

  if (!code) {
    return { statusCode: 400, body: 'Missing authorization code' };
  }
  if (!state) {
    return { statusCode: 400, body: 'Missing state parameter' };
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    console.error('Missing Google OAuth environment variables');
    return { statusCode: 500, body: 'Server configuration error' };
  }

  try {
    // Обмен кода на токены
    const tokenResponse = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) {
      console.error('Token exchange error:', tokenData);
      return {
        statusCode: 500,
        body: `Failed to exchange code: ${tokenData.error_description || tokenData.error}`,
      };
    }

    const { refresh_token } = tokenData;
    if (!refresh_token) {
      console.error('No refresh token in response');
      return { statusCode: 500, body: 'No refresh token received' };
    }

    // Сохраняем refresh_token в Blob
    const store = getStore({
      name: 'google-tokens',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
    });
    await store.set(state, refresh_token);
    console.log(`Refresh token saved for recruiter: ${state}`);

    // Успешная страница
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `
        <!DOCTYPE html>
        <html>
        <head><title>Успех</title>
        <style>
          body { background: #000; color: #fff; font-family: Arial; text-align: center; padding: 50px; }
          .success { color: #4caf50; }
        </style>
        </head>
        <body>
          <h1 class="success">✅ Интеграция подключена</h1>
          <p>Можете закрыть это окно.</p>
          <script>setTimeout(() => window.close(), 3000);</script>
        </body>
        </html>
      `,
    };
  } catch (error) {
    console.error('Unexpected error:', error);
    return { statusCode: 500, body: `Internal error: ${error.message}` };
  }
};