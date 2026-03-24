// netlify/functions/shared/contactHelper.js
// Централизованный модуль для работы с контактами и синхронизации рекрутера

const { getStore } = require('@netlify/blobs');

// ══════════════════════════════════════════════════════════════════════
// Вспомогательная функция: нормализация телефона
// ══════════════════════════════════════════════════════════════════════
function normalizePhone(phone) {
  return (phone || '').replace(/\D/g, '');
}

// ══════════════════════════════════════════════════════════════════════
// getCandidatesStore — получить хранилище контактов
// ══════════════════════════════════════════════════════════════════════
function getCandidatesStore() {
  return getStore({
    name: 'candidates',
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_ACCESS_TOKEN,
  });
}

// ══════════════════════════════════════════════════════════════════════
// appendHistory — единая функция записи истории (заменяет все копии)
// ══════════════════════════════════════════════════════════════════════
async function appendHistory(contactId, event) {
  if (!contactId) return;
  try {
    const store = getStore({
      name: 'candidate-history',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN,
    });
    let history = [];
    try {
      history = await store.get(contactId, { type: 'json' }) || [];
    } catch (e) {}
    history.push({
      ...event,
      timestamp: event.timestamp || new Date().toISOString(),
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    });
    await store.setJSON(contactId, history);
  } catch (e) {
    console.error('appendHistory error:', e);
  }
}

