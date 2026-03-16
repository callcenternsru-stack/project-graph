const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // 1. Автоматические анкеты (candidates-data)
    const autoStore = getStore({
      name: 'candidates-data',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
    });
    const autoIndex = (await autoStore.get('_index', { type: 'json' })) || [];
    const autoForms = await Promise.all(
      autoIndex.slice(-200).map(async ({ code }) => {
        try {
          const data = await autoStore.get(code, { type: 'json' });
          if (!data) return null;
          return {
            id: code,
            type: 'auto',
            fullName: data.formData?.fullName || '',
            nickname: data.formData?.nickname || '',
            telegram: data.formData?.telegram || '',
            phone: data.formData?.phone || '',
            email: data.formData?.email || '',
            project: data.formData?.project || '',
            projectId: data.formData?.projectId || '',
            status: data.status || 'pending',          // технический статус (pending/completed)
            recruitmentStatus: data.recruitmentStatus || 'draft', // наш новый статус
            createdAt: data.createdAt || data.formData?.timestamp,
            completedAt: data.completedAt,
            files: data.status === 'completed'
              ? {
                  report: `/.netlify/functions/getFile?code=${code}&file=report.txt`,
                  results: `/.netlify/functions/getFile?code=${code}&file=results.json`,
                  voice: `/.netlify/functions/getFile?code=${code}&file=voice_recording.wav`,
                }
              : {},
          };
        } catch (e) {
          return null;
        }
      })
    );

    // 2. Ручные анкеты (manualForms)
    const manualStore = getStore({
      name: 'manualForms',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
    });
    const manualIndex = (await manualStore.get('_index', { type: 'json' })) || [];
    const manualForms = await Promise.all(
      manualIndex.slice(-200).map(async ({ id }) => {
        try {
          const data = await manualStore.get(id, { type: 'json' });
          if (!data) return null;
          return {
            id: data.id,
            type: 'manual',
            fullName: data.fullName || '',
            nickname: data.nickname || '',
            telegram: data.telegram || '',
            phone: data.phone || '',
            email: data.email || '',
            project: data.project || '',
            projectId: data.projectId || '',
            status: data.status || 'draft',
            recruitmentStatus: data.recruitmentStatus || 'draft',
            createdAt: data.submittedAt,
            files: data.files || {}, // объект со ссылками на загруженные файлы
          };
        } catch (e) {
          return null;
        }
      })
    );

    // 3. Объединение и сортировка (новые сверху)
    const all = [...autoForms, ...manualForms]
      .filter(f => f !== null)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
      },
      body: JSON.stringify(all),
    };
  } catch (error) {
    console.error('Error in getAllCandidates:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};