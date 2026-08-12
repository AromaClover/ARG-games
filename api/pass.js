import { kv, jsonResponse, readJsonBody, checkSession } from './_shared.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return jsonResponse({}, 204);
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);

  const { user } = await checkSession(req);
  if (!user) return jsonResponse({ ok: false, error: '请先登录' }, 401);

  const data = await readJsonBody(req);
  const level = String(data.level || '');
  if (!['1','2','3','4','5','6','7'].includes(level)) return jsonResponse({ ok: false, error: 'invalid level' }, 400);

  const key = `level:${level}`;
  const currentVal = await kv.get(key);
  const newVal = (currentVal ? parseInt(String(currentVal), 10) : 0) + 1;
  await kv.set(key, String(newVal));

  return jsonResponse({ ok: true, level: parseInt(level, 10), count: newVal });
}