// ══════════════════════════════════════════════════════════════════════
// syncRecruiterBetweenContactAndForm
//
// Приоритет:
//   1. recruiterFromUrl (из параметра URL анкеты) — наивысший приоритет
//   2. recruiter контакта — если в анкете нет
//   3. null — если ни у кого нет
//
// Возвращает итоговый recruiter (строка или null)
// ══════════════════════════════════════════════════════════════════════
function syncRecruiterBetweenContactAndForm(contact, formRecruiter) {
  const contactRecruiter = contact?.recruiter || null;

  if (formRecruiter) {
    // URL-параметр имеет наивысший приоритет
    return formRecruiter;
  }
  if (contactRecruiter) {
    // Копируем из контакта
    return contactRecruiter;
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════
// createContactFromData — создать новый контакт в хранилище candidates
// ══════════════════════════════════════════════════════════════════════
async function createContactFromData({ fullName, phone, project, recruiter, country }) {
  const store = getCandidatesStore();
  let allContacts = [];
  try {
    allContacts = await store.get('_all', { type: 'json' }) || [];
  } catch (e) {}

  // Защита от дублей: проверяем по нормализованному телефону
  const normPhone = normalizePhone(phone);
  if (normPhone.length > 5) {
    const existing = allContacts.find(c => normalizePhone(c.phone) === normPhone);
    if (existing) {
      console.log(`createContactFromData: contact already exists for phone ${normPhone}, id=${existing.id}`);
      return existing;
    }
  }

  const newContact = {
    id:        `contact_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    fullName:  fullName  || '',
    phone:     phone     || '',
    project:   project   || '',
    recruiter: recruiter || null,
    country:   country   || '',
    createdAt: new Date().toISOString(),
    callResult: '',
  };

  allContacts.push(newContact);
  await store.setJSON('_all', allContacts);

  console.log(`createContactFromData: created new contact id=${newContact.id} for phone ${normPhone}`);
  return newContact;
}

// ══════════════════════════════════════════════════════════════════════
// updateContactRecruiter — обновить рекрутера у существующего контакта
// ══════════════════════════════════════════════════════════════════════
async function updateContactRecruiter(contactId, newRecruiter) {
  if (!contactId || !newRecruiter) return;
  try {
    const store = getCandidatesStore();
    const allContacts = await store.get('_all', { type: 'json' }) || [];
    const idx = allContacts.findIndex(c => c.id === contactId);
    if (idx === -1) return;

    const oldRecruiter = allContacts[idx].recruiter;
    if (oldRecruiter === newRecruiter) return; // уже актуально

    allContacts[idx].recruiter = newRecruiter;
    await store.setJSON('_all', allContacts);

    // Логируем смену рекрутера в историю
    await appendHistory(contactId, {
      type:  'recruiter_changed',
      label: '👤 Рекрутер изменён',
      details: {
        from: oldRecruiter || '—',
        to:   newRecruiter
      }
    });

    console.log(`updateContactRecruiter: contact ${contactId} recruiter ${oldRecruiter} → ${newRecruiter}`);
  } catch (e) {
    console.error('updateContactRecruiter error:', e);
  }
}

// ══════════════════════════════════════════════════════════════════════
// updateFormRecruiterIfNeeded — фоновое обновление recruiter в анкете
// (не блокирует основной ответ)
// ══════════════════════════════════════════════════════════════════════
async function updateFormRecruiterIfNeeded(store, formId, recruiter) {
  if (!formId || !recruiter) return;
  try {
    const data = await store.get(formId, { type: 'json' });
    if (data && !data.recruiter) {
      data.recruiter = recruiter;
      await store.setJSON(formId, data);
      console.log(`updateFormRecruiterIfNeeded: set recruiter=${recruiter} for form ${formId}`);
    }
  } catch (e) {
    console.error('updateFormRecruiterIfNeeded error:', e);
  }
}

// ══════════════════════════════════════════════════════════════════════
// findOrCreateContact
//
// Ищет контакт:
//   1. По candidateId (из URL)
//   2. По нормализованному телефону
//
// Если не найден — создаёт новый.
// Синхронизирует recruiter между контактом и анкетой.
//
// Возвращает: { contact, recruiterSynced }
// ══════════════════════════════════════════════════════════════════════
async function findOrCreateContact(formData, recruiterFromUrl) {
  const store = getCandidatesStore();
  let allContacts = [];
  try {
    allContacts = await store.get('_all', { type: 'json' }) || [];
  } catch (e) {
    console.error('findOrCreateContact: failed to load contacts:', e);
  }

  let contact = null;

  // 1. Поиск по candidateId
  const candidateId = formData.candidateId || formData.contactId || null;
  if (candidateId) {
    contact = allContacts.find(c => c.id === candidateId) || null;
    if (contact) {
      console.log(`findOrCreateContact: found by candidateId=${candidateId}`);
    }
  }

  // 2. Поиск по телефону
  if (!contact) {
    const normPhone = normalizePhone(formData.phone);
    if (normPhone.length > 5) {
      contact = allContacts.find(c => normalizePhone(c.phone) === normPhone) || null;
      if (contact) {
        console.log(`findOrCreateContact: found by phone=${normPhone}, id=${contact.id}`);
      }
    }
  }

  // 3. Создаём новый контакт если не найден
  if (!contact) {
    try {
      contact = await createContactFromData({
        fullName:  formData.fullName  || '',
        phone:     formData.phone     || '',
        project:   formData.project   || formData.projectId || '',
        recruiter: recruiterFromUrl   || null,
        country:   formData.country   || '',
      });

      if (recruiterFromUrl) {
        await appendHistory(contact.id, {
          type:  'contact_created',
          label: '🆕 Контакт создан',
          details: {
            fullName:  formData.fullName || '',
            phone:     formData.phone    || '',
            recruiter: recruiterFromUrl
          }
        });
      }
    } catch (e) {
      console.error('findOrCreateContact: failed to create contact:', e);
      // Не прерываем сохранение анкеты при ошибке создания контакта
      return { contact: null, recruiterSynced: recruiterFromUrl || null };
    }
  }

  // Синхронизируем рекрутера
  const recruiterSynced = syncRecruiterBetweenContactAndForm(contact, recruiterFromUrl);

  // Если итоговый рекрутер отличается от текущего в контакте — обновляем контакт
  if (recruiterSynced && contact.recruiter !== recruiterSynced) {
    await updateContactRecruiter(contact.id, recruiterSynced);
    contact = { ...contact, recruiter: recruiterSynced };
  }

  return { contact, recruiterSynced };
}

// ══════════════════════════════════════════════════════════════════════
// Экспорт
// ══════════════════════════════════════════════════════════════════════
module.exports = {
  findOrCreateContact,
  syncRecruiterBetweenContactAndForm,
  createContactFromData,
  updateContactRecruiter,
  updateFormRecruiterIfNeeded,
  appendHistory,
  normalizePhone,
};
