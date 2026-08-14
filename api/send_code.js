import { kv, jsonResponse, readJsonBody, sha256, randomToken, isValidQQEmail, CODE_TTL, CODE_RESEND_COOLDOWN, checkSession, SESSION_TTL, generateCode } from './_shared.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return jsonResponse({}, 204);
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);

  const data = await readJsonBody(req);
  const email = (data.email || '').trim();
  if (!email) return jsonResponse({ ok: false, error: '请输入邮箱' }, 400);
  if (!isValidQQEmail(email)) return jsonResponse({ ok: false, error: '请输入有效的 QQ 邮箱' }, 400);

  const existing = await kv.get(`code:${email}`);
  if (existing) {
    const ex = typeof existing === 'string' ? JSON.parse(existing) : existing;
    const now = Math.floor(Date.now() / 1000);
    const remaining = CODE_RESEND_COOLDOWN - (now - ex.last_sent);
    if (remaining > 0) return jsonResponse({ ok: false, error: `请 ${remaining} 秒后再发送` }, 429);
  }

  const existingUserByEmail = await kv.get(`email:${email}`);
  if (existingUserByEmail) return jsonResponse({ ok: false, error: '该邮箱已注册，请直接登录' }, 400);

  const code = generateCode();
  const now = Math.floor(Date.now() / 1000);
  const codeData = JSON.stringify({ code, expire_at: now + CODE_TTL, last_sent: now, email });
  await kv.set(`code:${email}`, codeData, { ex: CODE_TTL });
  await kv.set('latest_code', JSON.stringify({ email, code, time: now }), { ex: CODE_TTL });

  const resendKey = process.env.RESEND_API_KEY;
  // Resend 免费计划只能用 onboarding@resend.dev 发邮件（除非验证了自己的域名）
  const senderEmail = process.env.SENDER_EMAIL || 'onboarding@resend.dev';
  let emailResult = { ok: false, error: '邮件服务未配置' };
  if (resendKey) {
    try {
      const sendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: senderEmail, to: [email], subject: '解密闯关 - 邮箱验证码', text: `您好！\n\n您的验证码是：${code}\n\n5 分钟内有效。` })
      });
      const body = await sendRes.text();
      if (sendRes.ok) {
        emailResult = { ok: true };
      } else {
        console.error('Resend API error:', sendRes.status, body);
        emailResult = { ok: false, error: `发送失败(${sendRes.status}): ${body.substring(0, 200)}` };
      }
    } catch (e) {
      console.error('Email send failed:', e);
      emailResult = { ok: false, error: String(e.message || e).substring(0, 200) };
    }
  }

  return jsonResponse({
    ok: true,
    message: '验证码已生成',
    debug_code: code,
    debug_email: email,
    email_sent: emailResult.ok,
    email_error: emailResult.ok ? null : emailResult.error
  });
}
