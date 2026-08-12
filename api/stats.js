import { kv, jsonResponse, TOTAL_LEVELS } from './_shared.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return jsonResponse({}, 204);
  if (req.method !== 'GET') return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);

  const stats = {};
  for (let i = 1; i <= TOTAL_LEVELS; i++) {
    const val = await kv.get(`level:${i}`);
    stats[String(i)] = val ? parseInt(String(val), 10) : 0;
  }

  return jsonResponse(stats);
}
