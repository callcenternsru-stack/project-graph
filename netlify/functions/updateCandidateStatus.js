const { getStore } = require('@netlify/blobs');
const {
  syncRecruiterBetweenContactAndForm,
  updateContactRecruiter,
  appendHistory
} = require('./shared/contactHelper');

// Поля которые синхронизируются между анкетой и базой контактов
const SYNC_FIELDS = [
  { formKey: 'fullName',     contactKey: 'fullName',     label: 'ФИО' },
  { formKey: 'phone',        contactKey: 'phone',        label: 'Телефон' },
  { formKey: 'project',      contactKey: 'project',      label: 'Проект' },
  { formKey: 'country',      contactKey: 'country',      label: 'Страна' },
  { formKey: 'trainingDate', contactKey: 'trainingDate', label: 'Дата обучения' },
  { formKey: 'trainingTime', contactKey: 'trainingTime', label: 'Время обучения' },
];

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body);
    const { id, type, recruitmentStatus, reminderCount, contactId } = body;

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

    // ── Обновляем синхронизируемые поля в анкете если переданы ───────
    const updatedFields = [];
    SYNC_FIELDS.forEach(f => {
      if (body[f.formKey] !== undefined && body[f.formKey] !== (data[f.formKey] || '')) {
        const oldVal = data[f.formKey] || '';
        data[f.formKey] = body[f.formKey];
        updatedFields.push({ label: f.label, old: oldVal, new: body[f.formKey] });
      }
    });

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

        // ── Синхронизируем все поля из анкеты в контакт ──────────────
        SYNC_FIELDS.forEach(f => {
          if (body[f.formKey] !== undefined) {
            candidates[candidateIndex][f.contactKey] = body[f.formKey];
          }
        });

        // ── Синхронизация recruiter ───────────────────────────────────
        const formRecruiter    = data.recruiter || null;
        const contactRecruiter = contact.recruiter || null;
        const recruiterSynced  = syncRecruiterBetweenContactAndForm(contact, formRecruiter);

        if (recruiterSynced && contactRecruiter !== recruiterSynced) {
          candidates[candidateIndex].recruiter = recruiterSynced;
          updateContactRecruiter(resolvedContactId, recruiterSynced).catch(console.error);
        }

        if (recruiterSynced && data.recruiter !== recruiterSynced) {
          data.recruiter = recruiterSynced;
        }

        candidates[candidateIndex].updatedAt = new Date().toISOString();
        await candidatesStore.setJSON('_all', candidates);
      }
    }

    // ── Сохраняем обновлённую анкету ─────────────────────────────────
    await store.setJSON(id, data);

    // ── Пишем историю ─────────────────────────────────────────────────
    if (resolvedContactId) {
      // История смены статуса
      await appendHistory(resolvedContactId, {
        type:      'form_status_changed',
        label:     '🔄 Статус анкеты изменён',
        recruiter: data.recruiter || null,
        details: {
          status:   recruitmentStatus,
          formId:   id,
          formType: type
        }
      });

      // История изменения полей (если что-то менялось)
      if (updatedFields.length > 0) {
        const details = {};
        updatedFields.forEach(f => {
          details['prev_' + f.label] = f.old || '—';
          details[f.label]           = f.new || '—';
        });
        await appendHistory(resolvedContactId, {
          type:      'fields_updated',
          label:     '✏️ Изменено: ' + updatedFields.map(f => f.label).join(', '),
          recruiter: data.recruiter || null,
          details
        });
      }
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
