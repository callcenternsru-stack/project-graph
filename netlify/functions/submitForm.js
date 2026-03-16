const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const data = JSON.parse(event.body);
    const { code, formData } = data;

    if (!code || !formData) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing code or formData' })
      };
    }

    const autoStore = getStore({
      name: 'candidates-data',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
    });
    const manualStore = getStore({
      name: 'manualForms',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
    });

    // Удаляем все существующие черновики с такими же контактными данными из обоих хранилищ
    const contactKey = `${formData.fullName}_${formData.phone}_${formData.email}_${formData.projectId}`;

    // Удаляем из auto-хранилища (кроме текущего, если обновляем)
    const autoList = await autoStore.list();
    for (const blob of autoList.blobs) {
      if (blob.key.includes('/')) continue;
      const existing = await autoStore.get(blob.key, { type: 'json' });
      if (existing && existing.formData) {
        const key = `${existing.formData.fullName}_${existing.formData.phone}_${existing.formData.email}_${existing.formData.projectId}`;
        if (key === contactKey && blob.key !== code) {
          await autoStore.delete(blob.key);
          console.log(`Deleted auto draft with key ${blob.key}`);
          const index = await autoStore.get('_index', { type: 'json' }) || [];
          const newIndex = index.filter(item => item.code !== blob.key);
          if (newIndex.length !== index.length) {
            await autoStore.setJSON('_index', newIndex);
          }
        }
      }
    }

    // Удаляем из manual-хранилища
    const manualList = await manualStore.list();
    for (const blob of manualList.blobs) {
      if (blob.key.includes('/')) continue;
      const existing = await manualStore.get(blob.key, { type: 'json' });
      if (existing) {
        const key = `${existing.fullName}_${existing.phone}_${existing.email}_${existing.projectId}`;
        if (key === contactKey) {
          await manualStore.delete(blob.key);
          console.log(`Deleted manual draft with key ${blob.key}`);
          const index = await manualStore.get('_index', { type: 'json' }) || [];
          const newIndex = index.filter(item => item.id !== blob.key);
          if (newIndex.length !== index.length) {
            await manualStore.setJSON('_index', newIndex);
          }
        }
      }
    }

    // Сохраняем новую анкету
    const candidateData = {
      formData,
      status: 'pending',
      createdAt: new Date().toISOString(),
      recruitmentStatus: 'draft'
    };
    await autoStore.setJSON(code, candidateData);

    // Обновляем индекс
    const indexKey = '_index';
    let index = await autoStore.get(indexKey, { type: 'json' }) || [];
    index.push({ code, createdAt: candidateData.createdAt });
    if (index.length > 200) index = index.slice(-200);
    await autoStore.setJSON(indexKey, index);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Candidate saved' })
    };
  } catch (error) {
    console.error('Error in submitForm:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};