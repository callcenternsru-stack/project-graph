const { getStore } = require('@netlify/blobs');
const { appendHistory } = require('./shared/contactHelper');

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
