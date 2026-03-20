const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
    const recruiterId = event.queryStringParameters?.recruiterId;
    if (!recruiterId) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing recruiterId' }) };
    }

    try {
        const store = getStore({
            name: 'google-tokens',
            siteID: process.env.NETLIFY_SITE_ID,
            token: process.env.NETLIFY_ACCESS_TOKEN,
            apiURL: 'https://api.netlify.com'
        });

        let tokenData = {};
        try {
            tokenData = await store.get(recruiterId, { type: 'json' });
            if (!tokenData) tokenData = {};
        } catch (err) {
            console.error('Error reading token from store (assuming empty):', err.message);
            tokenData = {};
        }

        const connected = !!(tokenData && tokenData.refresh_token);
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connected })
        };
    } catch (error) {
        console.error('Error in get-google-status:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};