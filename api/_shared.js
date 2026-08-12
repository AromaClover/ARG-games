// 共享工具函数
import { kv } from '@vercel/kv';

const TOTAL_LEVELS = 7;
const SESSION_TTL = 7 * 24 * 3600;
const CODE_TTL = 300;
const CODE_RESEND_COOLDOWN = 60;

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
  const userKey = `user:${sessionData.username}`;
  const userStr = await kv.get(userKey);
  if (!userStr) return { user: null, token: null };
  const user = typeof userStr === 'string' ? JSON.parse(userStr) : userStr;
  return { user: { username: sessionData.username, ...user }, token };
}

export { TOTAL_LEVELS, SESSION_TTL, CODE_TTL, CODE_RESEND_COOLDOWN, kv };
