const { getStore } = require('@netlify/blobs');
const { appendHistory } = require('./shared/contactHelper');

// Поля которые синхронизируются из базы контактов в анкеты
const SYNC_FIELDS = [
  { key: 'fullName',     label: 'ФИО' },
  { key: 'phone',        label: 'Телефон' },
  { key: 'project',      label: 'Проект' },
  { key: 'country',      label: 'Страна' },
  { key: 'trainingDate', label: 'Дата обучения' },
  { key: 'trainingTime', label: 'Время обучения' },
  { key: 'callResult',   label: 'Статус' },
];

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const candidate = JSON.parse(event.body);
    if (!candidate.fullName || !candidate.phone || !candidate.recruiter) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
    }

    const store = getStore({
      name: 'candidates',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
    });

    // Читаем текущий массив всех кандидатов
    let candidates = await store.get('_all', { type: 'json' }) || [];

    const candidateId = candidate.id || `${candidate.recruiter}_${Date.now()}`;
    const updatedCandidate = {
      ...candidate,
      id: candidateId,
      updatedAt: new Date().toISOString(),
      createdAt: candidate.createdAt || new Date().toISOString()
    };

    // Обновляем существующего или добавляем нового
    const index = candidates.findIndex(c => c.id === candidateId);
    if (index !== -1) {
      const prev = candidates[index];
      candidates[index] = updatedCandidate;

      // Определяем изменённые поля
      const watchFields = [
        { key: 'fullName',     label: 'ФИО' },
        { key: 'phone',        label: 'Телефон' },
        { key: 'project',      label: 'Проект' },
        { key: 'country',      label: 'Страна' },
        { key: 'callResult',   label: 'Статус' },
        { key: 'trainingDate', label: 'Дата обучения' },
        { key: 'trainingTime', label: 'Время обучения' },
        { key: 'comment',      label: 'Комментарий' },
        { key: 'recruiter',    label: 'Рекрутер' }
      ];
      const details = { status: updatedCandidate.callResult };
      const changedFields = [];
      watchFields.forEach(f => {
        const oldVal = (prev[f.key] || '').toString().trim();
        const newVal = (updatedCandidate[f.key] || '').toString().trim();
        if (oldVal !== newVal) {
          details['prev_' + f.key] = oldVal || '—';
          details[f.key] = newVal || '—';
          changedFields.push(f.label);
        }
      });

      const isFirstAction = (!prev.callResult || prev.callResult === '') && updatedCandidate.callResult;
      const isTransfer = changedFields.length === 1 && changedFields[0] === 'Рекрутер';
      let evtType = 'recruiter_action';
      let label = '✏️ Изменение данных';

      if (isFirstAction) {
        evtType = 'first_action';
        label = '🚀 Кандидата взяли в работу';
      } else if (isTransfer) {
        evtType = 'transfer';
        label = '🔀 Передача контакта';
        details.from = prev.recruiter || '—';
        details.to   = updatedCandidate.recruiter || '—';
        details.id   = candidateId;
      } else if (changedFields.length === 1) {
        const lmap = { 'Статус': 'Изменение статуса', 'ФИО': 'Изменение ФИО',
          'Телефон': 'Изменение номера', 'Проект': 'Изменение проекта',
          'Страна': 'Изменение страны', 'Комментарий': 'Добавление комментария',
          'Дата обучения': 'Изменение даты обучения', 'Время обучения': 'Изменение времени обучения' };
        label = '✏️ ' + (lmap[changedFields[0]] || 'Изменение: ' + changedFields[0]);
      } else if (changedFields.length > 1) {
        label = '✏️ Изменено несколько полей: ' + changedFields.join(', ');
      }

      if (changedFields.length > 0 || isFirstAction) {
        await appendHistory(candidateId, { type: evtType, label, recruiter: updatedCandidate.recruiter, details });
      }

      // ── Синхронизация изменённых полей в анкеты ──────────────────────
      const syncableChanged = changedFields.filter(l =>
        SYNC_FIELDS.some(f => f.label === l)
      );

      if (syncableChanged.length > 0) {
        try {
          await syncContactFieldsToForms(candidateId, updatedCandidate, syncableChanged);
        } catch (e) {
          console.error('submitCandidate: syncContactFieldsToForms failed:', e);
        }
      }

    } else {
      candidates.push(updatedCandidate);
      await appendHistory(candidateId, {
        type: 'contact_created',
        label: '📥 Загружен в базу контактов',
        recruiter: updatedCandidate.recruiter,
        details: {
          id:       candidateId,
          fullName: updatedCandidate.fullName,
          phone:    updatedCandidate.phone,
          project:  updatedCandidate.project
        }
      });
    }

    // Сохраняем весь массив обратно
    await store.setJSON('_all', candidates);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, candidate: updatedCandidate })
    };
  } catch (error) {
    console.error('Error in submitCandidate:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};

// ══════════════════════════════════════════════════════════════════════
// Синхронизация полей контакта во все привязанные анкеты
// ══════════════════════════════════════════════════════════════════════
async function syncContactFieldsToForms(contactId, updatedContact, changedLabels) {
  const SYNC_FIELDS = [
    { key: 'fullName',     label: 'ФИО',           formKey: 'fullName' },
    { key: 'phone',        label: 'Телефон',        formKey: 'phone' },
    { key: 'project',      label: 'Проект',         formKey: 'project' },
    { key: 'country',      label: 'Страна',         formKey: 'country' },
    { key: 'trainingDate', label: 'Дата обучения',  formKey: 'trainingDate' },
    { key: 'trainingTime', label: 'Время обучения', formKey: 'trainingTime' },
    { key: 'callResult',   label: 'Статус',         formKey: 'recruitmentStatus' }, // callResult → recruitmentStatus
  ];

  const fieldsToSync = SYNC_FIELDS.filter(f => changedLabels.includes(f.label));
  if (fieldsToSync.length === 0) return;

  // Обновляем ручные анкеты
  const manualStore = getStore({
    name: 'manualForms',
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_ACCESS_TOKEN,
  });

  const { blobs: manualBlobs } = await manualStore.list();
  for (const blob of manualBlobs) {
    if (blob.key.includes('/') || blob.key === '_index') continue;
    const form = await manualStore.get(blob.key, { type: 'json' });
    if (!form || form.contactId !== contactId) continue;

    let changed = false;
    fieldsToSync.forEach(f => {
      const formKey    = f.formKey || f.key;
      const contactVal = updatedContact[f.key];
      if (form[formKey] !== contactVal) {
        form[formKey] = contactVal;
        changed = true;
      }
    });

    if (changed) {
      await manualStore.setJSON(blob.key, form);
      console.log(`syncContactFieldsToForms: updated manualForm ${blob.key}`);
    }
  }

  // Обновляем авто-анкеты
  const autoStore = getStore({
    name: 'candidates-data',
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_ACCESS_TOKEN,
  });

  const autoList = await autoStore.list();
  for (const blob of autoList.blobs) {
    if (blob.key.includes('/') || blob.key === '_index') continue;
    const form = await autoStore.get(blob.key, { type: 'json' });
    if (!form || form.contactId !== contactId) continue;

    let changed = false;
    fieldsToSync.forEach(f => {
      const formKey    = f.formKey || f.key;
      const contactVal = updatedContact[f.key];
      // Авто-анкеты хранят данные в formData
      if (form.formData) {
        if (form.formData[f.key] !== contactVal) {
          form.formData[f.key] = contactVal;
          changed = true;
        }
      }
      // recruitmentStatus всегда на верхнем уровне
      if (form[formKey] !== contactVal) {
        form[formKey] = contactVal;
        changed = true;
      }
    });

    if (changed) {
      await autoStore.setJSON(blob.key, form);
      console.log(`syncContactFieldsToForms: updated autoForm ${blob.key}`);
    }
  }
}
