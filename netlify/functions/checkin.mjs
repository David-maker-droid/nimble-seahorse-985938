import { getStore } from '@netlify/blobs';

const ADMIN_PIN = process.env.ADMIN_PIN || '2026';
const store = getStore('faithful-toluwanitemi-checkin');

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}

async function seedCodes() {
  const seeded = await store.get('seeded');
  if (seeded) return;
  for (let number = 1; number <= 50; number += 1) {
    const code = `FT-${String(number).padStart(4, '0')}`;
    await store.setJSON(`code:${code}`, {
      code,
      guestName: '',
      admits: 1,
      status: 'unused',
      usedAt: null,
      issuedAt: new Date().toISOString()
    });
  }
  await store.set('seeded', 'true');
}

async function getRecord(code) {
  return store.get(`code:${code}`, { type: 'json' });
}

export default async (request) => {
  await seedCodes();
  const url = new URL(request.url);

  if (request.method === 'GET' && url.searchParams.get('action') === 'list') {
    const records = [];
    for await (const page of store.list({ prefix: 'code:' })) {
      for (const item of page.blobs) {
        const record = await getRecord(item.key.replace('code:', ''));
        if (record) records.push(record);
      }
    }
    records.sort((left, right) => left.code.localeCompare(right.code));
    return json(200, records);
  }

  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });
  const body = await request.json();
  const code = String(body.code || '').trim().toUpperCase();
  const record = await getRecord(code);

  if (body.action === 'checkin') {
    if (!record) return json(200, { status: 'invalid' });
    if (record.status === 'used') return json(200, { status: 'used', data: record });
    record.status = 'used';
    record.usedAt = new Date().toISOString();
    await store.setJSON(`code:${code}`, record);
    return json(200, { status: 'success', data: record });
  }

  if (body.pin !== ADMIN_PIN) return json(401, { error: 'Unauthorized' });
  if (body.action === 'reset' && record) {
    record.status = 'unused';
    record.usedAt = null;
    await store.setJSON(`code:${code}`, record);
    return json(200, record);
  }
  if (body.action === 'issue' && code && body.guestName) {
    const newRecord = {
      code,
      guestName: String(body.guestName).trim(),
      admits: Number(body.admits) || 1,
      status: 'unused',
      usedAt: null,
      issuedAt: new Date().toISOString()
    };
    await store.setJSON(`code:${code}`, newRecord);
    return json(200, newRecord);
  }
  return json(400, { error: 'Invalid request' });
};
