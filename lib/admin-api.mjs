import {
  checkCredentials, isConfigured, noteFailure, rateLimited, readCookie, sessionCookie, signSession, verifySession,
} from './auth.mjs';
import { ContentError, normalizeContent } from './content.mjs';
import { loadRawContent, publishContent } from './publish.mjs';

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

export async function login(ctx) {
  if (!isConfigured()) {
    return json(503, { error: 'Вход не настроен. В настройках Vercel нужны ADMIN_LOGIN и ADMIN_PASSWORD.' });
  }
  if (ctx.method !== 'POST' || !sameOrigin(ctx.headers)) return json(403, { error: 'Запрос отклонён' });
  if (rateLimited(ctx.ip || 'unknown', ctx.now)) {
    return json(429, { error: 'Слишком много попыток. Подождите 15 минут.' });
  }
  if (!checkCredentials(ctx.body?.login, ctx.body?.password)) {
    noteFailure(ctx.ip || 'unknown', ctx.now);
    return json(401, { error: 'Неверный логин или пароль' });
  }
  return json(200, { ok: true }, {
    'Set-Cookie': sessionCookie(signSession(ctx.now), { secure: ctx.secure }),
  });
}

export async function logout(ctx) {
  if (ctx.method !== 'POST' || !sameOrigin(ctx.headers)) return json(403, { error: 'Запрос отклонён' });
  return json(200, { ok: true }, {
    'Set-Cookie': sessionCookie('', { secure: ctx.secure, maxAge: 0 }),
  });
}

export async function getContent(ctx) {
  if (!isConfigured()) {
    return json(503, { error: 'Админка не настроена: нужны ADMIN_LOGIN и ADMIN_PASSWORD.' });
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
    return json(503, { error: 'Админка не настроена: нужны ADMIN_LOGIN и ADMIN_PASSWORD. Изменения не сохранены.' });
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
    const saved = await deps.publish(content);
    return json(200, { ok: true, message: saved.message });
  } catch (error) {
    if (error.code === 'NO_STORE') {
      return json(503, { error: 'Сохранение на сервере не подключено: в проекте Vercel нет хранилища Blob. Изменения не сохранены.' });
    }
    return json(502, { error: 'Не удалось сохранить на сервере. Изменения не записаны.' });
  }
}
