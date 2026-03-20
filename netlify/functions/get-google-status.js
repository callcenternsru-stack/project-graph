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
        });
        const tokenData = await store.get(recruiterId, { type: 'json' });
        const connected = tokenData && tokenData.refresh_token ? true : false;
        return {
            statusCode: 200,
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