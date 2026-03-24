// netlify/functions/submitManualResults.js
const { getStore } = require('@netlify/blobs');
const Busboy = require('busboy');
const { Readable } = require('stream');
const { findOrCreateContact, appendHistory } = require('./shared/contactHelper');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const contentType = event.headers['content-type'] || '';

    // ── JSON-запрос (из recruiter.html — без файлов) ──────────────────
    if (contentType.includes('application/json')) {
        try {
            const fields = JSON.parse(event.body);
            return await processRecord(fields, {});
        } catch (error) {
            console.error('Error processing JSON request:', error);
            return {
                statusCode: 500,
                body: JSON.stringify({ error: error.message })
            };
        }
    }

    // ── multipart/form-data (из candidate.html — с файлами) ───────────
    if (!contentType.includes('multipart/form-data')) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Expected application/json or multipart/form-data' })
        };
    }

    console.log('submitManualResults invoked, body length:', event.body?.length);

    return new Promise((resolve, reject) => {
        const bb = Busboy({
            headers: { 'content-type': contentType },
            limits: {
                fileSize:  15 * 1024 * 1024,
                fieldSize: 15 * 1024 * 1024,
                fields: 50,
                files:  15
            }
        });

        const fields = {};
        const files  = {};

        bb.on('field', (name, val) => {
            console.log(`Field received: ${name}=${val.substring(0, 50)}...`);
            fields[name] = val;
        });

        bb.on('file', (name, file, info) => {
            const { filename } = info;
            console.log(`File received: ${name}, filename=${filename}`);
            const chunks = [];
            let fileSize = 0;

            file.on('data', (chunk) => {
                chunks.push(chunk);
                fileSize += chunk.length;
                if (fileSize > 15 * 1024 * 1024) {
                    file.destroy(new Error('File too large'));
                }
            });
            file.on('end', () => {
                console.log(`File ${name} ended, total size: ${fileSize}`);
                files[name] = { filename, data: Buffer.concat(chunks) };
            });
            file.on('error', (err) => {
                console.error('File stream error:', err);
            });
        });

        bb.on('finish', async () => {
            try {
                const result = await processRecord(fields, files);
                resolve(result);
            } catch (error) {
                console.error('Error in submitManualResults (multipart):', error);
                resolve({
                    statusCode: error.message.startsWith('Missing required fields') ? 400 : 500,
                    body: JSON.stringify({ error: error.message })
                });
            }
        });

        bb.on('error', (error) => {
            console.error('Busboy error:', error);
            resolve({
                statusCode: 400,
                body: JSON.stringify({ error: error.message })
            });
        });

        try {
            const buffer   = Buffer.from(event.body, 'base64');
            const readable = Readable.from(buffer);
            readable.pipe(bb);
        } catch (err) {
            console.error('Error creating readable stream:', err);
            resolve({
                statusCode: 500,
                body: JSON.stringify({ error: 'Internal server error' })
            });
        }
    });
};

