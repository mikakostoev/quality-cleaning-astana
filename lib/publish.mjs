import fs from 'node:fs';
import path from 'node:path';
import { contentToJson } from './content.mjs';
import { contentBranch, createGithub } from './github.mjs';
import { projectRoot, renderPage, readTemplate } from './render.mjs';

export function localPublishEnabled() {
  return process.env.CMS_LOCAL_PUBLISH === '1' && !process.env.VERCEL;
}

export function bumpSitemap(xml, isoDate) {
  if (!/<lastmod>[^<]+<\/lastmod>/.test(xml)) {
    throw Object.assign(new Error('sitemap'), { code: 'SITEMAP' });
  }
  return xml.replace(/<lastmod>[^<]+<\/lastmod>/, `<lastmod>${isoDate}</lastmod>`);
}

function readLocal(relativePath) {
  return fs.readFileSync(path.join(projectRoot(), relativePath), 'utf8');
}

function writeLocal(relativePath, content) {
  fs.writeFileSync(path.join(projectRoot(), relativePath), content);
}

export async function loadRawContent() {
  if (localPublishEnabled() || !process.env.CMS_GITHUB_TOKEN) {
    return { raw: readLocal('content/site.json'), source: localPublishEnabled() ? 'local' : 'deploy' };
  }
  try {
    const github = createGithub();
    const raw = await github.readFile('content/site.json', contentBranch());
    return { raw, source: 'github' };
  } catch {
    return {
      raw: readLocal('content/site.json'),
      source: 'deploy',
      warning: 'Не удалось прочитать последнюю версию. Показан текст, который сейчас открывается на сайте.',
    };
  }
}

export async function publishContent(content) {
  const json = contentToJson(content);
  const date = new Date().toISOString().slice(0, 10);
  if (localPublishEnabled()) {
    const html = renderPage(content, readTemplate());
    const sitemap = bumpSitemap(readLocal('sitemap.xml'), date);
    writeLocal('content/site.json', json);
    writeLocal('index.html', html);
    writeLocal('sitemap.xml', sitemap);
    return { sha: 'local', message: 'Сохранено на этом компьютере. Обновите страницу сайта.' };
  }
  if (!process.env.CMS_GITHUB_TOKEN) {
    throw Object.assign(new Error('no token'), { code: 'NO_TOKEN' });
  }
  const github = createGithub();
  const branch = contentBranch();
  const [template, sitemapRaw] = await Promise.all([
    github.readFile('templates/index.html', branch),
    github.readFile('sitemap.xml', branch),
  ]);
  const html = renderPage(content, template);
  const sitemap = bumpSitemap(sitemapRaw, date);
  const { sha } = await github.commit({
    branch,
    message: 'Обновление текстов и цен сайта',
    files: [
      { path: 'content/site.json', content: json },
      { path: 'index.html', content: html },
      { path: 'sitemap.xml', content: sitemap },
    ],
  });
  return { sha, message: 'Сохранено. Сайт обновится сам через одну-две минуты — потом обновите страницу.' };
}
