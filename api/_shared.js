// 共享工具函数 - 使用 Vercel Edge Config REST API 替代 KV

const TOTAL_LEVELS = 7;
const SESSION_TTL = 7 * 24 * 3600;
const CODE_TTL = 300;
const CODE_RESEND_COOLDOWN = 60;

// Edge Config 配置（从环境变量获取）
function getEdgeConfig() {
  const id = process.env.EDGE_CONFIG_ID;
  const token = process.env.EDGE_CONFIG_TOKEN;
  const baseUrl = process.env.EDGE_CONFIG_URL;
  return {
    id: id || '',
    token: token || '',
    baseUrl: baseUrl || `https://edge-config.vercel.com/${id}`
  };
}

// 简易内存缓存（用于无环境变量时的回退方案）
const memoryStore = new Map();
const memoryTTL = new Map();

export async function kvGet(key) {
  const cfg = getEdgeConfig();
  if (cfg.token && cfg.id) {
    try {
      const res = await fetch(`${cfg.baseUrl}/item/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${cfg.token}` }
      });
      if (res.ok) {
        const data = await res.json();
        return data;
      }
      return null;
    } catch (e) {
      console.error('Edge Config read error:', e);
    }
  }
  // 回退：内存缓存
  const now = Math.floor(Date.now() / 1000);
  const ttl = memoryTTL.get(key);
  if (ttl && now > ttl) {
    memoryStore.delete(key);
    memoryTTL.delete(key);
    return null;
  }
  return memoryStore.get(key) || null;
}

export async function kvSet(key, value, options = {}) {
  const cfg = getEdgeConfig();
  const val = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (cfg.token && cfg.id) {
    try {
      // Edge Config 通过 PATCH /items 来更新
      const res = await fetch(`${cfg.baseUrl}/items`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          items: [{ operation: 'upsert', key, value: val }]
        })
      });
      if (!res.ok) {
        const text = await res.text();
        console.error('Edge Config write error:', res.status, text);
      }
    } catch (e) {
      console.error('Edge Config write error:', e);
    }
  }
  // 内存缓存同步
  memoryStore.set(key, val);
  if (options.ex) {
    memoryTTL.set(key, Math.floor(Date.now() / 1000) + options.ex);
  }
}

export async function kvDel(key) {
  const cfg = getEdgeConfig();
  if (cfg.token && cfg.id) {
    try {
      const res = await fetch(`${cfg.baseUrl}/items`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          items: [{ operation: 'delete', key }]
        })
      });
      if (!res.ok) {
        const text = await res.text();
        console.error('Edge Config delete error:', res.status, text);
      }
    } catch (e) {
      console.error('Edge Config delete error:', e);
    }
  }
  // 内存缓存同步
  memoryStore.delete(key);
  memoryTTL.delete(key);
}

// 导出 kv 对象，保持和原 API 兼容
export const kv = {
  get: kvGet,
  set: kvSet,
  del: kvDel
};

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Cookie',
  'Access-Control-Expose-Headers': 'Set-Cookie',
  'Content-Type': 'application/json; charset=utf-8'
};

export async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function randomToken(length = 48) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function isValidQQEmail(email) {
  return /^[a-zA-Z0-9._-]+@qq\.com$/i.test(email);
}

export function jsonResponse(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS_HEADERS, ...extraHeaders }
  });
}

export async function readJsonBody(req) {
  try {
    const text = await req.text();
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

export async function checkSession(req) {
  const cookies = req.headers.cookie || '';
  let token = null;
  for (const part of cookies.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith('session_token=')) {
      token = trimmed.slice('session_token='.length);
      break;
    }
  }
  if (!token) return { user: null, token: null };
  const sessionData = await kv.get(`sess:${token}`);
  if (!sessionData) return { user: null, token: null };
  const session = typeof sessionData === 'string' ? JSON.parse(sessionData) : sessionData;
  const userKey = `user:${session.username}`;
  const userStr = await kv.get(userKey);
  if (!userStr) return { user: null, token: null };
  const user = typeof userStr === 'string' ? JSON.parse(userStr) : userStr;
  return { user: { username: session.username, ...user }, token };
}

export { TOTAL_LEVELS, SESSION_TTL, CODE_TTL, CODE_RESEND_COOLDOWN };
