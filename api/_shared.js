// 共享工具函数 - 使用内存缓存优先，Edge Config 作为持久化层

const TOTAL_LEVELS = 7;
const SESSION_TTL = 7 * 24 * 3600;
const CODE_TTL = 300;
const CODE_RESEND_COOLDOWN = 60;

// 简易内存缓存（主要存储，Serverless 函数内有效）
const memoryStore = new Map();
const memoryTTL = new Map();

// 带超时的 fetch
function fetchWithTimeout(url, options, timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

// Edge Config 配置（从环境变量获取）
function getEdgeConfig() {
  const connStr = process.env.GLOBAL_CONFIG || process.env.EDGE_CONFIG || '';
  if (connStr) {
    try {
      const url = new URL(connStr);
      const id = url.pathname.replace(/^\//, '');
      const token = url.searchParams.get('token') || '';
      if (id && token) {
        return { id, token, baseUrl: `https://edge-config.vercel.com/${id}` };
      }
    } catch (e) {}
  }
  return null;
}

export async function kvGet(key) {
  // 先查内存缓存
  const now = Math.floor(Date.now() / 1000);
  const ttl = memoryTTL.get(key);
  if (ttl && now > ttl) {
    memoryStore.delete(key);
    memoryTTL.delete(key);
  } else if (memoryStore.has(key)) {
    const val = memoryStore.get(key);
    return val;
  }

  // 尝试从 Edge Config 读取
  const cfg = getEdgeConfig();
  if (cfg) {
    try {
      const res = await fetchWithTimeout(`${cfg.baseUrl}/item/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${cfg.token}` }
      }, 3000);
      if (res.ok) {
        const data = await res.json();
        return data;
      }
    } catch (e) {
      // 超时或错误，继续返回 null
    }
  }
  return null;
}

export async function kvSet(key, value, options = {}) {
  const val = typeof value === 'object' ? JSON.stringify(value) : String(value);

  // 先写入内存缓存
  memoryStore.set(key, val);
  if (options.ex) {
    memoryTTL.set(key, Math.floor(Date.now() / 1000) + options.ex);
  }

  // 异步写入 Edge Config（不等待，避免阻塞响应）
  const cfg = getEdgeConfig();
  if (cfg) {
    fetchWithTimeout(`${cfg.baseUrl}/items`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        items: [{ operation: 'upsert', key, value: val }]
      })
    }, 3000).catch(() => {});
  }
}

export async function kvDel(key) {
  memoryStore.delete(key);
  memoryTTL.delete(key);

  const cfg = getEdgeConfig();
  if (cfg) {
    fetchWithTimeout(`${cfg.baseUrl}/items`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        items: [{ operation: 'delete', key }]
      })
    }, 3000).catch(() => {});
  }
}

// 导出 kv 对象
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
