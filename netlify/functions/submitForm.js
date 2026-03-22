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

    // Извлекаем candidateId, если он передан
    let candidateId = formData.candidateId || null;

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

    // Если contactId не передан — ищем кандидата по телефону в базе контактов
    if (!candidateId) {
      try {
        const candidatesStore = getStore({
          name: 'candidates',
          siteID: process.env.NETLIFY_SITE_ID,
          token: process.env.NETLIFY_ACCESS_TOKEN,
        });
        const allContacts = await candidatesStore.get('_all', { type: 'json' }) || [];
        const normPhone = (formData.phone || '').replace(/\D/g, '');
        if (normPhone.length > 5) {
          const match = allContacts.find(c => (c.phone || '').replace(/\D/g, '') === normPhone);
          if (match) candidateId = match.id;
        }
      } catch (e) {
        console.error('Phone lookup failed:', e);
      }
    }

    // Нормализуем телефон для поиска
    const normPhone = (formData.phone || '').replace(/\D/g, '');
    // Ключ для поиска дубликатов: ФИО + нормализованный телефон + projectId
    const contactKey = `${formData.fullName}_${normPhone}_${formData.projectId}`;

    // Удаляем из auto-хранилища все записи с таким же contactKey (кроме текущей)
    const autoList = await autoStore.list();
    for (const blob of autoList.blobs) {
      if (blob.key.includes('/')) continue; // пропускаем файлы
      const existing = await autoStore.get(blob.key, { type: 'json' });
      if (existing && existing.formData) {
        const existingNormPhone = (existing.formData.phone || '').replace(/\D/g, '');
        const existingKey = `${existing.formData.fullName}_${existingNormPhone}_${existing.formData.projectId}`;
        if (existingKey === contactKey && blob.key !== code) {
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

    // Удаляем из manual-хранилища все записи с таким же contactKey
    const manualList = await manualStore.list();
    for (const blob of manualList.blobs) {
      if (blob.key.includes('/')) continue;
      const existing = await manualStore.get(blob.key, { type: 'json' });
      if (existing) {
        const existingNormPhone = (existing.phone || '').replace(/\D/g, '');
        const existingKey = `${existing.fullName}_${existingNormPhone}_${existing.projectId}`;
        if (existingKey === contactKey) {
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
      recruitmentStatus: 'draft',
      recruiter: formData.recruiter || null,
      contactId: candidateId   // <-- ДОБАВЛЕНО
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