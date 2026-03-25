const { getStore } = require('@netlify/blobs');
const { findOrCreateContact, appendHistory } = require('./shared/contactHelper');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body);

    // Поддерживаем оба формата: { formData } и плоский объект
    const formData      = body.formData || body;
    const recruiterUrl  = body.recruiter || formData.recruiter || null;

    if (!formData || !formData.phone) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing formData' }) };
    }

    const store = getStore({
      name: 'manualForms',
      siteID: process.env.NETLIFY_SITE_ID,
      token:  process.env.NETLIFY_ACCESS_TOKEN,
      apiURL: 'https://api.netlify.com'
    });

    // ── Удаление дубликатов (оригинальная логика) ────────────────────
    const isSameCandidate = (a, b) =>
      a.fullName === b.fullName &&
      a.nickname === b.nickname &&
      a.telegram === b.telegram &&
      a.phone    === b.phone    &&
      a.email    === b.email    &&
      a.project  === b.project;

    const { blobs } = await store.list();
    for (const blob of blobs) {
      const existing = await store.get(blob.key, { type: 'json' });
      if (existing && isSameCandidate(existing, formData)) {
        await store.delete(blob.key);
        console.log(`Deleted duplicate manual form with key ${blob.key}`);
        break;
      }
    }

    // ── Привязка к контакту по candidateId из URL или телефону ────────
    let resolvedContactId = formData.candidateId || null;
    let recruiterSynced   = recruiterUrl;

    try {
      const result = await findOrCreateContact(
        {
          fullName:    formData.fullName    || '',
          phone:       formData.phone       || '',
          project:     formData.project     || '',
          country:     formData.country     || '',
          candidateId: resolvedContactId,   // приоритет — ID из URL
        },
        recruiterUrl
      );
      if (result.contact) {
        resolvedContactId = result.contact.id;
        recruiterSynced   = result.recruiterSynced || recruiterUrl;
        console.log('submitManualForm: contactId resolved =', resolvedContactId);
      }
    } catch (e) {
      console.error('submitManualForm: findOrCreateContact failed:', e);
      // Не блокируем создание черновика при ошибке поиска контакта
    }

    // ── Сохраняем черновик с contactId ───────────────────────────────
    const key    = `manual_${Date.now()}`;
    const record = {
      ...formData,
      id:          key,
      submittedAt: new Date().toISOString(),
      contactId:   resolvedContactId || null,
      recruiter:   recruiterSynced   || formData.recruiter || null,
    };

    await store.setJSON(key, record);
    console.log('submitManualForm: saved record', key, '| contactId:', record.contactId);

    // ── Пишем историю в контакт ──────────────────────────────────────
    if (record.contactId) {
      try {
        await appendHistory(record.contactId, {
          type:      'form_draft',
          label:     '📝 Попал в черновики',
          recruiter: recruiterSynced || null,
          details: {
            formId:   key,
            formType: 'manual',
            project:  formData.project  || '',
            fullName: formData.fullName || '',
          }
        });
      } catch (e) {
        console.error('submitManualForm: appendHistory failed:', e);
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, id: key, contactId: record.contactId })
    };
  } catch (error) {
    console.error('Error in submitManualForm:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
