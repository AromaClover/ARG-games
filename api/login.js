import { kv, jsonResponse, readJsonBody, sha256, randomToken, SESSION_TTL } from './_shared.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return jsonResponse({}, 204);
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);

  const data = await readJsonBody(req);
  const username = (data.username || '').trim();
  const password = data.password || '';

  const userStr = await kv.get(`user:${username}`);
  if (!userStr) return jsonResponse({ ok: false, error: '用户名或密码错误' }, 401);
  const user = typeof userStr === 'string' ? JSON.parse(userStr) : userStr;
  const pwdHash = await sha256(user.salt + password);
  if (pwdHash !== user.password_hash) return jsonResponse({ ok: false, error: '用户名或密码错误' }, 401);

  const token = randomToken(24);
  await kv.set(`sess:${token}`, JSON.stringify({ username }), { ex: SESSION_TTL });

  return jsonResponse(
    { ok: true, user: { username, email: user.email } },
    200,
    { 'Set-Cookie': `session_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL}` }
  );
}
