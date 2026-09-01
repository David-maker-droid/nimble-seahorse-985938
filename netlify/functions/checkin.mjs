import { getStore } from '@netlify/blobs';

const ADMIN_PIN = process.env.ADMIN_PIN || '2026';
const reply = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

async function seedCodes(store) {
  if (await store.get('seeded')) return;
  for (let number = 1; number <= 50; number += 1) {
    const code = 'FT-' + String(number).padStart(4, '0');
    await store.setJSON('code:' + code, {
      code, guestName: '', admits: 1, status: 'unused', usedAt: null,
      issuedAt: new Date().toISOString()
    });
  }
  await store.set('seeded', 'true');
}

async function getRecord(store, code) {
  return store.get('code:' + code, { type: 'json' });
}

export const handler = async (event) => {
  // IMPORTANT: getStore must be created INSIDE the handler, not at module
  // top-level, or production deploys throw MissingBlobsEnvironmentError.
  const store = getStore('faithful-toluwanitemi-checkin');
  await seedCodes(store);

  const params = event.queryStringParameters || {};

  if (event.httpMethod === 'GET' && params.action === 'list') {
    const records = [];
    const page = await store.list({ prefix: 'code:' });
    for (const item of page.blobs) {
      const record = await getRecord(store, item.key.replace('code:', ''));
      if (record) records.push(record);
    }
    records.sort((left, right) => left.code.localeCompare(right.code));
    return reply(200, records);
  }

  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method not allowed' });

  const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body || {});
  const code = String(body.code || '').trim().toUpperCase();

  if (body.action === 'checkin') {
    const record = await getRecord(store, code);
    if (!record) return reply(200, { status: 'invalid' });
    if (record.status === 'used') return reply(200, { status: 'used', data: record });
    record.status = 'used';
    record.usedAt = new Date().toISOString();
    await store.setJSON('code:' + code, record);
    return reply(200, { status: 'success', data: record });
  }

  // Everything below requires the admin PIN
  if (body.pin !== ADMIN_PIN) return reply(401, { error: 'Unauthorized' });

  if (body.action === 'reset' && code) {
    const record = await getRecord(store, code);
    if (record) {
      record.status = 'unused';
      record.usedAt = null;
      await store.setJSON('code:' + code, record);
      return reply(200, record);
    }
    return reply(404, { error: 'Code not found' });
  }

  if (body.action === 'issue' && code && body.guestName) {
    const newRecord = {
      code, guestName: String(body.guestName).trim(),
      admits: Number(body.admits) || 1, status: 'unused', usedAt: null,
      issuedAt: new Date().toISOString()
    };
    await store.setJSON('code:' + code, newRecord);
    return reply(200, newRecord);
  }

  if (body.action === 'delete' && code) {
    await store.delete('code:' + code);
    return reply(200, { deleted: code });
  }

  if (body.action === 'clearAll') {
    const page = await store.list({ prefix: 'code:' });
    for (const item of page.blobs) {
      await store.delete(item.key);
    }
    await store.delete('seeded');
    return reply(200, { cleared: true });
  }

  return reply(400, { error: 'Invalid request' });
};
