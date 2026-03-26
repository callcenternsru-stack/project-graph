const { getStore } = require('@netlify/blobs');
const { updateFormRecruiterIfNeeded } = require('./shared/contactHelper');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // ── Автоматические анкеты ─────────────────────────────────────────
    const autoStore = getStore({
      name: 'candidates-data',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
    });
    const autoIndex = (await autoStore.get('_index', { type: 'json' })) || [];
    const autoForms = await Promise.all(
      autoIndex.map(async ({ code }) => {
        try {
          const data = await autoStore.get(code, { type: 'json' });
          if (!data) return null;
          return {
            id: code,
            type: 'auto',
            fullName:          data.formData?.fullName  || '',
            nickname:          data.formData?.nickname  || '',
            telegram:          data.formData?.telegram  || '',
            phone:             data.formData?.phone     || '',
            email:             data.formData?.email     || '',
            project:           data.formData?.project   || '',
            projectId:         data.formData?.projectId || '',
            status:            data.status              || 'pending',
            recruitmentStatus: data.recruitmentStatus   || 'draft',
            reminderCount:     data.reminderCount       || 0,
            recruiter:         data.recruiter           || null,
            contactId:         data.contactId           || null,
            createdAt:         data.createdAt           || data.formData?.timestamp,
            completedAt:       data.completedAt,
            files: data.status === 'completed'
              ? {
                  report:  `/.netlify/functions/getFile?code=${code}&file=report.txt&type=auto`,
                  results: `/.netlify/functions/getFile?code=${code}&file=results.json&type=auto`,
                  voice:   `/.netlify/functions/getFile?code=${code}&file=voice_recording.wav&type=auto`,
                }
              : {},
          };
        } catch (e) {
          return null;
        }
      })
    );

    // ── Ручные анкеты ─────────────────────────────────────────────────
    const manualStore = getStore({
      name: 'manualForms',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
    });
    const manualIndex = (await manualStore.get('_index', { type: 'json' })) || [];
    const manualForms = await Promise.all(
      manualIndex.map(async ({ id }) => {
        try {
          const data = await manualStore.get(id, { type: 'json' });
          if (!data) return null;
          const taskInputs = {};
          const taskScores = {};

          // Ищем в data напрямую (ключи вида task_N_input / task_N_score)
          for (const key in data) {
            if (key.startsWith('task_') && key.endsWith('_input')) {
              taskInputs[key] = data[key];
            }
            if (key.startsWith('task_') && key.endsWith('_score')) {
              try { taskScores[key] = JSON.parse(data[key]); }
              catch { taskScores[key] = data[key]; }
            }
          }

          // Fallback: taskInputs/taskScores могут лежать в data.taskInputs и data.taskScores
          // с числовыми ключами (как отправляет candidate.html)
          if (data.taskInputs && typeof data.taskInputs === 'object') {
            for (const k in data.taskInputs) {
              const normKey = `task_${k}_input`;
              if (!taskInputs[normKey]) taskInputs[normKey] = data.taskInputs[k];
            }
          }
          if (data.taskScores && typeof data.taskScores === 'object') {
            for (const k in data.taskScores) {
              const normKey = `task_${k}_score`;
              if (!taskScores[normKey]) {
                const val = data.taskScores[k];
                taskScores[normKey] = (typeof val === 'string') ? (() => { try { return JSON.parse(val); } catch { return val; } })() : val;
              }
            }
          }
          return {
            id:                data.id,
            type:              'manual',
            fullName:          data.fullName          || '',
            nickname:          data.nickname          || '',
            telegram:          data.telegram          || '',
            phone:             data.phone             || '',
            email:             data.email             || '',
            project:           data.project           || '',
            projectId:         data.projectId         || '',
            status:            data.status            || 'draft',
            recruitmentStatus: data.recruitmentStatus || 'draft',
            reminderCount:     data.reminderCount     || 0,
            recruiter:         data.recruiter         || null,
            contactId:         data.contactId         || null,
            createdAt:         data.submittedAt,
            files:             data.files             || {},
            taskInputs,
            taskScores,
          };
        } catch (e) {
          return null;
        }
      })
    );

    // ── Загружаем всех кандидатов из базы контактов ───────────────────
    const candidatesStore = getStore({
      name: 'candidates',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
    });
    const allContacts = await candidatesStore.get('_all', { type: 'json' }) || [];

    // Индекс по ID и по нормализованному телефону
    const candidatesById    = new Map(allContacts.map(c => [c.id, c]));
    const candidatesByPhone = new Map(
      allContacts
        .filter(c => c.phone)
        .map(c => [(c.phone).replace(/\D/g, ''), c])
    );

    const autoToUpdate   = [];
    const manualToUpdate = [];

    const all = [...autoForms, ...manualForms]
      .filter(f => f !== null)
      .map(f => {
        let contact = null;

        // ── Привязка к контакту ──────────────────────────────────────
        if (f.contactId && candidatesById.has(f.contactId)) {
          contact = candidatesById.get(f.contactId);
        } else {
          const normPhone = (f.phone || '').replace(/\D/g, '');
          if (normPhone.length > 5) {
            contact = candidatesByPhone.get(normPhone) || null;
            if (contact) {
              if (f.type === 'auto') {
                autoToUpdate.push({ code: f.id, contactId: contact.id });
              } else {
                manualToUpdate.push({ id: f.id, contactId: contact.id });
              }
              f.contactId = contact.id;
            }
          }
        }

        if (contact) {
          f.contact = contact;
          if (!f.trainingDate && contact.trainingDate) f.trainingDate = contact.trainingDate;
          if (!f.trainingTime && contact.trainingTime) f.trainingTime = contact.trainingTime;

          // ── Подставляем recruiter из контакта если у анкеты нет ─────
          if (!f.recruiter && contact.recruiter) {
            f.recruiter = contact.recruiter;

            // Фоновое обновление анкеты (не блокируем ответ)
            if (f.type === 'auto') {
              autoToUpdate.find(u => u.code === f.id)
                ? (autoToUpdate.find(u => u.code === f.id).recruiter = contact.recruiter)
                : autoToUpdate.push({ code: f.id, contactId: contact.id, recruiter: contact.recruiter });
            } else {
              manualToUpdate.find(u => u.id === f.id)
                ? (manualToUpdate.find(u => u.id === f.id).recruiter = contact.recruiter)
                : manualToUpdate.push({ id: f.id, contactId: contact.id, recruiter: contact.recruiter });
            }
          }
        }

        return f;
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // ── Фоновые обновления contactId и recruiter (не блокируем ответ) ─
    if (autoToUpdate.length > 0) {
      Promise.all(autoToUpdate.map(async ({ code, contactId, recruiter }) => {
        try {
          const data = await autoStore.get(code, { type: 'json' });
          if (!data) return;
          let changed = false;
          if (!data.contactId) { data.contactId = contactId; changed = true; }
          if (!data.recruiter && recruiter) { data.recruiter = recruiter; changed = true; }
          if (changed) await autoStore.setJSON(code, data);
        } catch (e) {
          console.error(`Failed to update auto ${code}:`, e);
        }
      })).catch(console.error);
    }

    if (manualToUpdate.length > 0) {
      Promise.all(manualToUpdate.map(async ({ id, contactId, recruiter }) => {
        try {
          const data = await manualStore.get(id, { type: 'json' });
          if (!data) return;
          let changed = false;
          if (!data.contactId) { data.contactId = contactId; changed = true; }
          if (!data.recruiter && recruiter) { data.recruiter = recruiter; changed = true; }
          if (changed) await manualStore.setJSON(id, data);
        } catch (e) {
          console.error(`Failed to update manual ${id}:`, e);
        }
      })).catch(console.error);
    }

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
