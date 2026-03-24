const { getStore } = require('@netlify/blobs');
const { findOrCreateContact } = require('./shared/contactHelper');

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

    // ── Поиск/создание контакта + синхронизация рекрутера ────────────
    const recruiterFromUrl = formData.recruiter || null;
    let contactId     = null;
    let recruiterSynced = recruiterFromUrl;

    try {
      const result = await findOrCreateContact(formData, recruiterFromUrl);
      if (result.contact) {
        contactId       = result.contact.id;
        recruiterSynced = result.recruiterSynced;
      }
    } catch (e) {
      console.error('findOrCreateContact failed, continuing without contact:', e);
    }

    const normPhone  = (formData.phone || '').replace(/\D/g, '');
    const contactKey = `${formData.fullName}_${normPhone}_${formData.projectId}`;

    // ── Удаляем дубликаты из auto-хранилища ──────────────────────────
    const autoList = await autoStore.list();
    for (const blob of autoList.blobs) {
      if (blob.key.includes('/')) continue;
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

    // ── Удаляем дубликаты из manual-хранилища ────────────────────────
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

    // ── Сохраняем анкету с синхронизированным рекрутером ─────────────
    const candidateData = {
      formData,
      status:            'pending',
      createdAt:         new Date().toISOString(),
      recruitmentStatus: 'draft',
      recruiter:         recruiterSynced,   // синхронизированный рекрутер
      contactId:         contactId          // привязка к контакту
    };
    await autoStore.setJSON(code, candidateData);

    // ── Обновляем индекс ──────────────────────────────────────────────
    const indexKey = '_index';
    let index = await autoStore.get(indexKey, { type: 'json' }) || [];
    index.push({ code, createdAt: candidateData.createdAt });
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
