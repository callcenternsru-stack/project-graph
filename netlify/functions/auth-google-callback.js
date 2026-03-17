// netlify/functions/auth-google-callback.js
const { getStore } = require('@netlify/blobs');
const fetch = require('node-fetch');

exports.handler = async (event) => {
  const { code, state } = event.queryStringParameters;

  if (!code) {
    return {
      statusCode: 400,
      body: 'Missing code parameter',
    };
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:8888/.netlify/functions/auth-google-callback';

  const tokenUrl = 'https://oauth2.googleapis.com/token';
  const params = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const tokens = await response.json();

    if (!response.ok) {
      throw new Error(tokens.error || 'Failed to exchange code');
    }

    // Здесь нужно получить ID рекрутера из state или сессии.
    // Пока используем фиктивный ID. В реальности вы должны передать его из интерфейса.
    const recruiterId = 'test-recruiter'; // Замените на реальный идентификатор

    const store = getStore({
      name: 'google-tokens',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
    });

    await store.set(recruiterId, tokens.refresh_token);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: '<h1>Авторизация успешна! Теперь вы можете вернуться в панель рекрутера.</h1><script>setTimeout(() => window.close(), 3000);</script>',
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: `Ошибка авторизации: ${error.message}`,
    };
  }
};