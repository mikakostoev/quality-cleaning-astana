import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE = 'qc_admin';
const WEEK = 7 * 24 * 60 * 60;

function loginName() {
  const raw = process.env.ADMIN_LOGIN;
  if (typeof raw !== 'string') return '';
  return raw.trim();
}

export function isConfigured() {
  const password = process.env.ADMIN_PASSWORD;
  const login = loginName();
  if (typeof password !== 'string') return false;
  const passwordLength = [...password].length;
  const loginLength = [...login].length;
  if (passwordLength < 8 || passwordLength > 200) return false;
  if (loginLength < 1 || loginLength > 80) return false;
  if (/[\u0000-\u001f<>]/.test(login)) return false;
  return true;
}

function sameSecret(input, expected) {
  const left = createHmac('sha256', 'qc-login').update(String(input ?? '')).digest();
  const right = createHmac('sha256', 'qc-login').update(String(expected ?? '')).digest();
  return timingSafeEqual(left, right);
}

export function checkCredentials(login, password) {
  if (!isConfigured()) return false;
  const loginOk = sameSecret(String(login ?? '').trim(), loginName());
  const passwordOk = sameSecret(password, process.env.ADMIN_PASSWORD);
  return loginOk && passwordOk;
}

function sessionKey() {
  return createHmac('sha256', 'qc-session').update(loginName()).update('\0').update(process.env.ADMIN_PASSWORD).digest();
}

export function signSession(now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ exp: now + WEEK * 1000 })).toString('base64url');
  const sig = createHmac('sha256', sessionKey()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySession(token, now = Date.now()) {
  if (!isConfigured() || typeof token !== 'string' || !token.includes('.')) return false;
  const dot = token.indexOf('.');
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac('sha256', sessionKey()).update(payload).digest('base64url');
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof data.exp === 'number' && data.exp > now;
  } catch {
    return false;
  }
}

export function readCookie(header, name = COOKIE) {
  if (!header) return '';
  for (const part of String(header).split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return '';
}

export function sessionCookie(value, { secure, maxAge = WEEK }) {
  const parts = [
    `${COOKIE}=${encodeURIComponent(value)}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

const failures = new Map();

export function resetRateLimit() {
  failures.clear();
}

export function rateLimited(ip, now = Date.now()) {
  const windowMs = 15 * 60 * 1000;
  const recent = (failures.get(ip) || []).filter((time) => now - time < windowMs);
  failures.set(ip, recent);
  return recent.length >= 8;
}

export function noteFailure(ip, now = Date.now()) {
  const recent = failures.get(ip) || [];
  recent.push(now);
  failures.set(ip, recent);
}
