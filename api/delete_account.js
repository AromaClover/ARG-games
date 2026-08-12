import { kv, jsonResponse, readJsonBody, sha256, checkSession } from './_shared.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return jsonResponse({}, 204);
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);

  const { user, token } = await checkSession(req);
  if (!user) return jsonResponse({ ok: false, error: '请先登录' }, 401);

  const data = await readJsonBody(req);
  const password = data.password || '';
  if (!password) return jsonResponse({ ok: false, error: '请输入密码以确认注销' }, 400);

  const userStr = await kv.get(`user:${user.username}`);
  if (!userStr) return jsonResponse({ ok: false, error: '用户不存在' }, 400);
  const userData = typeof userStr === 'string' ? JSON.parse(userStr) : userStr;
  const pwdHash = await sha256(userData.salt + password);
  if (pwdHash !== userData.password_hash) return jsonResponse({ ok: false, error: '密码错误' }, 400);

  await kv.del(`user:${user.username}`);
  await kv.del(`email:${userData.email}`);
  if (token) await kv.del(`sess:${token}`);

  return jsonResponse(
    { ok: true, message: '账号已注销' },
    200,
    { 'Set-Cookie': 'session_token=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT' }
  );
}
