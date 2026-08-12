import { kv, jsonResponse } from './_shared.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return jsonResponse({}, 204);
  if (req.method !== 'GET') return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);

  const latest = await kv.get('latest_code');
  return jsonResponse({ latest: latest || null });
}
