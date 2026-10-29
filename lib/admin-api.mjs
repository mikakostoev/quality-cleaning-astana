import {
  OTP_ATTEMPT_LIMIT, OTP_COOKIE_NAME, bumpOtp, checkLogin, checkPassword, clearOtpFailures, createCode,
  isConfigured, maskEmail, noteFailure, noteOtpFailure, noteSend, otpCookie, otpFailureCount, otpMatches,
  rateLimited, readCookie, readOtp, sendLimited, sessionCookie, setupMessage, signOtp, signSession, verifySession,
} from './auth.mjs';
import { ContentError, normalizeContent } from './content.mjs';
import { loadRawContent, publishContent } from './publish.mjs';
import { sendLoginCode } from './resend.mjs';

function json(status, body, headers = {}) {
  return { status, body, headers };
}

function sameOrigin(headers) {
  const origin = headers.origin;
  const host = headers['x-forwarded-host'] || headers.host;
  if (!origin || !host || headers['x-admin'] !== '1') return false;
  try {
    return new URL(origin).host === String(host).split(',')[0].trim();
  } catch {
    return false;
  }
}

function authed(ctx) {
  return verifySession(readCookie(ctx.headers.cookie), ctx.now);
}

const COOLDOWN_MS = 60 * 1000;

function clientIp(ctx) {
  return ctx.ip || 'unknown';
}

function normalizeCode(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, '');
}

function otpBody(sent) {
  return { ok: true, step: 'otp', sent, email: maskEmail(process.env.ADMIN_EMAIL) };
}

function clearOtp(ctx) {
  return otpCookie('', { secure: ctx.secure, maxAge: 0 });
}

function secondsLeft(exp, now) {
  return Math.max(0, Math.ceil((exp - now) / 1000));
}

async function issueCode(ctx, sendMail) {
  const ip = clientIp(ctx);
  if (sendLimited(ip, ctx.now)) {
    return json(429, { error: 'Слишком много кодов. Подождите 15 минут.' });
  }
  const code = createCode();
  try {
    await sendMail({ to: process.env.ADMIN_EMAIL, code });
  } catch {
    return json(502, { error: 'Не удалось отправить код. Попробуйте ещё раз.' });
  }
  noteSend(ip, ctx.now);
  return json(200, otpBody(true), {
    'Set-Cookie': otpCookie(signOtp(code, ctx.now), { secure: ctx.secure }),
  });
}

function verifyCode(ctx) {
  const ip = clientIp(ctx);
  const record = readOtp(readCookie(ctx.headers.cookie, OTP_COOKIE_NAME), ctx.now);
  if (!record) {
    return json(401, { error: 'Код устарел. Войдите заново.', step: 'credentials' }, { 'Set-Cookie': clearOtp(ctx) });
  }
  const code = normalizeCode(ctx.body?.code);
  const exhausted = otpFailureCount(record.h, ctx.now) >= OTP_ATTEMPT_LIMIT;
  if (exhausted || !otpMatches(code, record)) {
    noteFailure(ip, ctx.now);
    const attempts = exhausted ? OTP_ATTEMPT_LIMIT : noteOtpFailure(record.h, ctx.now);
    if (attempts >= OTP_ATTEMPT_LIMIT) {
      return json(401, {
        error: 'Слишком много попыток. Войдите заново.',
        step: 'credentials',
      }, { 'Set-Cookie': clearOtp(ctx) });
    }
    return json(401, { error: 'Неверный код' }, {
      'Set-Cookie': otpCookie(bumpOtp(record), { secure: ctx.secure, maxAge: secondsLeft(record.exp, ctx.now) }),
    });
  }
  clearOtpFailures(record.h);
  return json(200, { ok: true }, {
    'Set-Cookie': [
      sessionCookie(signSession(ctx.now), { secure: ctx.secure }),
      clearOtp(ctx),
    ],
  });
}

