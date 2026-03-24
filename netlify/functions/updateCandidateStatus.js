const { getStore } = require('@netlify/blobs');
const {
  syncRecruiterBetweenContactAndForm,
  updateContactRecruiter,
  appendHistory
} = require('./shared/contactHelper');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { id, type, recruitmentStatus, reminderCount, contactId } = JSON.parse(event.body);
    if (!id || !type || !recruitmentStatus) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing fields' }) };
    }

    const storeName = type === 'auto' ? 'candidates-data' : 'manualForms';
    const store = getStore({
      name: storeName,
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
    });

    const data = await store.get(id, { type: 'json' });
    if (!data) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Not found' }) };
    }

    // ── Обновляем статус и contactId в анкете ────────────────────────
    data.recruitmentStatus = recruitmentStatus;
    if (reminderCount !== undefined) data.reminderCount = reminderCount;
    if (contactId !== undefined) data.contactId = contactId;

    const resolvedContactId = contactId || data.contactId || null;

    // ── Синхронизация с базой контактов ──────────────────────────────
    if (resolvedContactId) {
      const candidatesStore = getStore({
        name: 'candidates',
        siteID: process.env.NETLIFY_SITE_ID,
        token: process.env.NETLIFY_ACCESS_TOKEN,
      });
      let candidates = await candidatesStore.get('_all', { type: 'json' }) || [];
      const candidateIndex = candidates.findIndex(c => c.id === resolvedContactId);

      if (candidateIndex !== -1) {
        const contact = candidates[candidateIndex];

        // Синхронизируем callResult
        candidates[candidateIndex].callResult = recruitmentStatus;

        // Синхронизируем reminderCount
        if (reminderCount !== undefined) {
          candidates[candidateIndex].reminderCount = reminderCount;
        } else if (recruitmentStatus !== '__reminder__') {
          candidates[candidateIndex].reminderCount = 0;
        }

        // ── Синхронизация recruiter между анкетой и контактом ─────────
        const formRecruiter    = data.recruiter || null;
        const contactRecruiter = contact.recruiter || null;

        const recruiterSynced = syncRecruiterBetweenContactAndForm(contact, formRecruiter);

        // Обновляем рекрутера в контакте если изменился
        if (recruiterSynced && contactRecruiter !== recruiterSynced) {
          // updateContactRecruiter сам сохраняет в _all и пишет историю,
          // поэтому обновляем локально и вызываем отдельно
          candidates[candidateIndex].recruiter = recruiterSynced;
          // Запускаем логирование смены рекрутера асинхронно
          updateContactRecruiter(resolvedContactId, recruiterSynced).catch(console.error);
        }

        // Обновляем рекрутера в анкете если изменился
        if (recruiterSynced && data.recruiter !== recruiterSynced) {
          data.recruiter = recruiterSynced;
        }

        await candidatesStore.setJSON('_all', candidates);
      }
    }

    // ── Сохраняем обновлённую анкету ─────────────────────────────────
    await store.setJSON(id, data);

    // ── Фиксируем смену статуса в истории ────────────────────────────
    if (resolvedContactId) {
      await appendHistory(resolvedContactId, {
        type:  'form_status_changed',
        label: '🔄 Статус анкеты изменён',
        details: {
          status:   recruitmentStatus,
          formId:   id,
          formType: type
        }
      });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };
  } catch (error) {
    console.error('Error in updateCandidateStatus:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
