import { kv, jsonResponse, readJsonBody, sha256, randomToken, isValidQQEmail, SESSION_TTL } from './_shared.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return jsonResponse({}, 204);
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);

  const data = await readJsonBody(req);
  const username = (data.username || '').trim();
  const password = data.password || '';
  const email = (data.email || '').trim();
  const code = (data.code || '').trim();

  if (!username || !password) return jsonResponse({ ok: false, error: '用户名和密码不能为空' }, 400);
  if (username.length < 2 || username.length > 20) return jsonResponse({ ok: false, error: '用户名长度 2-20' }, 400);
  if (password.length < 3) return jsonResponse({ ok: false, error: '密码至少 3 位' }, 400);
  if (!email) return jsonResponse({ ok: false, error: '请输入邮箱' }, 400);
  if (!isValidQQEmail(email)) return jsonResponse({ ok: false, error: '请输入有效的 QQ 邮箱' }, 400);
  if (!code) return jsonResponse({ ok: false, error: '请输入验证码' }, 400);

  const codeData = await kv.get(`code:${email}`);
  if (!codeData) return jsonResponse({ ok: false, error: '请先发送验证码' }, 400);
  const cd = typeof codeData === 'string' ? JSON.parse(codeData) : codeData;
  const now = Math.floor(Date.now() / 1000);
  if (now > cd.expire_at) { await kv.del(`code:${email}`); return jsonResponse({ ok: false, error: '验证码已过期，请重新发送' }, 400); }
  if (code !== cd.code) return jsonResponse({ ok: false, error: '验证码错误' }, 400);
  await kv.del(`code:${email}`);

  const existingUser = await kv.get(`user:${username}`);
  if (existingUser) return jsonResponse({ ok: false, error: '用户名已存在' }, 400);

  const existingEmailOwner = await kv.get(`email:${email}`);
  if (existingEmailOwner) return jsonResponse({ ok: false, error: '该邮箱已被其他账号绑定' }, 400);

  const salt = randomToken(16);
  const pwdHash = await sha256(salt + password);
  await kv.set(`user:${username}`, JSON.stringify({ password_hash: pwdHash, salt, email }));
  await kv.set(`email:${email}`, username);

  const token = randomToken(24);
  await kv.set(`sess:${token}`, JSON.stringify({ username }), { ex: SESSION_TTL });

  return jsonResponse(
    { ok: true, user: { username, email } },
    200,
    { 'Set-Cookie': `session_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL}` }
  );
}
