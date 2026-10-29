import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

const COOKIE = 'qc_admin';
export const OTP_COOKIE_NAME = 'qc_otp';
const WEEK = 7 * 24 * 60 * 60;
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_TTL_SEC = 10 * 60;
export const OTP_ATTEMPT_LIMIT = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function passwordValue() {
  return typeof process.env.ADMIN_PASSWORD === 'string' ? process.env.ADMIN_PASSWORD : '';
}

function passwordConfigured() {
  const length = [...passwordValue()].length;
  return length >= 8 && length <= 200;
}

function loginConfigured() {
  const login = process.env.ADMIN_LOGIN;
  if (typeof login !== 'string') return false;
  const length = [...login].length;
  return length >= 3 && length <= 80 && !/\s/.test(login);
}

export function localMailAllowed() {
  return process.env.CMS_LOCAL_PUBLISH === '1' && process.env.VERCEL !== '1';
}

export function resendConfigured() {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  return typeof key === 'string' && key.length >= 8
    && typeof from === 'string' && from.includes('@') && from.length <= 200;
}

function mailConfigured() {
  const email = process.env.ADMIN_EMAIL;
  if (typeof email !== 'string' || email.length > 120 || !EMAIL_RE.test(email)) return false;
  if (resendConfigured()) return true;
  return localMailAllowed();
}

export function isConfigured() {
  return passwordConfigured() && loginConfigured() && mailConfigured();
}

export function setupMessage() {
  if (localMailAllowed()) {
    return 'Вход не настроен. Для локальной админки задайте ADMIN_LOGIN, ADMIN_PASSWORD и ADMIN_EMAIL.';
  }
  return 'Вход не настроен. Добавьте ADMIN_LOGIN, ADMIN_PASSWORD, ADMIN_EMAIL, RESEND_API_KEY и RESEND_FROM в настройках Vercel.';
}

function mac(label, value) {
  return createHmac('sha256', label).update(value).digest();
}

export function checkPassword(input) {
  if (!passwordConfigured() || typeof input !== 'string') return false;
  return timingSafeEqual(mac('qc-login', input), mac('qc-login', passwordValue()));
}

export function checkLogin(input) {
  if (!loginConfigured() || typeof input !== 'string') return false;
  return timingSafeEqual(mac('qc-login-name', input.trim()), mac('qc-login-name', process.env.ADMIN_LOGIN));
}

function signPayload(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', passwordValue()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function readPayload(token, now) {
  if (!passwordConfigured() || typeof token !== 'string' || !token.includes('.')) return null;
  const dot = token.indexOf('.');
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac('sha256', passwordValue()).update(payload).digest('base64url');
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data || typeof data.exp !== 'number' || data.exp <= now) return null;
    return data;
  } catch {
    return null;
  }
}

export function signSession(now = Date.now()) {
  return signPayload({ k: 's', exp: now + WEEK * 1000 });
}

export function verifySession(token, now = Date.now()) {
  const data = readPayload(token, now);
  return Boolean(data && data.k === 's');
}

export function createCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

function codeMac(code) {
  return createHmac('sha256', passwordValue()).update(`otp:${code}`).digest('base64url');
}

export function signOtp(code, now = Date.now()) {
  return signPayload({ k: 'o', exp: now + OTP_TTL_MS, iat: now, h: codeMac(code), t: 0 });
}

export function readOtp(token, now = Date.now()) {
  const data = readPayload(token, now);
  if (!data || data.k !== 'o') return null;
  if (typeof data.iat !== 'number' || typeof data.h !== 'string') return null;
  if (!Number.isInteger(data.t) || data.t < 0) return null;
  return data;
}

export function otpMatches(code, record) {
  if (!record || typeof code !== 'string' || !/^\d{6}$/.test(code)) return false;
  const left = Buffer.from(codeMac(code));
  const right = Buffer.from(record.h);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function bumpOtp(record) {
  return signPayload({ k: 'o', exp: record.exp, iat: record.iat, h: record.h, t: record.t + 1 });
}

export function maskEmail(email) {
  const at = String(email).indexOf('@');
  if (at <= 0) return '';
  return `${email.slice(0, 1)}***${email.slice(at)}`;
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

function writeCookie(name, value, { secure, maxAge }) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function sessionCookie(value, { secure, maxAge = WEEK }) {
  return writeCookie(COOKIE, value, { secure, maxAge });
}

export function otpCookie(value, { secure, maxAge = OTP_TTL_SEC }) {
  return writeCookie(OTP_COOKIE_NAME, value, { secure, maxAge });
}

const failures = new Map();
const sends = new Map();
const otpFailures = new Map();
const WINDOW_MS = 15 * 60 * 1000;

export function resetRateLimit() {
  failures.clear();
  sends.clear();
  otpFailures.clear();
}

function recent(map, ip, now) {
  const kept = (map.get(ip) || []).filter((time) => now - time < WINDOW_MS);
  map.set(ip, kept);
  return kept;
}

export function rateLimited(ip, now = Date.now()) {
  return recent(failures, ip, now).length >= 8;
}

export function noteFailure(ip, now = Date.now()) {
  recent(failures, ip, now).push(now);
}

export function sendLimited(ip, now = Date.now()) {
  return recent(sends, ip, now).length >= 5;
}

export function noteSend(ip, now = Date.now()) {
  recent(sends, ip, now).push(now);
}

export function otpFailureCount(hash, now = Date.now()) {
  const entry = otpFailures.get(hash);
  if (!entry || now - entry.at > OTP_TTL_MS) {
    otpFailures.delete(hash);
    return 0;
  }
  return entry.n;
}

export function noteOtpFailure(hash, now = Date.now()) {
  const n = otpFailureCount(hash, now) + 1;
  otpFailures.set(hash, { n, at: now });
  return n;
}

export function clearOtpFailures(hash) {
  otpFailures.delete(hash);
}
