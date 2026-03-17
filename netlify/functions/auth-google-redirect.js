const querystring = require('querystring');

exports.handler = async (event) => {
  console.log('auth-google-redirect invoked');
  console.log('Query params:', event.queryStringParameters);
  const state = event.queryStringParameters?.state || 'default';
  console.log('State:', state);
  
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  
  console.log('Redirect URI defined:', !!redirectUri);
  console.log('Client ID defined:', !!clientId);
  
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
  console.log('Generated auth URL:', authUrl);

  return {
    statusCode: 302,
    headers: {
      Location: authUrl,
    },
  };
};