export async function login(ctx, deps = {}) {
  const sendMail = deps.sendMail || sendLoginCode;
  if (!isConfigured()) return json(503, { error: setupMessage() });
  if (ctx.method !== 'POST' || !sameOrigin(ctx.headers)) return json(403, { error: 'Запрос отклонён' });
  const ip = clientIp(ctx);
  if (rateLimited(ip, ctx.now)) {
    return json(429, { error: 'Слишком много попыток. Подождите 15 минут.' });
  }
  if (normalizeCode(ctx.body?.code)) return verifyCode(ctx);
  if (ctx.body?.resend === true) {
    const pending = readOtp(readCookie(ctx.headers.cookie, OTP_COOKIE_NAME), ctx.now);
    if (!pending) {
      return json(401, { error: 'Сначала введите логин и пароль.', step: 'credentials' });
    }
    if (ctx.now - pending.iat < COOLDOWN_MS) {
      return json(429, { error: 'Код уже отправлен. Подождите минуту.' });
    }
    return issueCode(ctx, sendMail);
  }
  const loginOk = checkLogin(ctx.body?.login);
  const passwordOk = checkPassword(ctx.body?.password);
  if (!loginOk || !passwordOk) {
    noteFailure(ip, ctx.now);
    return json(401, { error: 'Неверный логин или пароль' });
  }
  const pending = readOtp(readCookie(ctx.headers.cookie, OTP_COOKIE_NAME), ctx.now);
  if (pending && ctx.now - pending.iat < COOLDOWN_MS) return json(200, otpBody(false));
  return issueCode(ctx, sendMail);
}

export async function logout(ctx) {
  if (ctx.method !== 'POST' || !sameOrigin(ctx.headers)) return json(403, { error: 'Запрос отклонён' });
  return json(200, { ok: true }, {
    'Set-Cookie': [
      sessionCookie('', { secure: ctx.secure, maxAge: 0 }),
      otpCookie('', { secure: ctx.secure, maxAge: 0 }),
    ],
  });
}

export async function getContent(ctx) {
  if (!isConfigured()) {
    return json(503, { error: setupMessage() });
  }
  if (ctx.method !== 'GET') return json(405, { error: 'Метод не поддерживается' });
  if (!authed(ctx)) return json(401, { error: 'Нужно войти' });
  try {
    const loaded = await loadRawContent();
    const content = normalizeContent(JSON.parse(loaded.raw));
    return json(200, { content, source: loaded.source, warning: loaded.warning || null });
  } catch {
    return json(500, { error: 'Не удалось прочитать тексты сайта' });
  }
}

export async function putContent(ctx, deps = { publish: publishContent }) {
  if (!isConfigured()) {
    return json(503, { error: `${setupMessage()} Изменения не сохранены.` });
  }
  if (ctx.method !== 'PUT' || !sameOrigin(ctx.headers)) return json(403, { error: 'Запрос отклонён' });
  if (!authed(ctx)) return json(401, { error: 'Нужно войти' });
  let content;
  try {
    content = normalizeContent(ctx.body?.content);
  } catch (error) {
    if (error instanceof ContentError) return json(400, { error: 'Проверьте поля', fields: error.errors });
    return json(400, { error: 'Некорректные данные' });
  }
  try {
    const saved = await deps.publish(content, { uploads: ctx.body?.uploads });
    return json(200, { ok: true, message: saved.message });
  } catch (error) {
    if (error instanceof ContentError) return json(400, { error: 'Проверьте фото', fields: error.errors });
    if (error.code === 'NO_TOKEN') {
      return json(503, { error: 'Публикация не настроена: нет CMS_GITHUB_TOKEN. Изменения не сохранены.' });
    }
    if (error.code === 'CONFLICT') {
      return json(409, { error: 'Кто-то только что сохранил другую версию. Обновите страницу и внесите правку ещё раз.' });
    }
    if (error.status === 401 || error.status === 403) {
      return json(502, { error: 'GitHub не принял доступ. Проверьте CMS_GITHUB_TOKEN: нужны права на запись содержимого репозитория.' });
    }
    return json(502, { error: 'Не удалось опубликовать. Изменения не сохранены.' });
  }
}
