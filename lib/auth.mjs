import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE = 'qc_admin';
const WEEK = 7 * 24 * 60 * 60;

export function isConfigured() {
  const password = process.env.ADMIN_PASSWORD;
  if (typeof password !== 'string') return false;
  const length = [...password].length;
  return length >= 8 && length <= 200;
}

export function checkPassword(input) {
  if (!isConfigured() || typeof input !== 'string') return false;
  const left = createHmac('sha256', 'qc-login').update(input).digest();
  const right = createHmac('sha256', 'qc-login').update(process.env.ADMIN_PASSWORD).digest();
  return timingSafeEqual(left, right);
}

export function signSession(now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ exp: now + WEEK * 1000 })).toString('base64url');
  const sig = createHmac('sha256', process.env.ADMIN_PASSWORD).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySession(token, now = Date.now()) {
  if (!isConfigured() || typeof token !== 'string' || !token.includes('.')) return false;
  const dot = token.indexOf('.');
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac('sha256', process.env.ADMIN_PASSWORD).update(payload).digest('base64url');
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