// ══════════════════════════════════════════════════════════════════════
// Основная логика сохранения — общая для JSON и multipart
// ══════════════════════════════════════════════════════════════════════
async function processRecord(fields, files = {}) {
    console.log('All fields keys:', Object.keys(fields));
    console.log('status field value:', fields.status);

    // Для запросов из recruiter.html обязательные поля другие —
    // там нет nickname/email/projectId, но есть fullName/phone/recruiter
    const isRecruiterRequest = !!fields.recruiter;

    if (!isRecruiterRequest) {
        // Полная валидация для candidate.html (с анкетой)
        const requiredFields = ['fullName', 'nickname', 'telegram', 'phone', 'email', 'project', 'projectId'];
        const missing = requiredFields.filter(f => !fields[f]);
        if (missing.length > 0) {
            throw new Error(`Missing required fields: ${missing.join(', ')}`);
        }
    } else {
        // Минимальная валидация для recruiter.html
        const requiredFields = ['fullName', 'phone', 'recruiter'];
        const missing = requiredFields.filter(f => !fields[f]);
        if (missing.length > 0) {
            throw new Error(`Missing required fields: ${missing.join(', ')}`);
        }
    }

    const manualStore = getStore({
        name: 'manualForms',
        siteID:  process.env.NETLIFY_SITE_ID,
        token:   process.env.NETLIFY_ACCESS_TOKEN,
    });

    const autoStore = getStore({
        name: 'candidates-data',
        siteID:  process.env.NETLIFY_SITE_ID,
        token:   process.env.NETLIFY_ACCESS_TOKEN,
    });

    // ── Нормализация телефона для поиска дубликатов ───────────────────
    const normPhone  = (fields.phone || '').replace(/\D/g, '');
    const contactKey = `${fields.fullName}_${normPhone}_${fields.projectId || fields.project}`;

    // ── Удаление дубликатов из авто-анкет ────────────────────────────
    const autoList = await autoStore.list();
    for (const blob of autoList.blobs) {
        if (blob.key.includes('/')) continue;
        const data = await autoStore.get(blob.key, { type: 'json' });
        if (data && data.formData) {
            const dataNormPhone = (data.formData.phone || '').replace(/\D/g, '');
            const key = `${data.formData.fullName}_${dataNormPhone}_${data.formData.projectId}`;
            if (key === contactKey) {
                await autoStore.delete(blob.key);
                console.log(`Deleted auto draft with key ${blob.key}`);
                const index    = await autoStore.get('_index', { type: 'json' }) || [];
                const newIndex = index.filter(item => item.code !== blob.key);
                if (newIndex.length !== index.length) {
                    await autoStore.setJSON('_index', newIndex);
                }
            }
        }
    }

    // ── Удаление дубликатов из ручных анкет (кроме текущей) ──────────
    const manualList = await manualStore.list();
    for (const blob of manualList.blobs) {
        if (blob.key.includes('/')) continue;
        const data = await manualStore.get(blob.key, { type: 'json' });
        if (data) {
            const dataNormPhone = (data.phone || '').replace(/\D/g, '');
            const key = `${data.fullName}_${dataNormPhone}_${data.projectId || data.project}`;
            if (key === contactKey && blob.key !== fields.id) {
                await manualStore.delete(blob.key);
                console.log(`Deleted manual draft with key ${blob.key}`);
                const index    = await manualStore.get('_index', { type: 'json' }) || [];
                const newIndex = index.filter(item => item.id !== blob.key);
                if (newIndex.length !== index.length) {
                    await manualStore.setJSON('_index', newIndex);
                }
            }
        }
    }

    const recordId = fields.id || `manual_${Date.now()}`;
    console.log('Record ID:', recordId);

    // ── Получить существующую запись если есть ────────────────────────
    let existingRecord = null;
    if (fields.id) {
        try {
            existingRecord = await manualStore.get(fields.id, { type: 'json' });
        } catch (e) {}
    }

    // ── Поиск/создание контакта + синхронизация рекрутера ─────────────
    const recruiterFromUrl = fields.recruiter || existingRecord?.recruiter || null;
    let resolvedContactId  = fields.candidateId || existingRecord?.contactId || null;
    let recruiterSynced    = recruiterFromUrl;

    try {
        const formDataForLookup = {
            fullName:    fields.fullName,
            phone:       fields.phone,
            project:     fields.project || fields.projectId,
            projectId:   fields.projectId,
            country:     fields.country,
            candidateId: resolvedContactId,
        };
        const result = await findOrCreateContact(formDataForLookup, recruiterFromUrl);
        if (result.contact) {
            resolvedContactId = result.contact.id;
            recruiterSynced   = result.recruiterSynced;
        }
    } catch (e) {
        console.error('findOrCreateContact failed, continuing without contact:', e);
    }

    // ── Определяем recruitmentStatus ──────────────────────────────────
    let recruitmentStatus;
    if (fields.recruitmentStatus) {
        recruitmentStatus = fields.recruitmentStatus;
    } else if (existingRecord && existingRecord.recruitmentStatus) {
        recruitmentStatus = existingRecord.recruitmentStatus;
    } else {
        recruitmentStatus = 'draft';
    }

    const technicalStatus = fields.status || 'draft';

    // ── Объединяем существующие и новые поля (новые имеют приоритет) ──
    const mergedFields = { ...existingRecord, ...fields };

    const record = {
        id: recordId,
        ...mergedFields,
        submittedAt:       new Date().toISOString(),
        recruitmentStatus,
        status:            technicalStatus,
        contactId:         resolvedContactId,
        recruiter:         recruiterSynced,   // синхронизированный рекрутер
    };

    // ── Сохраняем файлы если есть (только multipart) ──────────────────
    const fileUrls = {};
    for (const [name, fileInfo] of Object.entries(files)) {
        const fileKey = `${recordId}/${fileInfo.filename}`;
        await manualStore.set(fileKey, fileInfo.data);
        fileUrls[name] = `/.netlify/functions/getFile?code=${recordId}&file=${encodeURIComponent(fileInfo.filename)}&type=manual`;
    }
    if (Object.keys(fileUrls).length > 0) {
        record.files = fileUrls;
    }

    await manualStore.setJSON(recordId, record);
    console.log('Record saved:', recordId);

    // ── Фиксируем в истории (единый appendHistory из contactHelper) ───
    if (resolvedContactId) {
        const isDraft     = technicalStatus === 'draft';
        const isCompleted = technicalStatus === 'completed' || recruitmentStatus !== 'draft';

        if (isDraft && !existingRecord) {
            await appendHistory(resolvedContactId, {
                type:  'form_draft',
                label: '📝 Попал в черновики',
                details: {
                    formId:   recordId,
                    formType: 'manual',
                    project:  fields.project,
                    fullName: fields.fullName
                }
            });
        } else if (isCompleted && existingRecord?.status !== 'completed') {
            await appendHistory(resolvedContactId, {
                type:  'form_completed',
                label: '✅ Прошёл проверку (ручная)',
                details: {
                    formId:   recordId,
                    formType: 'manual',
                    status:   recruitmentStatus
                }
            });
        } else if (existingRecord && existingRecord.recruitmentStatus !== recruitmentStatus) {
            await appendHistory(resolvedContactId, {
                type:  'form_status_changed',
                label: '🔄 Статус анкеты изменён',
                details: {
                    status:   recruitmentStatus,
                    formId:   recordId,
                    formType: 'manual'
                }
            });
        }
    }

    // ── Обновляем индекс ──────────────────────────────────────────────
    const indexKey = '_index';
    let index = await manualStore.get(indexKey, { type: 'json' }) || [];
    index = index.filter(item => item.id !== recordId);
    index.push({ id: recordId, submittedAt: record.submittedAt, status: record.status });
    await manualStore.setJSON(indexKey, index);
    console.log('Index updated');

    return {
        statusCode: 200,
        body: JSON.stringify({ success: true, id: recordId })
    };
}
