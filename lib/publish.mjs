import fs from 'node:fs';
import path from 'node:path';
import { contentToJson } from './content.mjs';
import { projectRoot, renderPage, readTemplate } from './render.mjs';
import { blobConfigured, readStoredContent, writeStoredContent } from './store.mjs';

export function localPublishEnabled() {
  return process.env.CMS_LOCAL_PUBLISH === '1' && !process.env.VERCEL;
}

function readLocal(relativePath) {
  return fs.readFileSync(path.join(projectRoot(), relativePath), 'utf8');
}

function writeLocal(relativePath, content) {
  fs.writeFileSync(path.join(projectRoot(), relativePath), content);
}

export async function loadRawContent() {
  if (!localPublishEnabled() && blobConfigured()) {
    try {
      const raw = await readStoredContent();
      if (raw) return { raw, source: 'server' };
    } catch {
      return {
        raw: readLocal('content/site.json'),
        source: 'deploy',
        warning: 'Не удалось прочитать сохранённую версию. Показан текст из последней сборки.',
      };
    }
  }
  return {
    raw: readLocal('content/site.json'),
    source: localPublishEnabled() ? 'local' : 'deploy',
    warning: blobConfigured() || localPublishEnabled()
      ? null
      : 'Сохранение на сервере ещё не подключено. Сайт показывает тексты из последней сборки.',
  };
}

export async function publishContent(content, write = writeStoredContent) {
  const json = contentToJson(content);
  if (localPublishEnabled()) {
    const html = renderPage(content, readTemplate());
    writeLocal('content/site.json', json);
    writeLocal('index.html', html);
    const publicHtml = path.join(projectRoot(), 'public', 'index.html');
    if (fs.existsSync(path.dirname(publicHtml))) fs.writeFileSync(publicHtml, html);
    return { message: 'Сохранено. Обновите страницу сайта.' };
  }
  await write(json);
  return { message: 'Сохранено. Обновите страницу сайта — правка уже на сервере.' };
}

export async function renderLivePage() {
  const loaded = await loadRawContent();
  const { normalizeContent } = await import('./content.mjs');
  const content = normalizeContent(JSON.parse(loaded.raw));
  return renderPage(content, readTemplate());
}
