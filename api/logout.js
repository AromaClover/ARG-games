import { jsonResponse, kv } from './_shared.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return jsonResponse({}, 204);
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);

  const cookies = req.headers.cookie || '';
  let token = null;
  for (const part of cookies.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith('session_token=')) {
      token = trimmed.slice('session_token='.length);
      break;
    }
  }
  if (token) {
    await kv.del(`sess:${token}`);
  }

  return jsonResponse(
    { ok: true },
    200,
    { 'Set-Cookie': 'session_token=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT' }
  );
}
