const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  try {
    const { code, state } = event.queryStringParameters;
    if (!code) {
      return { statusCode: 400, body: 'Missing code parameter' };
    }

    const recruiterId = state || 'unknown';
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error('Missing Google OAuth environment variables');
    }

    const tokenUrl = 'https://oauth2.googleapis.com/token';
    const params = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const tokens = await response.json();

    if (!response.ok) {
      throw new Error(tokens.error || 'Failed to exchange code');
    }

    const store = getStore({
      name: 'google-tokens',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
    });
    await store.set(recruiterId, tokens.refresh_token);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `
        <h1>Авторизация успешна!</h1>
        <p>Теперь вы можете закрыть это окно и вернуться в панель рекрутера.</p>
        <script>
          if (window.opener) window.opener.location.reload();
          setTimeout(() => window.close(), 3000);
        </script>
      `,
    };
  } catch (error) {
    console.error('Error in auth-google-callback:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/plain' },
      body: `Ошибка: ${error.message}\n\n${error.stack}`,
    };
  }
};