import { checkSession, jsonResponse } from './_shared.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return jsonResponse({}, 204);
  if (req.method !== 'GET') return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);

  const { user } = await checkSession(req);
  if (!user) return jsonResponse({ ok: false });

  return jsonResponse({ ok: true, user: { username: user.username, email: user.email } });
}
