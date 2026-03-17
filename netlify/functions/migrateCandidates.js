const { getStore } = require('@netlify/blobs');

exports.handler = async () => {
  try {
    const store = getStore({
      name: 'candidates',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
    });

    const { blobs } = await store.list();
    const allCandidates = [];
    for (const blob of blobs) {
      if (blob.key === '_all') continue;
      const data = await store.get(blob.key, { type: 'json' });
      if (data) allCandidates.push(data);
    }
    await store.setJSON('_all', allCandidates);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, migrated: allCandidates.length })
    };
  } catch (error) {
    console.error('Migration error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};